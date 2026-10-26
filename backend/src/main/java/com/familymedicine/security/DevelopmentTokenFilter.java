package com.familymedicine.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.UUID;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/** Local-only developer identity. Never enables authentication outside dev/test profiles. */
final class DevelopmentTokenFilter extends OncePerRequestFilter {
    static final UUID DEVELOPER = UUID.fromString("2b59ea70-1069-4e2b-b468-31784aa22700");
    private final byte[] expected;
    DevelopmentTokenFilter(String token) { expected = ("Bearer " + token).getBytes(StandardCharsets.UTF_8); }
    @Override protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String header = req.getHeader("Authorization");
        if (header != null && MessageDigest.isEqual(expected, header.getBytes(StandardCharsets.UTF_8))) {
            SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(DEVELOPER.toString(), null, List.of()));
        }
        chain.doFilter(req, res);
    }
}
