package com.familymedicine.domain;

import com.familymedicine.api.Contracts.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MedicineService {
    private final JdbcClient db;
    private final Clock clock;
    private final tools.jackson.databind.json.JsonMapper json=tools.jackson.databind.json.JsonMapper.builder().build();
    public MedicineService(JdbcClient db, Clock clock) { this.db=db; this.clock=clock; }

    public List<Member> members(UUID actor) {
        return db.sql("SELECT m.*,(SELECT display_name FROM accounts a WHERE a.id=m.linked_account_id) AS linked_name FROM members m WHERE (m.owner_id=:actor OR (m.linked_account_id=:actor AND m.link_state='ACCEPTED')) ORDER BY m.created_at,m.id")
            .param("actor",actor).query((r,n)->new Member(r.getObject("id",UUID.class),r.getString("name"),r.getString("relationship"),r.getString("phone"),r.getString("link_state"),r.getString("linked_name"),actor.equals(r.getObject("owner_id",UUID.class)))).list();
    }
    public Member requireMember(UUID actor, UUID memberId) {
        return db.sql("SELECT m.*,(SELECT display_name FROM accounts a WHERE a.id=m.linked_account_id) AS linked_name FROM members m WHERE m.id=:id AND (m.owner_id=:actor OR (m.linked_account_id=:actor AND m.link_state='ACCEPTED'))")
            .param("id",memberId).param("actor",actor)
            .query((r,n)->new Member(r.getObject("id",UUID.class),r.getString("name"),r.getString("relationship"),r.getString("phone"),r.getString("link_state"),r.getString("linked_name"),actor.equals(r.getObject("owner_id",UUID.class))))
            .optional().orElseThrow(()->new RuleViolation("NOT_FOUND","Member is unavailable",404));
    }
    @Transactional
    public Member createMember(UUID actor, MemberInput input) {
        if (Boolean.TRUE.equals(input.inviteAccess()) && input.phone()==null)
            throw new RuleViolation("PHONE_REQUIRED","Enter a mobile number before inviting this person.");
        UUID id=UUID.randomUUID();
        db.sql("INSERT INTO members(id,owner_id,name,relationship,created_at,phone,link_state,invite_expires_at) VALUES(:id,:actor,:name,:rel,:now,:phone,:state,:expires)")
            .param("id",id).param("actor",actor).param("name",input.name().strip())
            .param("rel",input.relationship().strip()).param("now",offset(clock.instant()))
            .param("phone",input.phone()).param("state",Boolean.TRUE.equals(input.inviteAccess())?"PENDING":"NONE")
            .param("expires",Boolean.TRUE.equals(input.inviteAccess())?offset(clock.instant().plusSeconds(604800)):null).update();
        if(Boolean.TRUE.equals(input.inviteAccess())) db.sql("INSERT INTO family_access_events(id,member_id,actor_id,action,recorded_at) VALUES(:id,:member,:actor,'INVITED',:now)")
            .param("id",UUID.randomUUID()).param("member",id).param("actor",actor).param("now",offset(clock.instant())).update();
        return requireMember(actor,id);
    }
    public SchedulePreview preview(UUID actor, ScheduleInput input) {
        requireMember(actor,input.memberId());
        Instant effective=clock.instant();
        return new SchedulePreview(SchedulePlanner.plan(UUID.randomUUID(),input,effective),input.timezone(),effective,
            "Preview covers up to 35 days from the later of today and the start date. Enable reminders and check device readiness in Settings.");
    }
    @Transactional
    public Schedule activate(UUID actor, UUID commandKey, ScheduleInput input) {
        requireMember(actor,input.memberId());
        String hash=hash(input.toString());
        var existing=db.sql("SELECT request_hash,schedule_id FROM schedule_commands WHERE actor_id=:actor AND command_key=:key")
            .param("actor",actor).param("key",commandKey).query((r,n)->Map.entry(r.getString(1),r.getObject(2,UUID.class))).optional();
        if(existing.isPresent()) {
            if(!existing.get().getKey().equals(hash)) throw conflict("This request key was already used for different content");
            return schedule(actor,existing.get().getValue());
        }
        Instant now=clock.instant(); UUID id=UUID.randomUUID();
        var doses=SchedulePlanner.plan(id,input,now);
        if(doses.isEmpty()) throw new RuleViolation("NO_UPCOMING_DOSES","There are no upcoming doses in the selected dates");
        if(input.initialStock()!=null && input.doseQuantity()==null)
            throw new RuleViolation("STOCK_QUANTITY_REQUIRED","Enter a numeric dose quantity to track stock in the same unit");
        db.sql("""
            INSERT INTO schedules(id,member_id,medicine_name,strength,dose_instruction,dose_quantity,unit,times,weekdays,timezone,start_date,end_date,activated_at,stock,prescription_details,low_stock_threshold)
            VALUES(:id,:member,:name,:strength,:instruction,:quantity,:unit,:times,:days,:zone,:start,:end,:now,:stock,:details,:threshold)
            """)
            .param("id",id).param("member",input.memberId()).param("name",input.medicineName().strip())
            .param("strength",input.strength().strip()).param("instruction",input.doseInstruction().strip())
            .param("quantity",input.doseQuantity()).param("unit",input.unit().strip())
            .param("times",String.join(",",input.times())).param("days",input.weekdays().toString())
            .param("zone",input.timezone()).param("start",input.startDate()).param("end",input.endDate())
            .param("now",offset(now)).param("stock",input.initialStock())
            .param("details",input.prescriptionDetails()==null?null:json.writeValueAsString(input.prescriptionDetails()))
            .param("threshold",input.lowStockThreshold()).update();
        for(var dose:doses) db.sql("""
            INSERT INTO occurrences(id,schedule_id,schedule_version,due_at,local_date,local_time)
            VALUES(:id,:schedule,1,:due,:date,:time)
            """).param("id",dose.id()).param("schedule",id).param("due",offset(dose.dueAt()))
            .param("date",dose.localDate()).param("time",dose.localTime()).update();
        db.sql("INSERT INTO schedule_commands(actor_id,command_key,request_hash,schedule_id) VALUES(:actor,:key,:hash,:schedule)")
            .param("actor",actor).param("key",commandKey).param("hash",hash).param("schedule",id).update();
        return schedule(actor,id);
    }
    public List<Schedule> schedules(UUID actor) {
        return db.sql("SELECT s.* FROM schedules s JOIN members m ON m.id=s.member_id WHERE s.discontinued=FALSE AND (m.owner_id=:actor OR (m.linked_account_id=:actor AND m.link_state='ACCEPTED')) ORDER BY s.activated_at,s.id")
            .param("actor",actor).query((r,n)->mapSchedule(r)).list();
    }
    private Schedule schedule(UUID actor, UUID id) {
        return db.sql("SELECT s.* FROM schedules s JOIN members m ON m.id=s.member_id WHERE s.id=:id AND (m.owner_id=:actor OR (m.linked_account_id=:actor AND m.link_state='ACCEPTED'))")
            .param("id",id).param("actor",actor).query((r,n)->mapSchedule(r)).optional()
            .orElseThrow(()->new RuleViolation("NOT_FOUND","Schedule is unavailable",404));
    }
    private Schedule mapSchedule(ResultSet r) throws SQLException {
        var stock=r.getBigDecimal("stock"); var threshold=r.getBigDecimal("low_stock_threshold");
        return new Schedule(r.getObject("id",UUID.class),r.getObject("member_id",UUID.class),r.getString("medicine_name"),
            r.getString("strength"),r.getString("dose_instruction"),r.getBigDecimal("dose_quantity"),r.getString("unit"),r.getString("timezone"),r.getBigDecimal("stock"),
            r.getString("prescription_details")==null?null:json.readValue(r.getString("prescription_details"),PrescriptionDetails.class),threshold,
            stock!=null && threshold!=null && stock.compareTo(threshold)<=0,r.getBoolean("sample_data"));
    }
    @Transactional
    public Schedule updateStockAlert(UUID actor,UUID id,StockAlertInput input) {
        var existing=schedule(actor,id);
        if(input.threshold()!=null && (input.threshold().signum()<0 || existing.stock()==null || existing.doseQuantity()==null))
            throw new RuleViolation("STOCK_TRACKING_REQUIRED","Enable stock tracking with a confirmed dose quantity before setting a low-stock alert.");
        db.sql("UPDATE schedules SET low_stock_threshold=:threshold WHERE id=:id")
            .param("threshold",input.threshold()).param("id",id).update();
        return schedule(actor,id);
    }
    public List<Occurrence> occurrences(UUID actor, LocalDate from, LocalDate to, String timezone) {
        if(to.isBefore(from) || to.isAfter(from.plusDays(90))) throw new RuleViolation("INVALID_RANGE","Choose a date range of at most 90 days");
        ZoneId zone;
        try { zone=ZoneId.of(timezone); } catch(DateTimeException e) { throw new RuleViolation("INVALID_TIMEZONE","Choose a valid timezone"); }
        return db.sql("""
            SELECT o.*,s.member_id,s.medicine_name,s.strength,s.dose_instruction,s.unit,s.timezone,s.stock,s.sample_data,m.name AS member_name
            FROM occurrences o JOIN schedules s ON s.id=o.schedule_id JOIN members m ON m.id=s.member_id
            WHERE (m.owner_id=:actor OR (m.linked_account_id=:actor AND m.link_state='ACCEPTED')) AND (s.discontinued=FALSE OR o.status<>'PENDING') AND o.due_at>=:from AND o.due_at<:to ORDER BY o.due_at,o.id
            """).param("actor",actor).param("from",offset(from.atStartOfDay(zone).toInstant()))
            .param("to",offset(to.plusDays(1).atStartOfDay(zone).toInstant()))
            .query((r,n)-> {
                Instant due=r.getObject("due_at",OffsetDateTime.class).toInstant();
                String status=r.getString("status");
                if(status.equals("PENDING")) status=clock.instant().isBefore(due)?"UPCOMING":
                    clock.instant().isBefore(due.plusSeconds(3600))?"DUE":"NOT_RECORDED";
                OffsetDateTime actual=r.getObject("actual_at",OffsetDateTime.class);
                return new Occurrence(r.getObject("id",UUID.class),r.getObject("schedule_id",UUID.class),r.getObject("member_id",UUID.class),
                    r.getString("member_name"),r.getString("medicine_name"),r.getString("strength"),r.getString("dose_instruction"),
                    r.getString("unit"),r.getString("timezone"),due,status,actual==null?null:actual.toInstant(),r.getBigDecimal("stock"),r.getBoolean("sample_data"));
            }).list();
    }
    @Transactional
    public DoseResult record(UUID actor, DoseInput input) {
        // Resolve ownership before exposing occurrence or event metadata.
        var occurrence=db.sql("""
            SELECT o.schedule_id FROM occurrences o JOIN schedules s ON s.id=o.schedule_id
            JOIN members m ON m.id=s.member_id WHERE o.id=:id AND (m.owner_id=:actor OR (m.linked_account_id=:actor AND m.link_state='ACCEPTED'))
            """).param("id",input.occurrenceId()).param("actor",actor).query(UUID.class).optional()
            .orElseThrow(()->new RuleViolation("NOT_FOUND","Dose is unavailable",404));
        // Serialize stock effects across different occurrences of the same medicine.
        db.sql("SELECT id FROM schedules WHERE id=:id FOR UPDATE").param("id",occurrence).query(UUID.class).single();
        String requestHash=hash(input.toString());
        var previous=db.sql("SELECT request_hash FROM dose_events WHERE event_id=:id AND actor_id=:actor")
            .param("id",input.eventId()).param("actor",actor).query(String.class).optional();
        if(previous.isPresent()) {
            if(!previous.get().equals(requestHash)) throw conflict("This event ID was already used for another action");
            return new DoseResult(input.eventId(),input.occurrenceId(),input.action().name(),schedule(actor,occurrence).stock(),true);
        }
        var current=db.sql("SELECT status,due_at FROM occurrences WHERE id=:id FOR UPDATE")
            .param("id",input.occurrenceId()).query((r,n)->Map.entry(r.getString(1),r.getObject(2,OffsetDateTime.class).toInstant())).single();
        if(!current.getKey().equals("PENDING")) {
            Instant actual=db.sql("SELECT actual_at FROM occurrences WHERE id=:id").param("id",input.occurrenceId())
                .query((r,n)->r.getObject(1,OffsetDateTime.class)).optional().map(OffsetDateTime::toInstant).orElse(null);
            if(current.getKey().equals(input.action().name()) && Objects.equals(actual,input.actualAt()))
                return new DoseResult(input.eventId(),input.occurrenceId(),current.getKey(),schedule(actor,occurrence).stock(),true);
            throw conflict("A different action is already recorded. Refresh and review this dose; no stock change was applied");
        }
        Instant now=clock.instant();
        if(input.action()==DoseAction.TAKEN && input.actualAt()==null)
            throw new RuleViolation("ACTUAL_TIME_REQUIRED","Taken requires an actual taken time");
        if(input.action()==DoseAction.SKIPPED && input.actualAt()!=null)
            throw new RuleViolation("INVALID_ACTUAL_TIME","Skipped must not include an actual taken time");
        if(input.actualAt()!=null && input.actualAt().isAfter(now.plusSeconds(60)))
            throw new RuleViolation("FUTURE_ACTUAL_TIME","Actual taken time cannot be in the future");
        if(input.action()==DoseAction.TAKEN && input.actualAt().isBefore(current.getValue()) && !input.earlyConfirmed())
            throw new RuleViolation("EARLY_CONFIRMATION_REQUIRED","Confirm before recording this dose early");
        Schedule schedule=schedule(actor,occurrence);
        BigDecimal delta=BigDecimal.ZERO;
        if(input.action()==DoseAction.TAKEN && schedule.stock()!=null && schedule.doseQuantity()!=null) {
            delta=schedule.doseQuantity().negate();
            db.sql("UPDATE schedules SET stock=stock+:delta WHERE id=:id").param("delta",delta).param("id",occurrence).update();
        }
        db.sql("INSERT INTO dose_events(event_id,occurrence_id,actor_id,action,actual_at,received_at,stock_delta,request_hash) VALUES(:event,:occurrence,:actor,:action,:actual,:received,:delta,:hash)")
            .param("event",input.eventId()).param("occurrence",input.occurrenceId()).param("actor",actor).param("action",input.action().name())
            .param("actual",input.actualAt()==null?null:offset(input.actualAt())).param("received",offset(now)).param("delta",delta).param("hash",requestHash).update();
        db.sql("UPDATE occurrences SET status=:status,actual_at=:actual WHERE id=:id")
            .param("status",input.action().name()).param("actual",input.actualAt()==null?null:offset(input.actualAt())).param("id",input.occurrenceId()).update();
        return new DoseResult(input.eventId(),input.occurrenceId(),input.action().name(),schedule(actor,occurrence).stock(),false);
    }
    private static RuleViolation conflict(String message) { return new RuleViolation("CONFLICT",message,409); }
    private static OffsetDateTime offset(Instant instant) { return instant.atOffset(ZoneOffset.UTC); }
    private static String hash(String text) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))); }
        catch(NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
}

