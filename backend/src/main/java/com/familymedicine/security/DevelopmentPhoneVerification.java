package com.familymedicine.security;

import java.security.*;
import java.time.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** Local test identities only: NEVER sends SMS and NEVER establishes phone ownership. */
@Component
@Profile("test")
public class DevelopmentPhoneVerification implements PhoneVerification {
    private record Code(String digest, String value, Instant expires) {}
    private final ConcurrentHashMap<String,Code> codes = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();
    private final Clock clock;
    public DevelopmentPhoneVerification(Clock clock) { this.clock = clock; }
    public boolean available() { return true; }
    public boolean verifiesOwnership() { return false; }
    public void send(String phone) {
        codes.entrySet().removeIf(entry -> !entry.getValue().expires().isAfter(clock.instant()));
        String value = String.format("%06d", random.nextInt(1000000));
        codes.put(phone, new Code(AuthService.digest(value), value, clock.instant().plusSeconds(300)));
    }
    public String developmentCode(String phone) {
        var code = codes.get(phone);
        return code == null ? null : code.value();
    }
    public boolean verify(String phone, String value) {
        var code = codes.get(phone);
        if (code == null || !code.expires().isAfter(clock.instant()) ||
            !MessageDigest.isEqual(code.digest().getBytes(java.nio.charset.StandardCharsets.UTF_8),
                AuthService.digest(value).getBytes(java.nio.charset.StandardCharsets.UTF_8))) return false;
        return codes.remove(phone, code);
    }
}
