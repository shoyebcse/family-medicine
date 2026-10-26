package com.familymedicine.security;

import com.familymedicine.domain.RuleViolation;
import java.time.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthRateLimit {
    private final JdbcClient db;
    private final Clock clock;
    public AuthRateLimit(JdbcClient db, Clock clock) { this.db = db; this.clock = clock; }

    /** Attempts must survive a failed login/verification transaction. Keys contain no raw identifiers. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void consume(String key, int maximum, Duration window) {
        var now = OffsetDateTime.now(clock);
        String hash = AuthService.digest(key);
        db.sql("INSERT INTO auth_limits(bucket_key,window_start,attempts) VALUES(:key,:now,0) ON CONFLICT DO NOTHING")
            .param("key", hash).param("now", now).update();
        var row = db.sql("SELECT window_start,attempts FROM auth_limits WHERE bucket_key=:key FOR UPDATE")
            .param("key", hash).query((r, n) -> new Bucket(r.getObject(1, OffsetDateTime.class), r.getInt(2))).single();
        int attempts = row.start().plus(window).isAfter(now) ? row.attempts() : 0;
        if (attempts >= maximum) throw new RuleViolation("TOO_MANY_ATTEMPTS", "Too many attempts. Wait before trying again.", 429);
        db.sql("UPDATE auth_limits SET attempts=:attempts,window_start=:start WHERE bucket_key=:key")
            .param("attempts", attempts + 1).param("start", attempts == 0 ? now : row.start()).param("key", hash).update();
    }
    private record Bucket(OffsetDateTime start, int attempts) {}
}
