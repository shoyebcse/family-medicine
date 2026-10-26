package com.familymedicine.prescription;

import com.familymedicine.domain.RuleViolation;

public class StalePrescription extends RuleViolation {
    private final int currentVersion;
    public StalePrescription(int currentVersion) {
        super("STALE_PRESCRIPTION","The prescription changed. Refresh, review the current version, and submit again.",409);
        this.currentVersion=currentVersion;
    }
    public int currentVersion() { return currentVersion; }
}
