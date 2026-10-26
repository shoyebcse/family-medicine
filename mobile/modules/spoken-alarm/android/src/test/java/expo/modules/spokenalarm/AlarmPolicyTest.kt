package expo.modules.spokenalarm

import org.junit.Assert.*
import org.junit.Test

class AlarmPolicyTest {
  @Test fun onlyFreshDueAlarmsCanStartAudio() {
    assertFalse(AlarmPolicy.fresh(1000, 999))
    assertTrue(AlarmPolicy.fresh(1000, 1000))
    assertTrue(AlarmPolicy.fresh(1000, 60999))
    assertFalse(AlarmPolicy.fresh(1000, 61000))
  }
}
