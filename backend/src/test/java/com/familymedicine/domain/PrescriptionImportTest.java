package com.familymedicine.domain;

import com.familymedicine.api.Contracts.*;
import com.familymedicine.prescription.*;
import static com.familymedicine.prescription.PrescriptionContracts.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class PrescriptionImportTest {
    static class FakeExtraction implements ExtractionProvider {
        String mode="openai";
        @Override public String mode() { return mode; }
        final AtomicInteger calls=new AtomicInteger();
        public Extraction extract(List<PrescriptionFiles.Page> pages) {
            calls.incrementAndGet();
            return new Extraction(new Person(null),new Person(null),null,
                java.util.stream.IntStream.range(0,5).mapToObj(i->new Medicine("Fictional handwriting "+i,"Fictional "+i,null,null,"BD","1-0-1",List.of("morning","evening"),null,null,false,true)).toList());
        }
    }
    @TestConfiguration static class Configuration {
        @Bean @Primary FakeExtraction fakeExtraction() { return new FakeExtraction(); }
        @Bean @Primary Clock importClock() { return Clock.fixed(Instant.parse("2026-10-22T00:00:00Z"),ZoneOffset.UTC); }
    }
    @Autowired PrescriptionService service;
    @Autowired MedicineService medicines;
    @Autowired JdbcClient db;
    @Autowired FakeExtraction provider;
    @org.springframework.beans.factory.annotation.Value("${local.server.port}") int port;
    private UUID actor,member;
    private MockMultipartFile upload;
    @BeforeEach void setup() throws Exception {
        provider.mode="openai";
        actor=UUID.randomUUID(); member=medicines.createMember(actor,new MemberInput("Fictional patient","Self",null,false)).id();
        var bytes=new ByteArrayOutputStream(); ImageIO.write(new BufferedImage(20,20,BufferedImage.TYPE_INT_RGB),"png",bytes);
        upload=new MockMultipartFile("files","scan.png","image/png",bytes.toByteArray());
    }
    private Document extract() { return service.extract(actor,member,UUID.randomUUID(),List.of(upload)); }
    private Item reviewed(Item item) {
        var input=new ScheduleInput(member,item.evidence().brand(),"500 mg","Confirmed one tablet twice daily",BigDecimal.ONE,"tablet",List.of("08:00","20:00"),List.of(1,2,3,4,5,6,7),"Asia/Kolkata",LocalDate.parse("2026-10-22"),LocalDate.parse("2026-10-27"),false,true,null,
            new PrescriptionDetails(null,"Tablet","By mouth","Twice daily","Not specified",false,"FIXED"),null);
        var evidence=new Medicine(item.evidence().raw(),item.evidence().brand(),"500 mg","One tablet","BD","1-0-1",List.of("morning","evening"),null,"5 days",false,true);
        return new Item(item.id(),evidence,input,true,"Confirmed with fictional prescriber",Map.of());
    }
    @Test void extractionReturnsAllMedicinesWithoutActivatingAndProtectsOriginals() throws Exception {
        var document=extract();
        assertThat(document.items()).hasSize(5);
        assertThat(document.items()).allMatch(item->item.schedule()==null && !item.verified() && item.evidence().dose()==null);
        assertThat(medicines.schedules(actor)).isEmpty();
        assertThat(service.source(actor,document.id(),0).data()).isEqualTo(upload.getBytes());
        var encrypted=db.sql("SELECT encrypted_data FROM prescription_sources WHERE prescription_id=:id").param("id",document.id()).query(byte[].class).single();
        assertThat(encrypted).isNotEqualTo(upload.getBytes());
        assertThat(db.sql("SELECT extraction FROM prescriptions WHERE id=:id").param("id",document.id()).query(String.class).single()).doesNotContain("Fictional");
        assertThat(service.history(actor,member)).hasSize(1);
    }
    @Test void extractionRetryUsesSameKeyWithoutAnotherProviderCall() {
        var key=UUID.randomUUID(); int before=provider.calls.get();
        var first=service.extract(actor,member,key,List.of(upload));
        assertThat(service.extract(actor,member,key,List.of(upload)).id()).isEqualTo(first.id());
        assertThat(provider.calls.get()).isEqualTo(before+1);
        var different=new MockMultipartFile("files","other.png","image/png",new byte[]{1,2});
        assertThatThrownBy(()->service.extract(actor,member,key,List.of(different))).isInstanceOf(RuleViolation.class);
    }
    @Test void unauthorizedUsersCannotReadSourceDraftHistoryOrRoutine() {
        var document=extract(); var stranger=UUID.randomUUID();
        assertThatThrownBy(()->service.get(stranger,document.id())).hasMessageContaining("unavailable");
        assertThatThrownBy(()->service.source(stranger,document.id(),0)).hasMessageContaining("unavailable");
        assertThatThrownBy(()->service.history(stranger,member)).hasMessageContaining("unavailable");
        assertThatThrownBy(()->service.routine(stranger,member)).hasMessageContaining("unavailable");
        assertThatThrownBy(()->service.activate(stranger,document.id(),new Activation(1,List.of(document.items().get(0).id())))).hasMessageContaining("unavailable");
    }
    @Test void unresolvedDoseAndSosCannotActivate() {
        var document=extract();
        assertThatThrownBy(()->service.activate(actor,document.id(),new Activation(1,List.of(document.items().get(0).id())))).hasMessageContaining("Verify");
        var valid=reviewed(document.items().get(0)); var original=valid.evidence();
        var sos=new Medicine(original.raw(),original.brand(),original.strength(),original.dose(),original.frequency(),original.pattern(),original.timing(),original.food(),original.duration(),true,true);
        var draft=service.save(actor,document.id(),new Draft(1,List.of(new Item(valid.id(),sos,valid.schedule(),true,"Checked",Map.of()))));
        assertThatThrownBy(()->service.activate(actor,draft.id(),new Activation(draft.version(),List.of(valid.id())))).hasMessageContaining("As-needed");
        assertThat(medicines.schedules(actor)).isEmpty();
    }
    @Test void fiveMedicineActivationIsAtomicRetrySafeAndDiscontinuationRemovesFutureAlarms() {
        var document=extract();
        var draft=service.save(actor,document.id(),new Draft(1,document.items().stream().map(this::reviewed).toList()));
        var activation=new Activation(draft.version(),draft.items().stream().map(Item::id).toList());
        assertThat(service.preview(actor,draft.id())).hasSize(5);
        var active=service.activate(actor,draft.id(),activation);
        assertThat(active.plans()).hasSize(5);
        assertThat(service.activate(actor,draft.id(),activation).plans()).isEqualTo(active.plans());
        assertThat(medicines.schedules(actor)).hasSize(5);
        var item=active.items().get(0);
        var discontinued=service.discontinue(actor,active.id(),item.id(),active.version());
        assertThat(service.planStates(actor,active.id()).get(item.id())).isEqualTo("DISCONTINUED");
        assertThat(medicines.schedules(actor)).hasSize(4);
        assertThat(medicines.occurrences(actor,LocalDate.parse("2026-10-22"),LocalDate.parse("2026-10-27"),"Asia/Kolkata")).noneMatch(o->o.scheduleId().equals(active.plans().get(item.id())));
        assertThat(discontinued.items()).hasSize(5);
    }
    @Test void staleDraftCannotOverwriteAndFailureRollsBackWholeBatch() {
        var document=extract();
        var draft=service.save(actor,document.id(),new Draft(1,List.of(reviewed(document.items().get(0)),document.items().get(1))));
        assertThatThrownBy(()->service.save(actor,document.id(),new Draft(1,document.items()))).hasMessageContaining("changed");
        assertThatThrownBy(()->service.activate(actor,draft.id(),new Activation(draft.version(),draft.items().stream().map(Item::id).toList()))).hasMessageContaining("Verify");
        assertThat(medicines.schedules(actor)).isEmpty();
        assertThat(service.get(actor,draft.id()).plans()).isEmpty();
    }
    @Test void concurrentActivationCreatesFivePlansOnce() throws Exception {
        var document=extract(); var draft=service.save(actor,document.id(),new Draft(1,document.items().stream().map(this::reviewed).toList()));
        var input=new Activation(draft.version(),draft.items().stream().map(Item::id).toList());
        var executor=Executors.newFixedThreadPool(2);
        try {
            var first=executor.submit(()->service.activate(actor,draft.id(),input));
            var second=executor.submit(()->service.activate(actor,draft.id(),input));
            assertThat(first.get(15,TimeUnit.SECONDS).plans()).isEqualTo(second.get(15,TimeUnit.SECONDS).plans());
            assertThat(medicines.schedules(actor)).hasSize(5);
        } finally { executor.shutdownNow(); }
    }
    @Test void routinePartialOverridesPersistWithoutChangingActiveSchedules() {
        var document=extract(); var draft=service.save(actor,document.id(),new Draft(1,List.of(reviewed(document.items().get(0)))));
        service.activate(actor,draft.id(),new Activation(draft.version(),List.of(draft.items().get(0).id())));
        var before=medicines.occurrences(actor,LocalDate.parse("2026-10-22"),LocalDate.parse("2026-10-27"),"Asia/Kolkata");
        service.routine(actor,member,new Routine(null,"08:00","14:00",null,null,"Asia/Kolkata"));
        assertThat(service.routine(actor,member).breakfast()).isEqualTo("08:00");
        assertThat(service.routine(actor,member).bedtime()).isNull();
        assertThat(medicines.occurrences(actor,LocalDate.parse("2026-10-22"),LocalDate.parse("2026-10-27"),"Asia/Kolkata")).isEqualTo(before);
    }
    @Test void multipartEndpointAuthenticatesPatientAndNeverCachesSources() throws Exception {
        UUID developer=UUID.fromString("2b59ea70-1069-4e2b-b468-31784aa22700");
        UUID patient=medicines.createMember(developer,new MemberInput("HTTP fictional patient","Self",null,false)).id();
        String boundary="prescription-test-boundary";
        var body=new ByteArrayOutputStream();
        body.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\"memberId\"\r\n\r\n"+patient+"\r\n--"+boundary+"\r\nContent-Disposition: form-data; name=\"files\"; filename=\"scan.png\"\r\nContent-Type: image/png\r\n\r\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
        body.write(upload.getBytes()); body.write(("\r\n--"+boundary+"--\r\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
        var client=java.net.http.HttpClient.newHttpClient();
        var request=java.net.http.HttpRequest.newBuilder(java.net.URI.create("http://localhost:"+port+"/v1/prescriptions/extract"))
            .header("Authorization","Bearer local-integration-test-token-only").header("Idempotency-Key",UUID.randomUUID().toString())
            .header("Content-Type","multipart/form-data; boundary="+boundary).POST(java.net.http.HttpRequest.BodyPublishers.ofByteArray(body.toByteArray())).build();
        var response=client.send(request,java.net.http.HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        var json=tools.jackson.databind.json.JsonMapper.builder().build();
        String id=json.readTree(response.body()).path("id").asText();
        var unauth=client.send(java.net.http.HttpRequest.newBuilder(java.net.URI.create("http://localhost:"+port+"/v1/prescriptions/"+id+"/pages/0")).GET().build(),java.net.http.HttpResponse.BodyHandlers.ofString());
        assertThat(unauth.statusCode()).isEqualTo(401);
    }
    @Test void duplicateMedicineEntriesAreRejectedWithoutAnyActivation() {
        var document=extract(); var first=reviewed(document.items().get(0));
        var duplicate=new Item(document.items().get(1).id(),first.evidence(),first.schedule(),true,first.reviewNote(),Map.of());
        var draft=service.save(actor,document.id(),new Draft(1,List.of(first,duplicate)));
        assertThatThrownBy(()->service.activate(actor,draft.id(),new Activation(draft.version(),List.of(first.id(),duplicate.id())))).hasMessageContaining("same medicine");
        assertThat(medicines.schedules(actor)).isEmpty();
    }
    @Test void originalPdfIsRetainedWhenEditedImageIsUsedForExtraction() throws Exception {
        var bytes=new ByteArrayOutputStream();
        try(var pdf=new org.apache.pdfbox.pdmodel.PDDocument()) { pdf.addPage(new org.apache.pdfbox.pdmodel.PDPage());pdf.save(bytes); }
        var original=new MockMultipartFile("originals","original.pdf","application/pdf",bytes.toByteArray());
        var document=service.extract(actor,member,UUID.randomUUID(),List.of(upload),List.of(original));
        assertThat(service.original(actor,document.id(),0).data()).isEqualTo(bytes.toByteArray());
        assertThat(service.originalPages(actor,document.id())).hasSize(1);
        assertThat(service.source(actor,document.id(),0).data()).isEqualTo(upload.getBytes());
    }
    @Test void activationFailureAfterFirstInsertRollsBackEarlierScheduleAndAudit() {
        var document=extract(); var first=reviewed(document.items().get(0)); var second=reviewed(document.items().get(1));
        var s=second.schedule();
        var expired=new ScheduleInput(s.memberId(),s.medicineName(),s.strength(),s.doseInstruction(),s.doseQuantity(),s.unit(),s.times(),s.weekdays(),s.timezone(),LocalDate.parse("2020-01-01"),LocalDate.parse("2020-01-02"),false,true,null,s.prescriptionDetails(),null);
        var draft=service.save(actor,document.id(),new Draft(1,List.of(first,new Item(second.id(),second.evidence(),expired,true,second.reviewNote(),Map.of()))));
        assertThatThrownBy(()->service.activate(actor,draft.id(),new Activation(draft.version(),List.of(first.id(),second.id())))).hasMessageContaining("no upcoming");
        assertThat(medicines.schedules(actor)).isEmpty();
        assertThat(service.get(actor,draft.id()).plans()).isEmpty();
        assertThat(service.auditHistory(actor,draft.id())).noneMatch(event->event.get("action").equals("ACTIVATED"));
    }
    @Test void mockOriginPersistsThroughHistoryAndActivatedDoses() {
        provider.mode="mock";
        var document=extract();
        assertThat(document.extractionMode()).isEqualTo("mock");
        var draft=service.save(actor,document.id(),new Draft(1,List.of(reviewed(document.items().get(0)))));
        service.activate(actor,draft.id(),new Activation(draft.version(),List.of(draft.items().get(0).id())));
        assertThat(service.history(actor,member).get(0).extractionMode()).isEqualTo("mock");
        assertThat(medicines.schedules(actor)).allMatch(Schedule::sampleData);
        assertThat(medicines.occurrences(actor,LocalDate.parse("2026-10-22"),LocalDate.parse("2026-10-27"),"Asia/Kolkata")).isNotEmpty().allMatch(Occurrence::sampleData);
    }
}


