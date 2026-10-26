package com.familymedicine.api;

import com.familymedicine.security.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.security.Principal;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/auth")
public class AuthController {
    private final AuthService auth;
    public AuthController(AuthService auth) { this.auth = auth; }
    public record Registration(@NotBlank @Size(max=100) String displayName,
        @NotBlank @Email @Size(max=254) String email, @NotBlank @Size(min=12,max=72) String password) {}
    public record Login(@NotBlank @Email @Size(max=254) String email, @NotBlank @Size(max=72) String password) {}
    public record PhoneStart(@NotBlank @Pattern(regexp="\\+[1-9][0-9]{7,14}",message="Use international format, for example +919876543210") String phone) {}
    public record PhoneCheck(@NotNull UUID challengeId, @NotBlank @Pattern(regexp="[0-9]{4,10}") String code,
        @Size(max=100) String displayName) {}
    @ModelAttribute void noCache(HttpServletResponse response) { response.setHeader("Cache-Control","no-store"); }
    @GetMapping("/options") Map<String,Boolean> options() { return Map.of("phoneOtpEnabled",auth.phoneAvailable()); }
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
