package expo.modules.spokenalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import androidx.core.app.NotificationManagerCompat

class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val key = intent.getStringExtra("key") ?: return
    val token = intent.getStringExtra("token") ?: return
    try {
      if (!AlarmScheduler.enabled(context)) return
      if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
        SpokenAlarmService.failure(context); return
      }
      if (android.os.Build.VERSION.SDK_INT >= 26 &&
          context.getSystemService(android.app.NotificationManager::class.java)
            .getNotificationChannel("spoken-medicine-alarms-v1")?.importance == android.app.NotificationManager.IMPORTANCE_NONE) return
      val record = AlarmStore.read(context).find { it.key == key && it.token == token } ?: return
      if (!AlarmPolicy.fresh(record.dueAt, System.currentTimeMillis())) return
      ContextCompat.startForegroundService(context, Intent(context, SpokenAlarmService::class.java)
        .putExtra("key", key).putExtra("token", token))
    } catch (_: Exception) {
      // Generic notification remains actionable; never log the medical payload.
      SpokenAlarmService.failure(context)
    }
  }
}

class RestoreReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action !in setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED,
        Intent.ACTION_TIME_CHANGED, "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED")) return
    // Re-register only; never start an audio foreground service from boot.
    try { AlarmScheduler.restore(context) } catch (_: Exception) { SpokenAlarmService.failure(context) }
  }
}
