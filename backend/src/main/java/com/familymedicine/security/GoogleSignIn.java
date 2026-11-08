package com.familymedicine.security;

import com.familymedicine.domain.RuleViolation;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.Base64;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GoogleSignIn {
    public record Start(String authorizationUrl, String clientSecret) {}
    private record Attempt(boolean web, String verifier, String nonce) {}
    private static final String RANDOM_VALUE = "[A-Za-z0-9_-]{43}";
    private final SecureRandom random = new SecureRandom();
    private final JdbcClient db;
    private final GoogleOidc google;
    private final AuthService auth;
    private final AuthRateLimit limits;
    private final Clock clock;

    public GoogleSignIn(JdbcClient db, GoogleOidc google, AuthService auth, AuthRateLimit limits, Clock clock) {
        this.db = db;
        this.google = google;
        this.auth = auth;
        this.limits = limits;
        this.clock = clock;
    }

    public boolean available(boolean web) { return google.available(web); }

    public Start start(boolean web, String ip) {
        if (!available(web)) throw new RuleViolation("GOOGLE_UNAVAILABLE", "Google sign-in is unavailable.", 503);
        limits.consume("google-start:" + ip, 20, Duration.ofMinutes(10));
        String state = randomValue(), clientSecret = randomValue(), nonce = randomValue(), verifier = randomValue();
        var now = OffsetDateTime.now(clock);
        db.sql("DELETE FROM google_sign_ins WHERE expires_at<=:now").param("now", now).update();
        db.sql("""
            INSERT INTO google_sign_ins(state_hash,client_hash,nonce,verifier,web,expires_at)
            VALUES(:state,:client,:nonce,:verifier,:web,:expires)
            """).param("state", AuthService.digest(state)).param("client", AuthService.digest(clientSecret))
            .param("nonce", nonce).param("verifier", verifier).param("web", web).param("expires", now.plusMinutes(10)).update();
        return new Start(google.authorize(state, nonce, challenge(verifier)), clientSecret);
    }

    public URI callback(String state, String code) {
        if (state == null || !state.matches(RANDOM_VALUE)) throw invalid();
        String stateHash = AuthService.digest(state);
        int claimed = db.sql("""
            UPDATE google_sign_ins SET callback_started=TRUE
            WHERE state_hash=:state AND callback_started=FALSE AND expires_at>:now
            """).param("state", stateHash).param("now", OffsetDateTime.now(clock)).update();
        if (claimed != 1) throw invalid();
        var attempt = db.sql("""
            SELECT web,verifier,nonce FROM google_sign_ins
            WHERE state_hash=:state
            """).param("state", stateHash)
            .query((r,n) -> new Attempt(r.getBoolean(1), r.getString(2), r.getString(3))).optional().orElseThrow(GoogleSignIn::invalid);
        if (!available(attempt.web())) throw invalid();
        GoogleOidc.Identity identity;
        try {
            if (code == null || code.isBlank() || code.length() > 2048) throw invalid();
            identity = google.exchange(code, attempt.verifier(), attempt.nonce());
        } catch (RuleViolation e) {
            db.sql("DELETE FROM google_sign_ins WHERE state_hash=:state AND ticket_hash IS NULL")
                .param("state", stateHash).update();
            return google.returnTo(attempt.web(), "google_error=1");
        }
        String ticket = randomValue();
        var now = OffsetDateTime.now(clock);
        int updated = db.sql("""
            UPDATE google_sign_ins SET ticket_hash=:ticket,google_subject=:subject,email=:email,
                display_name=:name,expires_at=:expiry
            WHERE state_hash=:state AND ticket_hash IS NULL AND expires_at>:now
            """).param("ticket", AuthService.digest(ticket)).param("subject", identity.subject())
            .param("email", identity.email()).param("name", identity.name()).param("expiry", now.plusMinutes(2))
            .param("state", stateHash).param("now", now).update();
        if (updated != 1) throw invalid();
        // The browser receives the ticket; only the initiating app has the separate client secret.
        return google.returnTo(attempt.web(), "google_ticket=" + ticket);
    }

    @Transactional
    public AuthService.Session complete(String ticket, String clientSecret) {
        String hash = AuthService.digest(ticket);
        var identity = db.sql("""
            SELECT google_subject,email,display_name FROM google_sign_ins
            WHERE ticket_hash=:ticket AND client_hash=:client AND expires_at>:now FOR UPDATE
            """).param("ticket", hash).param("client", AuthService.digest(clientSecret))
            .param("now", OffsetDateTime.now(clock))
            .query((r,n) -> new GoogleOidc.Identity(r.getString(1), r.getString(2), r.getString(3)))
            .optional().orElseThrow(GoogleSignIn::invalid);
        var session = auth.loginGoogle(identity);
        db.sql("DELETE FROM google_sign_ins WHERE ticket_hash=:ticket").param("ticket", hash).update();
        return session;
    }

    private String randomValue() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String challenge(String verifier) {
        try {
            return Base64.getUrlEncoder().withoutPadding().encodeToString(
                MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private static RuleViolation invalid() {
        return new RuleViolation("GOOGLE_AUTH_FAILED", "Google sign-in expired or could not be verified. Start again.", 401);
    }
}
