package com.familymedicine.prescription;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class PrescriptionCacheFilter extends OncePerRequestFilter {
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
        if(request.getRequestURI().contains("prescriptions") || request.getRequestURI().endsWith("/routine")) {
            response.setHeader("Cache-Control","no-store");
            response.setHeader("Pragma","no-cache");
        }
        chain.doFilter(request,response);
    }
}
