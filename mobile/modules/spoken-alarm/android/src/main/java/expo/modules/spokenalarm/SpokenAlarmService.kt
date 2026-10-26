package expo.modules.spokenalarm

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.*
import android.os.*
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.util.UUID

class SpokenAlarmService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val records = java.util.concurrent.ConcurrentHashMap<String, AlarmRecord>()
  private val pending = mutableSetOf<String>()
  private var engine: TextToSpeech? = null
  private var ready = false
  private var ended = false
  private var started = false
  private var ringtone: Ringtone? = null
  private var wake: PowerManager.WakeLock? = null
  private var focus: AudioFocusRequest? = null
  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    if (change < 0) handler.post { stopSelf() }
  }
  private val repeat = Runnable { play() }
  private val cutoff = Runnable { stopSelf() }
  private val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    running = this
    channels(this)
    val notification = notification(this)
    if (Build.VERSION.SDK_INT >= 29) startForeground(ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    else startForeground(ID, notification)
    wake = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:spokenAlarm")
      .apply { acquire(AlarmPolicy.DURATION_MS + 5000) }
    handler.postDelayed(cutoff, AlarmPolicy.DURATION_MS)
    val audio = getSystemService(AudioManager::class.java)
    if (Build.VERSION.SDK_INT >= 26) {
      focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attributes)
        .setOnAudioFocusChangeListener(focusListener).build()
      if (audio.requestAudioFocus(focus!!) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
        failure(this); stopSelf(); return
      }
    } else {
      @Suppress("DEPRECATION")
      val result = audio.requestAudioFocus(focusListener, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
      if (result != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { failure(this); stopSelf(); return }
    }
    handler.postDelayed({ if (!ready && !ended) fallback() }, 3000)
    engine = TextToSpeech(applicationContext) { status ->
      handler.post {
        if (ended) return@post
        val tts = engine
        if (status != TextToSpeech.SUCCESS || tts == null) { fallback(); return@post }
        tts.setAudioAttributes(attributes)
        tts.setSpeechRate(0.9f)
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
          override fun onStart(id: String?) {}
          override fun onDone(id: String?) { handler.post { complete(id, false) } }
          @Deprecated("Android callback") override fun onError(id: String?) { handler.post { complete(id, true) } }
        })
        ready = true
        ringtone?.stop()
        ringtone = null
        play()
      }
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == DISMISS) { stopSelf(); return START_NOT_STICKY }
    val key = intent?.getStringExtra("key")
    val token = intent?.getStringExtra("token")
    if (key == null || token == null) { if (!started) stopSelf(); return START_NOT_STICKY }
    val record = try { AlarmStore.take(this, key, token) } catch (_: Exception) { null }
    if (record == null) { if (!started) stopSelf(); return START_NOT_STICKY }
    records[key] = record
    started = true
    sendBroadcast(Intent(FIRED).setPackage(packageName).putExtra("key", key).putExtra("test", record.test))
    if (ready) {
      if (pending.isNotEmpty()) enqueue(listOf(record))
      else {
        handler.removeCallbacks(repeat)
        handler.postDelayed(repeat, 200)
      }
    }
    return START_NOT_STICKY
  }

  private fun play() {
    if (ended || !ready || records.isEmpty() || pending.isNotEmpty()) return
    enqueue(records.values.toList())
  }

  private fun enqueue(batch: List<AlarmRecord>) {
    val utterances = batch.map { UUID.randomUUID().toString() to it }
    pending.addAll(utterances.map { it.first })
    for ((id, record) in utterances) {
      val language=if(record.language=="hi-IN") "hi" else "en"
      val voice=engine?.voices?.filter { !it.isNetworkConnectionRequired && it.locale.language==language }
        ?.sortedBy { if(it.locale.country=="IN") 0 else 1 }?.firstOrNull()
      if(voice==null || engine?.setVoice(voice)!=TextToSpeech.SUCCESS) { pending.clear(); fallback(); return }
      if (engine?.speak(record.message, TextToSpeech.QUEUE_ADD, Bundle(), id) != TextToSpeech.SUCCESS) {
        pending.clear(); fallback(); return
      }
    }
  }

  private fun complete(id: String?, failed: Boolean) {
    if (id == null || ended || !pending.remove(id)) return
    if (failed) { pending.clear(); fallback(); return }
    if (pending.isEmpty()) handler.postDelayed(repeat, 5000)
  }

  private fun fallback() {
    if (ended) return
    ready = false
    engine?.stop()
    pending.clear()
    handler.removeCallbacks(repeat)
    failure(this)
    try {
      if (ringtone == null) ringtone = RingtoneManager.getRingtone(this, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
      ringtone?.audioAttributes = attributes
      if (Build.VERSION.SDK_INT >= 28) ringtone?.isLooping = true
      ringtone?.play()
    } catch (_: Exception) { /* Notification remains visible when audio is unavailable. */ }
  }

  private fun remove(key: String) {
    if (records.remove(key) == null) return
    engine?.stop(); pending.clear(); handler.removeCallbacks(repeat)
    if (records.isEmpty()) stopSelf() else handler.postDelayed(repeat, 200)
  }

  override fun onDestroy() {
    ended = true
    if (running === this) running = null
    handler.removeCallbacksAndMessages(null)
    engine?.stop(); engine?.shutdown(); engine = null
    ringtone?.stop(); ringtone = null
    if (wake?.isHeld == true) wake?.release()
    if (Build.VERSION.SDK_INT >= 26) focus?.let { getSystemService(AudioManager::class.java).abandonAudioFocusRequest(it) }
    else {
      @Suppress("DEPRECATION")
      getSystemService(AudioManager::class.java).abandonAudioFocus(focusListener)
    }
    records.clear(); pending.clear()
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  companion object {
    const val FIRED = "expo.modules.spokenalarm.FIRED"
    private const val DISMISS = "expo.modules.spokenalarm.DISMISS"
    private const val CHANNEL = "spoken-medicine-alarms-v1"
    private const val ID = 7341
    @Volatile private var running: SpokenAlarmService? = null
    fun activeRecords(): List<AlarmRecord> = running?.records?.values?.toList() ?: emptyList()
    fun cancel(context: Context, key: String) { running?.handler?.post { running?.remove(key) } }
    fun dismiss(context: Context) { context.stopService(Intent(context, SpokenAlarmService::class.java)) }
    fun channels(context: Context) {
      if (Build.VERSION.SDK_INT >= 26) context.getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(CHANNEL, "Spoken medicine alarms", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Medicine alarms that speak names aloud"; setSound(null, null); lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        })
    }
    fun clearFailure(context: Context) {
      context.getSharedPreferences("spoken-alarm-status", Context.MODE_PRIVATE).edit().clear().apply()
      NotificationManagerCompat.from(context).cancel(ID + 1)
    }
    private fun notification(context: Context): Notification {
      val dismiss = PendingIntent.getService(context, 1, Intent(context, SpokenAlarmService::class.java).setAction(DISMISS),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      val open = PendingIntent.getActivity(context, 2, context.packageManager.getLaunchIntentForPackage(context.packageName)!!,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      return NotificationCompat.Builder(context, CHANNEL).setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
        .setContentTitle("Medicine reminder").setContentText("A reminder is due. Tap Dismiss to stop the alarm.")
        .setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
        .setCategory(NotificationCompat.CATEGORY_ALARM).addAction(android.R.drawable.ic_menu_close_clear_cancel, "Dismiss", dismiss).build()
    }
    fun failure(context: Context) {
      context.getSharedPreferences("spoken-alarm-status", Context.MODE_PRIVATE).edit().putBoolean("audioFailure", true).apply()
      try {
        channels(context)
        NotificationManagerCompat.from(context).notify(ID + 1,
          NotificationCompat.Builder(context, CHANNEL).setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("Check medicine reminders").setContentText("A spoken alarm needs attention. Open Settings in the app.")
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).build())
      } catch (_: SecurityException) { /* Notification permission was revoked. */ }
    }
  }
}
