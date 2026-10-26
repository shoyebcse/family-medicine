package com.familymedicine.security;

public interface PhoneVerification {
    boolean available();
    void send(String phone);
    boolean verify(String phone, String code);
    default String developmentCode(String phone) { return null; }
    default boolean verifiesOwnership() { return true; }
}
