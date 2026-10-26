package com.familymedicine.api;

import com.familymedicine.domain.FamilyAccessService;
import java.security.Principal;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/family")
public class FamilyAccessController {
    public record Decision(boolean accept) {}
    private final FamilyAccessService service;
    public FamilyAccessController(FamilyAccessService service) { this.service=service; }
    @GetMapping("/invitations") List<FamilyAccessService.Invitation> invitations(Principal p) { return service.invitations(UUID.fromString(p.getName())); }
    @PostMapping("/invitations/{memberId}/decision") Map<String,Boolean> decide(Principal p,@PathVariable UUID memberId,@RequestBody Decision input) {
        service.decide(UUID.fromString(p.getName()),memberId,input.accept()); return Map.of("saved",true);
    }
    @PostMapping("/members/{memberId}/approve") Map<String,Boolean> approve(Principal p,@PathVariable UUID memberId) {
        service.approve(UUID.fromString(p.getName()),memberId); return Map.of("saved",true);
    }
    @PostMapping("/members/{memberId}/revoke") Map<String,Boolean> revoke(Principal p,@PathVariable UUID memberId) {
        service.revoke(UUID.fromString(p.getName()),memberId); return Map.of("saved",true);
    }
}
