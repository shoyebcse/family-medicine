package com.familymedicine.security;

import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class SecurityConfig {
    @Bean
    org.springframework.security.core.userdetails.UserDetailsService noSpringDemoUser() {
        // AuthService owns account login; never create Spring's generated demo user/password.
        return username -> { throw new org.springframework.security.core.userdetails.UsernameNotFoundException("Use the application sign-in endpoints"); };
    }
    @Bean
    SecurityFilterChain security(HttpSecurity http, Environment environment,
            @Value("${app.dev-token}") String token,
            @Value("${app.cors-origins}") String origins, AuthService auth) throws Exception {
        boolean development = environment.matchesProfiles("dev", "test");
        if (development && token.length() < 24) {
            throw new IllegalStateException("Development API requires a DEV_API_TOKEN of at least 24 characters");
        }
        var cors = new CorsConfiguration();
        cors.setAllowedOrigins(Arrays.asList(origins.split(",")));
        cors.setAllowedMethods(Arrays.asList("GET", "POST", "OPTIONS"));
        cors.setAllowedHeaders(Arrays.asList("Authorization", "Content-Type", "Idempotency-Key"));
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cors);
        http.cors(c -> c.configurationSource(source))
            .csrf(c -> c.disable()) // Stateless bearer API; no cookie authentication.
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(a -> a.requestMatchers("/health", "/v1/auth/options", "/v1/auth/register", "/v1/auth/login",
                "/v1/auth/phone/start", "/v1/auth/phone/verify").permitAll().anyRequest().authenticated())
            .exceptionHandling(e -> e.authenticationEntryPoint((req, res, ex) -> {
                res.setStatus(401); res.setContentType("application/json");
                res.getWriter().write("{\"code\":\"AUTHENTICATION_REQUIRED\",\"message\":\"Sign in is required\"}");
            }));
        if (development) http.addFilterBefore(new DevelopmentTokenFilter(token), UsernamePasswordAuthenticationFilter.class);
        http.addFilterBefore(new SessionTokenFilter(auth), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
