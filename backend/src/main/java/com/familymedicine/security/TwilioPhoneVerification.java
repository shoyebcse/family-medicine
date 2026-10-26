package com.familymedicine.security;

import com.familymedicine.domain.RuleViolation;
import tools.jackson.databind.json.JsonMapper;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Profile;

@Component
@Profile("!dev & !test")
public class TwilioPhoneVerification implements PhoneVerification {
    private final String account, secret, service;
    private final boolean enabled;
    private final JsonMapper json = JsonMapper.builder().build();
    public TwilioPhoneVerification(@Value("${TWILIO_ACCOUNT_SID:}") String account,
            @Value("${TWILIO_AUTH_TOKEN:}") String secret, @Value("${TWILIO_VERIFY_SERVICE_SID:}") String service,
            @Value("${app.auth.sms-enabled:false}") boolean enabled) {
        this.account = account; this.secret = secret; this.service = service;
        this.enabled = enabled;
    }
    public boolean available() { return enabled && account.matches("AC[0-9a-fA-F]{32}") && !secret.isBlank() && service.matches("VA[0-9a-fA-F]{32}"); }
    public void send(String phone) { call("Verifications", "To=" + encode(phone) + "&Channel=sms"); }
    public boolean verify(String phone, String code) {
        return "approved".equals(call("VerificationCheck", "To=" + encode(phone) + "&Code=" + encode(code)));
    }
    private String call(String path, String form) {
        if (!available()) throw unavailable();
        var request = HttpRequest.newBuilder(URI.create("https://verify.twilio.com/v2/Services/" + service + "/" + path))
            .timeout(Duration.ofSeconds(10)).header("Content-Type", "application/x-www-form-urlencoded")
            .header("Authorization", "Basic " + Base64.getEncoder().encodeToString((account + ":" + secret).getBytes(StandardCharsets.UTF_8)))
            .POST(HttpRequest.BodyPublishers.ofString(form)).build();
        try {
            var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (path.equals("VerificationCheck") && (response.statusCode() == 404 || response.statusCode() == 400)) return "denied";
            if (response.statusCode() == 429) throw new RuleViolation("TOO_MANY_ATTEMPTS", "Too many SMS attempts. Please wait before retrying.", 429);
            if (response.statusCode() < 200 || response.statusCode() >= 300) throw unavailable();
            return json.readTree(response.body()).path("status").asText();
        } catch (InterruptedException error) { Thread.currentThread().interrupt(); throw unavailable(); }
        catch (java.io.IOException error) { throw unavailable(); }
        catch (tools.jackson.core.JacksonException error) { throw unavailable(); }
    }
    private static String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
    private static RuleViolation unavailable() { return new RuleViolation("PHONE_UNAVAILABLE", "Phone sign-in is unavailable. Use email/password or try again later.", 503); }
}
