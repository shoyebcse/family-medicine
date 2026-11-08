package com.familymedicine.security;

import com.familymedicine.domain.RuleViolation;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Component
public class GoogleOidc {
    public record Identity(String subject, String email, String name) {}

    private final String clientId, clientSecret, callback, webReturn;
    private final Clock clock;
    private final JsonMapper json = JsonMapper.builder().build();

    public GoogleOidc(@Value("${GOOGLE_CLIENT_ID:}") String clientId,
            @Value("${GOOGLE_CLIENT_SECRET:}") String clientSecret,
            @Value("${GOOGLE_CALLBACK_URL:}") String callback,
            @Value("${GOOGLE_WEB_RETURN_URL:}") String webReturn, Clock clock) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.callback = callback;
        this.webReturn = webReturn;
        this.clock = clock;
    }

    boolean available(boolean web) {
        return clientId.endsWith(".apps.googleusercontent.com") && !clientSecret.isBlank()
            && safeUrl(callback) && (!web || safeUrl(webReturn));
    }

    URI returnTo(boolean web, String result) {
        return URI.create(web ? webReturn + "#" + result : "family-medicine:///?"+result);
    }

    String authorize(String state, String nonce, String challenge) {
        return "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&scope=openid+email+profile"
            + "&client_id=" + encode(clientId) + "&redirect_uri=" + encode(callback)
            + "&state=" + encode(state) + "&nonce=" + encode(nonce)
            + "&code_challenge_method=S256&code_challenge=" + encode(challenge) + "&prompt=select_account";
    }

    Identity exchange(String code, String verifier, String nonce) {
        String form = "grant_type=authorization_code&code=" + encode(code)
            + "&client_id=" + encode(clientId) + "&client_secret=" + encode(clientSecret)
            + "&redirect_uri=" + encode(callback) + "&code_verifier=" + encode(verifier);
        var request = HttpRequest.newBuilder(URI.create("https://oauth2.googleapis.com/token"))
            .timeout(Duration.ofSeconds(10)).header("Content-Type", "application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString(form)).build();
        try {
            var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) throw denied();
            // Accept ID tokens only from the direct Google HTTPS exchange, never from the app.
            var token = json.readTree(response.body()).path("id_token").asText();
            String[] parts = token.split("\\.", -1);
            if (parts.length != 3 || parts[2].isBlank()) throw denied();
            return identity(json.readTree(Base64.getUrlDecoder().decode(parts[1])), nonce);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw denied();
        } catch (IOException | JacksonException | IllegalArgumentException e) {
            throw denied();
        }
    }

    private Identity identity(JsonNode claims, String nonce) {
        String issuer = claims.path("iss").asText();
        String subject = claims.path("sub").asText();
        String email = claims.path("email").asText().strip().toLowerCase(Locale.ROOT);
        if ((!issuer.equals("https://accounts.google.com") && !issuer.equals("accounts.google.com"))
            || !clientId.equals(claims.path("aud").asText())
            || claims.path("exp").asLong() <= clock.instant().getEpochSecond()
            || !nonce.equals(claims.path("nonce").asText())
            || !claims.path("email_verified").asBoolean(false)
            || subject.isBlank() || subject.length() > 255 || email.isBlank() || email.length() > 254) {
            throw denied();
        }
        String name = claims.path("name").asText().strip();
        if (name.isEmpty()) name = email;
        int end = name.offsetByCodePoints(0, Math.min(100, name.codePointCount(0, name.length())));
        return new Identity(subject, email, name.substring(0, end));
    }

    private static boolean safeUrl(String value) {
        try {
            var uri = URI.create(value);
            return uri.getHost() != null && uri.getUserInfo() == null && uri.getFragment() == null
                && uri.getQuery() == null && ("https".equals(uri.getScheme())
                    || ("http".equals(uri.getScheme()) && "localhost".equals(uri.getHost())));
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private static String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
    private static RuleViolation denied() {
        return new RuleViolation("GOOGLE_AUTH_FAILED", "Google sign-in could not be verified. Try again.", 401);
    }
}
