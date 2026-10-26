package com.familymedicine.domain;

public class RuleViolation extends RuntimeException {
    private final String code;
    private final int status;
    public RuleViolation(String code, String message) { this(code,message,422); }
    public RuleViolation(String code, String message, int status) { super(message); this.code=code; this.status=status; }
    public String code() { return code; }
    public int status() { return status; }
}
