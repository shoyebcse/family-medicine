package com.familymedicine.domain;

import java.time.*;
import java.util.*;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Both the profile owner and matching phone account must explicitly agree to one-profile access. */
@Service
public class FamilyAccessService {
    public record Invitation(UUID memberId, String memberName, String invitedBy, Instant expiresAt) {}
    private final JdbcClient db;
    private final Clock clock;
    private final boolean development;
    public FamilyAccessService(JdbcClient db, Clock clock, Environment environment) {
        this.db=db; this.clock=clock; this.development=environment.matchesProfiles("dev","test");
    }
    private String phone(UUID actor) {
        return db.sql("SELECT phone FROM accounts WHERE id=:actor AND phone IS NOT NULL AND (phone_verified=TRUE OR :development=TRUE)")
            .param("actor",actor).param("development",development).query(String.class).optional().orElse(null);
    }
    public List<Invitation> invitations(UUID actor) {
        String phone=phone(actor);
        if(phone==null) return List.of();
        return db.sql("""
            SELECT m.id,m.name,a.display_name,m.invite_expires_at FROM members m
            JOIN accounts a ON a.id=m.owner_id
            WHERE m.phone=:phone AND m.owner_id<>:actor AND m.link_state='PENDING' AND m.invite_expires_at>:now
            ORDER BY m.created_at,m.id
            """).param("phone",phone).param("actor",actor).param("now",OffsetDateTime.now(clock))
            .query((r,n)->new Invitation(r.getObject(1,UUID.class),r.getString(2),r.getString(3),r.getObject(4,OffsetDateTime.class).toInstant())).list();
    }
    @Transactional
    public void decide(UUID actor, UUID memberId, boolean accept) {
        String phone=phone(actor);
        if(phone==null) throw unavailable();
        var state=db.sql("""
            SELECT link_state FROM members WHERE id=:id AND phone=:phone AND owner_id<>:actor
            AND invite_expires_at>:now FOR UPDATE
            """).param("id",memberId).param("phone",phone).param("actor",actor).param("now",OffsetDateTime.now(clock))
            .query(String.class).optional().orElseThrow(FamilyAccessService::unavailable);
        if(state.equals(accept?"AWAITING":"DECLINED") || (accept && state.equals("ACCEPTED"))) return;
        if(!state.equals("PENDING")) throw unavailable();
        db.sql("UPDATE members SET link_state=:state,linked_account_id=:account WHERE id=:id")
            .param("state",accept?"AWAITING":"DECLINED").param("account",accept?actor:null).param("id",memberId).update();
        audit(actor,memberId,accept?"RECIPIENT_ACCEPTED":"DECLINED");
    }
    @Transactional
    public void approve(UUID actor, UUID memberId) {
        String state=db.sql("SELECT link_state FROM members WHERE id=:id AND owner_id=:actor FOR UPDATE")
            .param("id",memberId).param("actor",actor).query(String.class).optional().orElseThrow(FamilyAccessService::unavailable);
        if(state.equals("ACCEPTED")) return;
        int changed=db.sql("""
            UPDATE members SET link_state='ACCEPTED' WHERE id=:id AND owner_id=:actor
            AND linked_account_id IS NOT NULL AND link_state='AWAITING' AND invite_expires_at>:now
            """).param("id",memberId).param("actor",actor).param("now",OffsetDateTime.now(clock)).update();
        if(changed==0) throw unavailable();
        audit(actor,memberId,"OWNER_APPROVED");
    }
    @Transactional
    public void revoke(UUID actor, UUID memberId) {
        int changed=db.sql("""
            UPDATE members SET linked_account_id=NULL,link_state='REVOKED',invite_expires_at=NULL
            WHERE id=:id AND (owner_id=:actor OR linked_account_id=:actor)
            """).param("id",memberId).param("actor",actor).update();
        if(changed==0) throw unavailable();
        audit(actor,memberId,"REVOKED");
    }
    private void audit(UUID actor,UUID member,String action) {
        db.sql("INSERT INTO family_access_events(id,member_id,actor_id,action,recorded_at) VALUES(:id,:member,:actor,:action,:now)")
            .param("id",UUID.randomUUID()).param("member",member).param("actor",actor).param("action",action).param("now",OffsetDateTime.now(clock)).update();
    }
    private static RuleViolation unavailable() { return new RuleViolation("NOT_FOUND","Invitation or shared profile is unavailable. Refresh and review.",404); }
}
