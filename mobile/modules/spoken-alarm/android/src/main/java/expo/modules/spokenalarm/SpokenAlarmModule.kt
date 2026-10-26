package expo.modules.spokenalarm

import android.app.NotificationManager
import android.content.*
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SpokenAlarmModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext)
  private var receiver: BroadcastReceiver? = null
  private var registeredContext: Context? = null
  override fun definition() = ModuleDefinition {
    Name("SpokenAlarm")
    Events("alarm")
    OnCreate {
      registeredContext = context
      try { AlarmScheduler.restore(context) } catch (_: Exception) { SpokenAlarmService.failure(context) }
      receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          sendEvent("alarm", mapOf("key" to intent.getStringExtra("key"), "test" to intent.getBooleanExtra("test", false)))
        }
      }
      ContextCompat.registerReceiver(context, receiver, IntentFilter(SpokenAlarmService.FIRED), ContextCompat.RECEIVER_NOT_EXPORTED)
    }
    OnDestroy { receiver?.let { registeredContext?.unregisterReceiver(it) }; receiver = null; registeredContext = null }
    AsyncFunction("inspect") {
      SpokenAlarmService.channels(context)
      val manager = context.getSystemService(NotificationManager::class.java)
      val channel = if (Build.VERSION.SDK_INT >= 26) manager.getNotificationChannel("spoken-medicine-alarms-v1") else null
      mapOf("exactAlarm" to AlarmScheduler.allowed(context), "enabled" to AlarmScheduler.enabled(context),
        "notifications" to NotificationManagerCompat.from(context).areNotificationsEnabled(),
        "channelEnabled" to (channel == null || channel.importance != NotificationManager.IMPORTANCE_NONE),
        "audioFailure" to context.getSharedPreferences("spoken-alarm-status", Context.MODE_PRIVATE).getBoolean("audioFailure", false))
    }
    AsyncFunction("schedule") { key: String, dueAt: Double, message: String, test: Boolean ->
      AlarmScheduler.schedule(context, key, dueAt.toLong(), message, test)
    }
    AsyncFunction("scheduleInLanguage") { key: String, dueAt: Double, message: String, test: Boolean, language: String ->
      AlarmScheduler.schedule(context,key,dueAt.toLong(),message,test,language)
    }
    AsyncFunction("list") {
      (AlarmStore.read(context) + SpokenAlarmService.activeRecords()).distinctBy { it.key }
        .map { mapOf("key" to it.key, "dueAt" to it.dueAt.toDouble(), "message" to it.message) }
    }
    AsyncFunction("cancel") { key: String -> AlarmScheduler.cancel(context, key) }
    AsyncFunction("setEnabled") { enabled: Boolean -> AlarmScheduler.setEnabled(context, enabled) }
    AsyncFunction("dismiss") { SpokenAlarmService.dismiss(context) }
    AsyncFunction("clearError") {
      SpokenAlarmService.clearFailure(context)
    }
  }
}
