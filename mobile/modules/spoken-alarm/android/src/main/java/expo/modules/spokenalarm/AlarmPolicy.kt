package expo.modules.spokenalarm

object AlarmPolicy {
  const val MAX_LATE_MS = 60_000L
  const val DURATION_MS = 30_000L
  fun fresh(dueAt: Long, now: Long) = now >= dueAt && now - dueAt < MAX_LATE_MS
}
