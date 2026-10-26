package com.familymedicine.api;

import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
public class HealthController {
    @GetMapping("/health") Map<String,String> health() { return Map.of("status","ok"); }
}
