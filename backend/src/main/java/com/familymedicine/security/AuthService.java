package com.familymedicine.security;

import com.familymedicine.domain.RuleViolation;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    public record Account(UUID id, String displayName, String email, boolean emailVerified, String phone, boolean phoneVerified) {}
    public record Session(String token, Instant expiresAt, Account account) {}
    public record Challenge(UUID challengeId, Instant expiresAt, String developmentCode) {}
    private final JdbcClient db;
    private final Clock clock;
    private final AuthRateLimit limits;
    private final PhoneVerification phone;
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(12);
    private final String dummyHash = passwords.encode("unmatched-dummy-password");
    private final SecureRandom random = new SecureRandom();
    public AuthService(JdbcClient db, Clock clock, AuthRateLimit limits, PhoneVerification phone) {
        this.db = db; this.clock = clock; this.limits = limits; this.phone = phone;
    }
    public boolean phoneAvailable() { return phone.available(); }
    public static String digest(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    private OffsetDateTime now() { return OffsetDateTime.now(clock); }
    private String email(String email) { return email.strip().toLowerCase(Locale.ROOT); }
    private void password(String value) {
        if (value.length() < 12 || value.getBytes(StandardCharsets.UTF_8).length > 72)
            throw new RuleViolation("PASSWORD_POLICY", "Use at least 12 characters and no more than 72 UTF-8 bytes.");
    }
    @Transactional
    public Session register(String name, String email, String password, String ip) {
        limits.consume("register:" + ip, 20, Duration.ofHours(1));
        password(password);
        UUID id = UUID.randomUUID();
        db.sql("INSERT INTO accounts(id,display_name,email,password_hash,created_at) VALUES(:id,:name,:email,:hash,:now)")
            .param("id", id).param("name", name.strip()).param("email", email(email))
            .param("hash", passwords.encode(password)).param("now", now()).update();
        return issue(id);
    }
    public Session login(String email, String password, String ip) {
        String normalized = email(email);
        limits.consume("login-ip:" + ip, 100, Duration.ofMinutes(15));
        limits.consume("login:" + ip + ":" + normalized, 10, Duration.ofMinutes(15));
        var account = db.sql("SELECT id,password_hash FROM accounts WHERE email=:email").param("email", normalized)
            .query((r,n) -> Map.entry(r.getObject(1, UUID.class), r.getString(2))).optional();
        boolean matches = password.getBytes(StandardCharsets.UTF_8).length <= 72 &&
            passwords.matches(password, account.map(Map.Entry::getValue).orElse(dummyHash));
        if (!matches || account.isEmpty()) throw new RuleViolation("INVALID_CREDENTIALS", "Email or password is incorrect.", 401);
        return issue(account.get().getKey());
    }
    public Challenge startPhone(String number, String ip) {
        if (!phone.available()) throw new RuleViolation("PHONE_UNAVAILABLE", "Phone sign-in is unavailable. Use email/password.", 503);
        limits.consume("sms-phone:" + number, 3, Duration.ofMinutes(10));
        limits.consume("sms-ip:" + ip, 10, Duration.ofHours(1));
        phone.send(number);
        UUID id = UUID.randomUUID();
        var expiry = now().plusMinutes(5);
        db.sql("INSERT INTO phone_challenges(id,phone,expires_at) VALUES(:id,:phone,:expiry)")
            .param("id",id).param("phone",number).param("expiry",expiry).update();
        return new Challenge(id, expiry.toInstant(), phone.developmentCode(number));
    }
    @Transactional(noRollbackFor = RuleViolation.class)
    public Session verifyPhone(UUID challengeId, String code, String name, String ip) {
        if (name == null || name.isBlank()) throw new RuleViolation("NAME_REQUIRED", "Enter your name to continue.");
        limits.consume("sms-verify:" + ip + ":" + challengeId, 5, Duration.ofMinutes(10));
        var challenge = db.sql("SELECT phone,expires_at,attempts,consumed FROM phone_challenges WHERE id=:id FOR UPDATE")
            .param("id",challengeId).query((r,n) -> new PhoneChallenge(r.getString(1),r.getObject(2,OffsetDateTime.class),r.getInt(3),r.getBoolean(4))).optional();
        if (challenge.isEmpty() || challenge.get().consumed() || !challenge.get().expires().isAfter(now()) || challenge.get().attempts() >= 5)
            throw new RuleViolation("INVALID_OTP", "Code expired or no longer valid. Request a new code.", 401);
        var current = challenge.get();
        db.sql("UPDATE phone_challenges SET attempts=attempts+1 WHERE id=:id").param("id",challengeId).update();
        if (!phone.verify(current.phone(),code)) throw new RuleViolation("INVALID_OTP", "The verification code is incorrect.",401);
        var existing = db.sql("SELECT id FROM accounts WHERE phone=:phone")
            .param("phone",current.phone()).query(UUID.class).optional();
        if (existing.isPresent() && !phone.verifiesOwnership() && account(existing.get()).phoneVerified())
            throw new RuleViolation("DEVELOPMENT_IDENTITY_ONLY", "Development codes cannot sign in to a verified phone account.", 403);
        UUID id = existing.orElseGet(UUID::randomUUID);
        if (existing.isEmpty()) {
            if (name == null || name.isBlank()) throw new RuleViolation("NAME_REQUIRED", "Enter your name to create your phone account.");
            db.sql("INSERT INTO accounts(id,display_name,phone,phone_verified,created_at) VALUES(:id,:name,:phone,:verified,:now)")
                .param("id",id).param("name",name.strip()).param("phone",current.phone()).param("verified",phone.verifiesOwnership()).param("now",now()).update();
        } else if (phone.verifiesOwnership()) {
            db.sql("UPDATE accounts SET phone_verified=TRUE WHERE id=:id").param("id",id).update();
        }
        db.sql("UPDATE phone_challenges SET consumed=TRUE WHERE id=:id").param("id",challengeId).update();
        return issue(id);
    }
    private record PhoneChallenge(String phone, OffsetDateTime expires, int attempts, boolean consumed) {}
    public Account account(UUID id) {
        return db.sql("SELECT id,display_name,email,email_verified,phone,phone_verified FROM accounts WHERE id=:id")
            .param("id",id).query((r,n) -> new Account(r.getObject(1,UUID.class),r.getString(2),r.getString(3),r.getBoolean(4),r.getString(5),r.getBoolean(6)))
            .optional().orElseThrow(() -> new RuleViolation("AUTHENTICATION_REQUIRED", "Sign in is required.",401));
    }
    private Session issue(UUID account) {
        byte[] bytes = new byte[32]; random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        var expiry = now().plusHours(12);
        db.sql("INSERT INTO auth_sessions(token_hash,account_id,expires_at) VALUES(:hash,:id,:expiry)")
            .param("hash",digest(token)).param("id",account).param("expiry",expiry).update();
        return new Session(token,expiry.toInstant(),account(account));
    }
    public Optional<UUID> authenticate(String token) {
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) return Optional.empty();
        return db.sql("SELECT account_id FROM auth_sessions WHERE token_hash=:hash AND expires_at>:now")
            .param("hash",digest(token)).param("now",now()).query(UUID.class).optional();
    }
    public void logout(String token) {
        db.sql("DELETE FROM auth_sessions WHERE token_hash=:hash").param("hash",digest(token)).update();
    }
}
