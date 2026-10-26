package expo.modules.spokenalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import java.util.UUID

object AlarmScheduler {
  fun manager(context: Context) = context.getSystemService(AlarmManager::class.java)
  fun allowed(context: Context) = Build.VERSION.SDK_INT < 31 || manager(context).canScheduleExactAlarms()
  private fun pending(context: Context, record: AlarmRecord): PendingIntent = PendingIntent.getBroadcast(
    context, 0, Intent(context, AlarmReceiver::class.java).setData(Uri.parse("family-medicine://alarm/${Uri.encode(record.key)}"))
      .putExtra("key", record.key).putExtra("token", record.token), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  fun register(context: Context, record: AlarmRecord) {
    check(allowed(context)) { "Allow Alarms & reminders in Android settings." }
    val show = PendingIntent.getActivity(context, 0, context.packageManager.getLaunchIntentForPackage(context.packageName)!!,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    manager(context).setAlarmClock(AlarmManager.AlarmClockInfo(record.dueAt, show), pending(context, record))
  }
  @Synchronized fun schedule(context: Context, key: String, dueAt: Long, message: String, test: Boolean, language: String = "en-IN") = synchronized(AlarmStore) {
    require(language=="en-IN" || language=="hi-IN")
    require(key.startsWith("family-medicine:dose:") || key.startsWith("family-medicine:test:"))
    require(dueAt > System.currentTimeMillis() && message.isNotBlank() && message.length <= 3000)
    check(allowed(context)) { "Allow Alarms & reminders in Android settings." }
    val previous = AlarmStore.read(context)
    check(enabled(context)) { "Enable spoken alarms before scheduling." }
    val record = AlarmRecord(key, dueAt, message, UUID.randomUUID().toString(), test,language)
    AlarmStore.write(context, previous.filterNot { it.key == key } + record)
    try { register(context, record) }
    catch (error: Exception) {
      AlarmStore.write(context, previous.filterNot { it.key == key })
      throw error
    }
  }
  @Synchronized fun cancel(context: Context, key: String) = synchronized(AlarmStore) {
    val records = AlarmStore.read(context)
    records.find { it.key == key }?.let { manager(context).cancel(pending(context, it)) }
    AlarmStore.write(context, records.filterNot { it.key == key })
    SpokenAlarmService.cancel(context, key)
  }
  private fun optin(context: Context) = android.util.AtomicFile(java.io.File(context.noBackupFilesDir, "spoken-alarm-optin"))
  fun enabled(context: Context) = optin(context).baseFile.exists() && String(optin(context).readFully(), Charsets.UTF_8) == "true"
  @Synchronized fun setEnabled(context: Context, enabled: Boolean) = synchronized(AlarmStore) {
    val atomic = optin(context)
    val stream = atomic.startWrite()
    try { stream.write(enabled.toString().toByteArray(Charsets.UTF_8)); atomic.finishWrite(stream) }
    catch (error: Exception) { atomic.failWrite(stream); throw error }
    if (!enabled) {
      SpokenAlarmService.dismiss(context)
      val records = try { AlarmStore.read(context) } catch (_: Exception) { emptyList() }
      records.forEach { manager(context).cancel(pending(context, it)) }
      AlarmStore.clear(context)
    }
  }
  @Synchronized fun restore(context: Context) = synchronized(AlarmStore) {
    if (!allowed(context) || !enabled(context)) return@synchronized
    val future = AlarmStore.read(context).filter { it.dueAt > System.currentTimeMillis() }
    AlarmStore.write(context, future)
    future.forEach { register(context, it) }
  }
}
