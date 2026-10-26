package com.familymedicine.domain;

import com.familymedicine.api.Contracts.*;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.jdbc.core.simple.JdbcClient;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class MedicineServiceTest {
    @TestConfiguration static class FixedTime {
        @Bean @Primary Clock fixedClock() { return Clock.fixed(Instant.parse("2026-10-20T00:00:00Z"),ZoneOffset.UTC); }
    }
    @Autowired MedicineService service;
    @Autowired JdbcClient db;
    @Value("${local.server.port}") int port;
    private UUID actor;
    private ScheduleInput input;
    @BeforeEach void setup() {
        actor=UUID.randomUUID();
        var member=service.createMember(actor,new MemberInput("Example member","Self",null,false));
        input=new ScheduleInput(member.id(),"Example medicine","10 mg","One tablet as confirmed",BigDecimal.ONE,"tablet",
            List.of("08:00"),List.of(1,2,3,4,5,6,7),"Asia/Kolkata",LocalDate.parse("2026-10-20"),
            LocalDate.parse("2026-10-22"),false,true,BigDecimal.TEN,null,null);
    }
    @Test void prescriptionDetailsPersistWithoutConvertingLiquidStrengthToDose() {
        var details=new PrescriptionDetails("Fictional ingredient","Liquid / syrup","By mouth","Once daily","Not specified",false,"FIXED");
        var liquid=new ScheduleInput(input.memberId(),"Fictional liquid","125 mg/5 mL","Confirmed fictional instructions",new BigDecimal("5"),"mL",
            input.times(),input.weekdays(),input.timezone(),input.startDate(),input.endDate(),false,true,new BigDecimal("100"),details,null);
        UUID key=UUID.randomUUID();
        var saved=service.activate(actor,key,liquid);
        assertThat(saved.prescriptionDetails()).isEqualTo(details);
        assertThat(service.schedules(actor).get(0).prescriptionDetails()).isEqualTo(details);
        assertThat(service.activate(actor,key,liquid).id()).isEqualTo(saved.id());
        var occurrence=service.occurrences(actor,input.startDate(),input.endDate(),input.timezone()).get(0);
        assertThat(service.record(actor,new DoseInput(UUID.randomUUID(),occurrence.id(),DoseAction.TAKEN,Instant.parse("2026-10-20T00:00:00Z"),true)).stock()).isEqualByComparingTo("95");
        assertThat(service.schedules(actor).get(0).strength()).isEqualTo("125 mg/5 mL");
    }
    @Test void lowStockUsesConfirmedOutcomeAndRetriesDoNotDeductTwice() {
        var dose=first();
        var enabled=service.updateStockAlert(actor,dose.scheduleId(),new StockAlertInput(new BigDecimal("9")));
        assertThat(enabled.lowStock()).isFalse();
        var event=new DoseInput(UUID.randomUUID(),dose.id(),DoseAction.TAKEN,Instant.parse("2026-10-20T00:00:00Z"),true);
        service.record(actor,event); service.record(actor,event);
        var low=service.schedules(actor).get(0);
        assertThat(low.stock()).isEqualByComparingTo("9");
        assertThat(low.lowStock()).isTrue();
        assertThatThrownBy(()->service.updateStockAlert(UUID.randomUUID(),dose.scheduleId(),new StockAlertInput(BigDecimal.ONE))).hasMessageContaining("unavailable");
        assertThat(service.updateStockAlert(actor,dose.scheduleId(),new StockAlertInput(null)).lowStock()).isFalse();
    }
    @Test void skippedDoseDoesNotCreateLowStockAndZeroThresholdWorks() {
        var dose=first();
        service.updateStockAlert(actor,dose.scheduleId(),new StockAlertInput(new BigDecimal("9")));
        service.record(actor,new DoseInput(UUID.randomUUID(),dose.id(),DoseAction.SKIPPED,null,false));
        assertThat(service.schedules(actor).get(0).lowStock()).isFalse();
        db.sql("UPDATE schedules SET stock=0 WHERE id=:id").param("id",dose.scheduleId()).update();
        assertThat(service.updateStockAlert(actor,dose.scheduleId(),new StockAlertInput(BigDecimal.ZERO)).lowStock()).isTrue();
    }
    @Test void stockThresholdCannotEnableTrackingWithoutQuantity() {
        var noStock=new ScheduleInput(input.memberId(),input.medicineName(),input.strength(),input.doseInstruction(),null,input.unit(),input.times(),input.weekdays(),input.timezone(),input.startDate(),input.endDate(),false,true,null,null,BigDecimal.ONE);
        assertThatThrownBy(()->service.preview(actor,noStock)).hasMessageContaining("tracked stock");
        var dose=first();
        assertThatThrownBy(()->service.updateStockAlert(actor,dose.scheduleId(),new StockAlertInput(new BigDecimal("-1")))).hasMessageContaining("stock tracking");
    }
    private Occurrence first() {
        service.activate(actor,UUID.randomUUID(),input);
        return service.occurrences(actor,input.startDate(),input.endDate(),input.timezone()).get(0);
    }
    @Test void activationRetryCreatesOneSchedule() {
        UUID key=UUID.randomUUID();
        assertThat(service.activate(actor,key,input).id()).isEqualTo(service.activate(actor,key,input).id());
        assertThat(service.schedules(actor)).hasSize(1);
    }
    @Test void doseRetryDeductsStockOnce() {
        var dose=first();
        var event=new DoseInput(UUID.randomUUID(),dose.id(),DoseAction.TAKEN,Instant.parse("2026-10-20T00:00:00Z"),true);
        assertThat(service.record(actor,event).stock()).isEqualByComparingTo("9");
        assertThat(service.record(actor,event).duplicate()).isTrue();
        assertThat(service.schedules(actor).get(0).stock()).isEqualByComparingTo("9");
        assertThat(db.sql("SELECT count(*) FROM dose_events WHERE occurrence_id=:id").param("id",dose.id()).query(Long.class).single()).isEqualTo(1);
    }
    @Test void differentIdsForIdenticalActionsDoNotDeductTwice() {
        var dose=first();
        service.record(actor,new DoseInput(UUID.randomUUID(),dose.id(),DoseAction.SKIPPED,null,false));
        assertThat(service.record(actor,new DoseInput(UUID.randomUUID(),dose.id(),DoseAction.SKIPPED,null,false)).duplicate()).isTrue();
        assertThat(service.schedules(actor).get(0).stock()).isEqualByComparingTo("10");
    }
    @Test void conflictingActionIsNotApplied() {
        var dose=first();
        service.record(actor,new DoseInput(UUID.randomUUID(),dose.id(),DoseAction.TAKEN,Instant.parse("2026-10-20T00:00:00Z"),true));
        assertThatThrownBy(()->service.record(actor,new DoseInput(UUID.randomUUID(),dose.id(),DoseAction.SKIPPED,null,false)))
            .isInstanceOf(RuleViolation.class).hasMessageContaining("different action");
        assertThat(service.schedules(actor).get(0).stock()).isEqualByComparingTo("9");
    }
    @Test void memberAndDoseAreIsolatedByOwner() {
        var dose=first(); var outsider=UUID.randomUUID();
        assertThat(service.members(outsider)).isEmpty();
        assertThat(service.schedules(outsider)).isEmpty();
        assertThatThrownBy(()->service.requireMember(outsider,input.memberId())).hasMessageContaining("unavailable");
        assertThatThrownBy(()->service.record(outsider,new DoseInput(UUID.randomUUID(),dose.id(),DoseAction.SKIPPED,null,false)))
            .hasMessageContaining("unavailable");
    }
    @Test void earlyTakenNeedsExplicitConfirmationAndRollbackLeavesStockIntact() {
        var dose=first();
        assertThatThrownBy(()->service.record(actor,new DoseInput(UUID.randomUUID(),dose.id(),DoseAction.TAKEN,Instant.parse("2026-10-20T00:00:00Z"),false)))
            .hasMessageContaining("Confirm");
        assertThat(service.schedules(actor).get(0).stock()).isEqualByComparingTo("10");
    }
    @Test void changedPayloadCannotReuseEventId() {
        var dose=first(); UUID id=UUID.randomUUID();
        service.record(actor,new DoseInput(id,dose.id(),DoseAction.SKIPPED,null,false));
        assertThatThrownBy(()->service.record(actor,new DoseInput(id,dose.id(),DoseAction.TAKEN,Instant.parse("2026-10-20T00:00:00Z"),true)))
            .hasMessageContaining("event ID");
    }
    @Test void apiRequiresAuthentication() throws Exception {
        var client=HttpClient.newHttpClient();
        assertThat(client.send(HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/v1/members")).build(),HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(401);
        assertThat(client.send(HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/health")).build(),HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(200);
    }
    @Test void simultaneousRetriesDeductStockOnce() throws Exception {
        var dose=first();
        var event=new DoseInput(UUID.randomUUID(),dose.id(),DoseAction.TAKEN,Instant.parse("2026-10-20T00:00:00Z"),true);
        ExecutorService executor=Executors.newFixedThreadPool(2);
        try {
            var results=executor.invokeAll(List.of(()->service.record(actor,event),()->service.record(actor,event)));
            for(var result:results) result.get(10,TimeUnit.SECONDS);
            assertThat(service.schedules(actor).get(0).stock()).isEqualByComparingTo("9");
            assertThat(db.sql("SELECT count(*) FROM dose_events WHERE occurrence_id=:id").param("id",dose.id()).query(Long.class).single()).isEqualTo(1);
        } finally { executor.shutdownNow(); }
    }
    @Test void sameStatusWithDifferentActualTimeRequiresReview() {
        var dose=first();
        service.record(actor,new DoseInput(UUID.randomUUID(),dose.id(),DoseAction.TAKEN,Instant.parse("2026-10-20T00:00:00Z"),true));
        assertThatThrownBy(()->service.record(actor,new DoseInput(UUID.randomUUID(),dose.id(),DoseAction.TAKEN,Instant.parse("2026-10-19T23:59:00Z"),true)))
            .hasMessageContaining("different action");
        assertThat(service.schedules(actor).get(0).stock()).isEqualByComparingTo("9");
    }
    @Test void authenticatedHttpApiValidatesAndSerializesRecords() throws Exception {
        var client=HttpClient.newHttpClient();
        String base="http://localhost:"+port;
        var create=HttpRequest.newBuilder(URI.create(base+"/v1/members"))
            .header("Authorization","Bearer local-integration-test-token-only").header("Content-Type","application/json")
            .POST(HttpRequest.BodyPublishers.ofString("{\"name\":\"Example API member\",\"relationship\":\"Self\"}")).build();
        var response=client.send(create,HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(response.body()).contains("Example API member");
        var invalid=HttpRequest.newBuilder(URI.create(base+"/v1/members"))
            .header("Authorization","Bearer local-integration-test-token-only").header("Content-Type","application/json")
            .POST(HttpRequest.BodyPublishers.ofString("{\"name\":\"\",\"relationship\":\"Self\"}")).build();
        assertThat(client.send(invalid,HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(422);
    }
}
