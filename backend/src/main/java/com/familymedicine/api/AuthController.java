package com.familymedicine.api;

import com.familymedicine.security.AuthService;
import com.familymedicine.security.GoogleSignIn;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.security.Principal;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/auth")
public class AuthController {
    private final AuthService auth;
    private final GoogleSignIn google;
    public AuthController(AuthService auth, GoogleSignIn google) { this.auth = auth; this.google = google; }
    public record Registration(@NotBlank @Size(max=100) String displayName,
        @NotBlank @Email @Size(max=254) String email, @NotBlank @Size(min=12,max=72) String password) {}
    public record Login(@NotBlank @Email @Size(max=254) String email, @NotBlank @Size(max=72) String password) {}
    public record PhoneStart(@NotBlank @Pattern(regexp="\\+[1-9][0-9]{7,14}",message="Use international format, for example +919876543210") String phone) {}
    public record PhoneCheck(@NotNull UUID challengeId, @NotBlank @Pattern(regexp="[0-9]{4,10}") String code,
        @Size(max=100) String displayName) {}
    public record GoogleStart(boolean web) {}
    public record GoogleComplete(@NotBlank @Pattern(regexp="[A-Za-z0-9_-]{43}") String ticket,
        @NotBlank @Pattern(regexp="[A-Za-z0-9_-]{43}") String clientSecret) {}
    @ModelAttribute void noCache(HttpServletResponse response) { response.setHeader("Cache-Control","no-store"); }
    @GetMapping("/options") Map<String,Boolean> options(@RequestParam(defaultValue="false") boolean web) {
        return Map.of("phoneOtpEnabled",auth.phoneAvailable(), "googleEnabled", google.available(web));
    }
    @PostMapping("/google/start") GoogleSignIn.Start googleStart(@RequestBody GoogleStart input, HttpServletRequest request) {
        return google.start(input.web(), request.getRemoteAddr());
    }
    @GetMapping("/google/callback") ResponseEntity<?> googleCallback(@RequestParam(required=false) String state,
            @RequestParam(required=false) String code) {
        var destination = google.callback(state, code);
        if (!"family-medicine".equals(destination.getScheme())) {
            return ResponseEntity.status(HttpStatus.SEE_OTHER).location(destination)
                .header("Referrer-Policy", "no-referrer").build();
        }
        // An explicit tap lets mobile browsers open the installed app reliably.
        return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).header("Referrer-Policy", "no-referrer")
            .header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
            .body("""
                <!doctype html><html lang="en"><meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Family Medicine sign-in</title>
                <h1>Family Medicine</h1><p><a href="%s">Return to Family Medicine</a></p></html>
                """.formatted(destination.toASCIIString()));
    }
    @PostMapping("/google/complete") AuthService.Session googleComplete(@Valid @RequestBody GoogleComplete input) {
        return google.complete(input.ticket(), input.clientSecret());
    }
    @PostMapping("/register") @ResponseStatus(HttpStatus.CREATED)
    AuthService.Session register(@Valid @RequestBody Registration input, HttpServletRequest request) {
        return auth.register(input.displayName(),input.email(),input.password(),request.getRemoteAddr());
    }
    @PostMapping("/login") AuthService.Session login(@Valid @RequestBody Login input, HttpServletRequest request) {
        return auth.login(input.email(),input.password(),request.getRemoteAddr());
    }
    @PostMapping("/phone/start") AuthService.Challenge phone(@Valid @RequestBody PhoneStart input, HttpServletRequest request) {
        return auth.startPhone(input.phone(),request.getRemoteAddr());
    }
    @PostMapping("/phone/verify") AuthService.Session verify(@Valid @RequestBody PhoneCheck input, HttpServletRequest request) {
        return auth.verifyPhone(input.challengeId(),input.code(),input.displayName(),request.getRemoteAddr());
    }
    @GetMapping("/me") AuthService.Account me(Principal principal) { return auth.account(UUID.fromString(principal.getName())); }
    @PostMapping("/logout") Map<String,Boolean> logout(@RequestHeader("Authorization") String header) {
        auth.logout(header.substring(7)); return Map.of("signedOut",true);
    }
}
