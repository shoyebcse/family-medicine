package com.familymedicine.security;

import java.net.URI;
import java.net.http.*;
import java.time.OffsetDateTime;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class AuthIntegrationTest {
    @Value("${local.server.port}") int port;
    @Autowired JdbcClient db;
    private final JsonMapper json = JsonMapper.builder().build();
    private final HttpClient http = HttpClient.newHttpClient();
    private final String password = "fictional-test-password-123";
    @BeforeEach void resetLimits() { db.sql("DELETE FROM auth_limits").update(); }
    private HttpResponse<String> request(String path, Object body, String token) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).header("Content-Type","application/json");
        if(path.equals("/v1/schedules") && body!=null) builder.header("Idempotency-Key",UUID.randomUUID().toString());
        if (token != null) builder.header("Authorization","Bearer " + token);
        if (body == null) builder.GET(); else builder.POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        return http.send(builder.build(),HttpResponse.BodyHandlers.ofString());
    }
    private JsonNode data(HttpResponse<String> response) { return json.readTree(response.body()); }
    private JsonNode register(String email) throws Exception {
        var response = request("/v1/auth/register",Map.of("email",email,"password",password,"displayName","Fictional account"),null);
        assertThat(response.statusCode()).isEqualTo(201);
        return data(response);
    }
    private String email() { return UUID.randomUUID() + "@example.invalid"; }
    @Test void registrationLoginLogoutAndHashedCredentials() throws Exception {
        String email = email(); var session = register(email.toUpperCase(Locale.ROOT));
        String token = session.path("token").asText();
        assertThat(session.path("account").path("emailVerified").asBoolean()).isFalse();
        assertThat(db.sql("SELECT password_hash FROM accounts WHERE email=:email").param("email",email).query(String.class).single()).startsWith("$2a$12$");
        assertThat(db.sql("SELECT COUNT(*) FROM auth_sessions WHERE token_hash=:hash").param("hash",AuthService.digest(token)).query(Integer.class).single()).isEqualTo(1);
        assertThat(request("/v1/auth/me",null,token).statusCode()).isEqualTo(200);
        assertThat(request("/v1/auth/login",Map.of("email",email,"password",password),null).statusCode()).isEqualTo(200);
        assertThat(request("/v1/auth/logout",Map.of(),token).statusCode()).isEqualTo(200);
        assertThat(request("/v1/auth/me",null,token).statusCode()).isEqualTo(401);
    }
    @Test void wrongPasswordDuplicatesAndValidation() throws Exception {
        String email = email(); register(email);
        assertThat(request("/v1/auth/register",Map.of("email",email,"password",password,"displayName","Other"),null).statusCode()).isEqualTo(409);
        assertThat(request("/v1/auth/login",Map.of("email",email,"password","incorrect-password"),null).statusCode()).isEqualTo(401);
        assertThat(request("/v1/auth/register",Map.of("email",email(),"password","short","displayName","Test"),null).statusCode()).isEqualTo(422);
        assertThat(request("/v1/auth/phone/start",Map.of("phone","9876543210"),null).statusCode()).isEqualTo(422);
    }
    @Test void accountsCannotReadEachOthersMedicineRecords() throws Exception {
        String first = register(email()).path("token").asText();
        String second = register(email()).path("token").asText();
        assertThat(request("/v1/members",Map.of("name","Fictional self","relationship","Self"),first).statusCode()).isEqualTo(201);
        assertThat(data(request("/v1/members",null,first)).size()).isEqualTo(1);
        assertThat(data(request("/v1/members",null,second)).size()).isZero();
        assertThat(request("/v1/members",null,null).statusCode()).isEqualTo(401);
    }
    @Test void expiredSessionsAreRejected() throws Exception {
        var session = register(email()); String token = session.path("token").asText();
        db.sql("UPDATE auth_sessions SET expires_at=:past WHERE token_hash=:hash")
            .param("past",OffsetDateTime.parse("2000-01-01T00:00:00Z")).param("hash",AuthService.digest(token)).update();
        assertThat(request("/v1/auth/me",null,token).statusCode()).isEqualTo(401);
    }
    private String phone() { return "+1555" + String.format("%07d",new java.security.SecureRandom().nextInt(10000000)); }
    @Test void developmentOtpCreatesUnverifiedPhoneIdentityAndRejectsReplay() throws Exception {
        String phone = phone();
        var challenge = data(request("/v1/auth/phone/start",Map.of("phone",phone),null));
        String code = challenge.path("developmentCode").asText(); assertThat(code).matches("[0-9]{6}");
        var input = Map.of("challengeId",challenge.path("challengeId").asText(),"code",code,"displayName","Fictional phone account");
        var response = request("/v1/auth/phone/verify",input,null);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(data(response).path("account").path("phoneVerified").asBoolean()).isFalse();
        assertThat(request("/v1/auth/phone/verify",input,null).statusCode()).isEqualTo(401);
        var again = data(request("/v1/auth/phone/start",Map.of("phone",phone),null));
        var login = data(request("/v1/auth/phone/verify",Map.of("challengeId",again.path("challengeId").asText(),"code",again.path("developmentCode").asText(),"displayName","Ignored"),null));
        assertThat(login.path("account").path("id").asText()).isEqualTo(data(response).path("account").path("id").asText());
    }
    @Test void wrongOtpAttemptsPersistAndAreBounded() throws Exception {
        var challenge = data(request("/v1/auth/phone/start",Map.of("phone",phone()),null));
        String actual = challenge.path("developmentCode").asText(); String wrong = actual.equals("000000") ? "111111" : "000000";
        String id = challenge.path("challengeId").asText();
        for (int i=0;i<5;i++) assertThat(request("/v1/auth/phone/verify",Map.of("challengeId",id,"code",wrong,"displayName","Test"),null).statusCode()).isEqualTo(401);
        assertThat(db.sql("SELECT attempts FROM phone_challenges WHERE id=:id").param("id",UUID.fromString(id)).query(Integer.class).single()).isEqualTo(5);
        assertThat(request("/v1/auth/phone/verify",Map.of("challengeId",id,"code",actual,"displayName","Test"),null).statusCode()).isEqualTo(429);
    }
    @Test void smsAndLoginRateLimitsApplyWithoutSendingSms() throws Exception {
        String phone = phone();
        for (int i=0;i<3;i++) assertThat(request("/v1/auth/phone/start",Map.of("phone",phone),null).statusCode()).isEqualTo(200);
        assertThat(request("/v1/auth/phone/start",Map.of("phone",phone),null).statusCode()).isEqualTo(429);
        String email = email();
        for (int i=0;i<10;i++) assertThat(request("/v1/auth/login",Map.of("email",email,"password",password),null).statusCode()).isEqualTo(401);
        assertThat(request("/v1/auth/login",Map.of("email",email,"password",password),null).statusCode()).isEqualTo(429);
    }
    @Test void expiredPhoneChallengeCannotCreateSession() throws Exception {
        var challenge = data(request("/v1/auth/phone/start",Map.of("phone",phone()),null));
        String id = challenge.path("challengeId").asText();
        db.sql("UPDATE phone_challenges SET expires_at=:past WHERE id=:id")
            .param("past",OffsetDateTime.parse("2000-01-01T00:00:00Z")).param("id",UUID.fromString(id)).update();
        assertThat(request("/v1/auth/phone/verify",Map.of("challengeId",id,"code",challenge.path("developmentCode").asText(),"displayName","Test"),null).statusCode()).isEqualTo(401);
    }
    @Test void developmentCodeCannotAccessVerifiedPhoneAccount() throws Exception {
        String phone = phone();
        db.sql("INSERT INTO accounts(id,display_name,phone,phone_verified,created_at) VALUES(:id,'Verified fixture',:phone,TRUE,:now)")
            .param("id",UUID.randomUUID()).param("phone",phone).param("now",OffsetDateTime.now()).update();
        var challenge = data(request("/v1/auth/phone/start",Map.of("phone",phone),null));
        assertThat(request("/v1/auth/phone/verify",Map.of("challengeId",challenge.path("challengeId").asText(),"code",challenge.path("developmentCode").asText(),"displayName","Test"),null).statusCode()).isEqualTo(403);
    }
    private String phoneLogin(String number) throws Exception {
        var challenge=data(request("/v1/auth/phone/start",Map.of("phone",number),null));
        var result=request("/v1/auth/phone/verify",Map.of("challengeId",challenge.path("challengeId").asText(),"code",challenge.path("developmentCode").asText(),"displayName","Fictional relative"),null);
        assertThat(result.statusCode()).isEqualTo(200);
        return data(result).path("token").asText();
    }
    @Test void familyAccessNeedsBothConsentsIsProfileScopedAndCanBeRevoked() throws Exception {
        String owner=register(email()).path("token").asText();
        String number=phone(); String relative=phoneLogin(number); String stranger=phoneLogin(phone());
        var shared=data(request("/v1/members",Map.of("name","Shared fixture","relationship","Father","phone",number,"inviteAccess",true),owner));
        String id=shared.path("id").asText();
        request("/v1/members",Map.of("name","Private fixture","relationship","Self"),owner);
        assertThat(data(request("/v1/members",null,relative)).size()).isZero();
        assertThat(data(request("/v1/family/invitations",null,stranger)).size()).isZero();
        assertThat(request("/v1/family/invitations/"+id+"/decision",Map.of("accept",true),stranger).statusCode()).isEqualTo(404);
        assertThat(data(request("/v1/family/invitations",null,relative)).size()).isEqualTo(1);
        assertThat(request("/v1/family/invitations/"+id+"/decision",Map.of("accept",true),relative).statusCode()).isEqualTo(200);
        assertThat(request("/v1/family/invitations/"+id+"/decision",Map.of("accept",true),relative).statusCode()).isEqualTo(200);
        assertThat(data(request("/v1/members",null,relative)).size()).isZero();
        assertThat(request("/v1/family/members/"+id+"/approve",Map.of(),relative).statusCode()).isEqualTo(404);
        assertThat(request("/v1/family/members/"+id+"/approve",Map.of(),owner).statusCode()).isEqualTo(200);
        assertThat(data(request("/v1/members",null,relative)).size()).isEqualTo(1);
        assertThat(data(request("/v1/members",null,relative)).get(0).path("owned").asBoolean()).isFalse();
        var schedule=Map.ofEntries(Map.entry("memberId",id),Map.entry("medicineName","Fictional medicine"),Map.entry("strength","Sample only"),Map.entry("doseInstruction","Confirmed fictional instructions"),Map.entry("unit","tablet"),Map.entry("times",List.of("08:00")),Map.entry("weekdays",List.of(1,2,3,4,5,6,7)),Map.entry("timezone","Asia/Kolkata"),Map.entry("startDate",java.time.LocalDate.now().toString()),Map.entry("noEndAcknowledged",true),Map.entry("reviewed",true));
        assertThat(request("/v1/schedules/preview",schedule,relative).statusCode()).isEqualTo(200);
        assertThat(request("/v1/schedules",schedule,relative).statusCode()).isEqualTo(201);
        assertThat(data(request("/v1/schedules",null,relative)).size()).isEqualTo(1);
        assertThat(data(request("/v1/schedules",null,stranger)).size()).isZero();
        String range="/v1/occurrences?from="+java.time.LocalDate.now()+"&to="+java.time.LocalDate.now().plusDays(3);
        var doses=data(request(range,null,relative));
        assertThat(doses.size()).isGreaterThan(0);
        var skipped=Map.of("eventId",UUID.randomUUID().toString(),"occurrenceId",doses.get(0).path("id").asText(),"action","SKIPPED","earlyConfirmed",false);
        assertThat(request("/v1/dose-events",skipped,relative).statusCode()).isEqualTo(200);
        assertThat(data(request(range,null,owner)).get(0).path("status").asText()).isEqualTo("SKIPPED");
        assertThat(request("/v1/family/members/"+id+"/revoke",Map.of(),stranger).statusCode()).isEqualTo(404);
        assertThat(request("/v1/family/members/"+id+"/revoke",Map.of(),owner).statusCode()).isEqualTo(200);
        assertThat(data(request("/v1/members",null,relative)).size()).isZero();
        assertThat(request("/v1/schedules/preview",schedule,relative).statusCode()).isEqualTo(404);
        assertThat(data(request("/v1/schedules",null,relative)).size()).isZero();
        assertThat(data(request(range,null,relative)).size()).isZero();
        assertThat(request("/v1/dose-events",skipped,relative).statusCode()).isEqualTo(404);
        assertThat(db.sql("SELECT action FROM family_access_events WHERE member_id=:id").param("id",UUID.fromString(id)).query(String.class).list())
            .containsExactlyInAnyOrder("INVITED","RECIPIENT_ACCEPTED","OWNER_APPROVED","REVOKED");
        assertThat(data(request("/v1/members",null,owner)).size()).isEqualTo(2);
    }
    @Test void phoneAloneAndDeclinedOrExpiredInvitationsNeverGrantAccess() throws Exception {
        String owner=register(email()).path("token").asText();
        String number=phone(); String relative=phoneLogin(number);
        request("/v1/members",Map.of("name","Contact only","relationship","Father","phone",number),owner);
        assertThat(data(request("/v1/family/invitations",null,relative)).size()).isZero();
        var invited=data(request("/v1/members",Map.of("name","Declined","relationship","Father","phone",number,"inviteAccess",true),owner));
        String id=invited.path("id").asText();
        assertThat(request("/v1/family/invitations/"+id+"/decision",Map.of("accept",false),relative).statusCode()).isEqualTo(200);
        assertThat(request("/v1/family/invitations/"+id+"/decision",Map.of("accept",true),relative).statusCode()).isEqualTo(404);
        var expired=data(request("/v1/members",Map.of("name","Expired","relationship","Father","phone",number,"inviteAccess",true),owner));
        db.sql("UPDATE members SET invite_expires_at=:past WHERE id=:id").param("past",OffsetDateTime.parse("2000-01-01T00:00:00Z")).param("id",UUID.fromString(expired.path("id").asText())).update();
        assertThat(request("/v1/family/invitations/"+expired.path("id").asText()+"/decision",Map.of("accept",true),relative).statusCode()).isEqualTo(404);
        assertThat(data(request("/v1/members",null,relative)).size()).isZero();
        assertThat(request("/v1/members",Map.of("name","No phone","relationship","Father","inviteAccess",true),owner).statusCode()).isEqualTo(422);
    }
    @Test void unverifiedDevelopmentPhoneCannotAcceptInvitationsOutsideDevelopment() throws Exception {
        String owner=register(email()).path("token").asText();
        String number=phone(); String recipient=phoneLogin(number);
        UUID accountId=UUID.fromString(data(request("/v1/auth/me",null,recipient)).path("id").asText());
        var member=data(request("/v1/members",Map.of("name","Fictional fixture","relationship","Father","phone",number,"inviteAccess",true),owner));
        var production=new com.familymedicine.domain.FamilyAccessService(db,java.time.Clock.systemUTC(),new org.springframework.core.env.StandardEnvironment());
        assertThat(production.invitations(accountId)).isEmpty();
        assertThatThrownBy(() -> production.decide(accountId,UUID.fromString(member.path("id").asText()),true)).hasMessageContaining("unavailable");
    }
    @Test void medicineDetailsHttpContractValidatesAndReturnsSavedPrescriptionFields() throws Exception {
        String token=register(email()).path("token").asText();
        String member=data(request("/v1/members",Map.of("name","Fictional medicine owner","relationship","Self"),token)).path("id").asText();
        var details=new HashMap<String,Object>(Map.of("genericName","Fictional ingredient","form","Liquid / syrup","route","By mouth","frequency","Twice daily","mealInstruction","Not specified","amountUnspecified",false,"regimenType","FIXED"));
        var input=new HashMap<String,Object>(Map.ofEntries(Map.entry("memberId",member),Map.entry("medicineName","Fictional liquid"),Map.entry("strength","125 mg/5 mL"),Map.entry("doseInstruction","Original confirmed instructions"),Map.entry("doseQuantity",5),Map.entry("unit","mL"),Map.entry("times",List.of("08:00")),Map.entry("weekdays",List.of(1,2,3,4,5,6,7)),Map.entry("timezone","Asia/Kolkata"),Map.entry("startDate",java.time.LocalDate.now().toString()),Map.entry("noEndAcknowledged",true),Map.entry("reviewed",true),Map.entry("prescriptionDetails",details)));
        var invalid=request("/v1/schedules/preview",input,token);
        assertThat(invalid.statusCode()).isEqualTo(422);
        assertThat(data(invalid).path("code").asText()).isEqualTo("FREQUENCY_MISMATCH");
        details.put("frequency","Once daily");
        var saved=request("/v1/schedules",input,token);
        assertThat(saved.statusCode()).isEqualTo(201);
        assertThat(data(saved).path("prescriptionDetails").path("mealInstruction").asText()).isEqualTo("Not specified");
        String scheduleId=data(saved).path("id").asText();
        assertThat(request("/v1/schedules/"+scheduleId+"/stock-alert",Map.of("threshold",5),token).statusCode()).isEqualTo(422);
        assertThat(data(request("/v1/schedules",null,token)).get(0).path("prescriptionDetails").path("route").asText()).isEqualTo("By mouth");
        input.put("initialStock",10); input.put("lowStockThreshold",10);
        var tracked=request("/v1/schedules",input,token);
        assertThat(tracked.statusCode()).isEqualTo(201);
        assertThat(data(tracked).path("lowStock").asBoolean()).isTrue();
        String trackedId=data(tracked).path("id").asText();
        String stranger=register(email()).path("token").asText();
        assertThat(request("/v1/schedules/"+trackedId+"/stock-alert",Map.of("threshold",1),stranger).statusCode()).isEqualTo(404);
        assertThat(request("/v1/schedules/"+trackedId+"/stock-alert",Map.of("threshold",-1),token).statusCode()).isEqualTo(422);
        assertThat(data(request("/v1/schedules/"+trackedId+"/stock-alert",Map.of("threshold",5),token)).path("lowStock").asBoolean()).isFalse();
        assertThat(data(request("/v1/schedules/"+trackedId+"/stock-alert",Collections.singletonMap("threshold",null),token)).has("lowStockThreshold")).isFalse();
    }
    @Test void productionSmsIsDisabledEvenWhenCredentialsExist() {
        var disabled = new TwilioPhoneVerification("AC" + "0".repeat(32),"placeholder-not-a-secret","VA" + "0".repeat(32),false);
        assertThat(disabled.available()).isFalse();
        assertThatThrownBy(() -> disabled.send("+15555550100")).hasMessageContaining("unavailable");
        assertThat(disabled.developmentCode("+15555550100")).isNull();
    }
}
