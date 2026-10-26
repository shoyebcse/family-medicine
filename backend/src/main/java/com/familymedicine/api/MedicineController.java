package com.familymedicine.api;

import com.familymedicine.api.Contracts.*;
import com.familymedicine.domain.MedicineService;
import jakarta.validation.Valid;
import java.security.Principal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1")
public class MedicineController {
    private final MedicineService service;
    public MedicineController(MedicineService service) { this.service=service; }
    private UUID actor(Principal principal) { return UUID.fromString(principal.getName()); }
    @GetMapping("/members") List<Member> members(Principal p) { return service.members(actor(p)); }
    @PostMapping("/members") @ResponseStatus(HttpStatus.CREATED)
    Member createMember(Principal p,@Valid @RequestBody MemberInput input) { return service.createMember(actor(p),input); }
    @GetMapping("/schedules") List<Schedule> schedules(Principal p) { return service.schedules(actor(p)); }
    @PostMapping("/schedules/{id}/stock-alert") Schedule stockAlert(Principal p,@PathVariable UUID id,@Valid @RequestBody StockAlertInput input) {
        return service.updateStockAlert(actor(p),id,input);
    }
    @PostMapping("/schedules/preview")
    SchedulePreview preview(Principal p,@Valid @RequestBody ScheduleInput input) { return service.preview(actor(p),input); }
    @PostMapping("/schedules") @ResponseStatus(HttpStatus.CREATED)
    Schedule activate(Principal p,@RequestHeader("Idempotency-Key") UUID key,@Valid @RequestBody ScheduleInput input) {
        return service.activate(actor(p),key,input);
    }
    @GetMapping("/occurrences")
    List<Occurrence> occurrences(Principal p,@RequestParam LocalDate from,@RequestParam LocalDate to,
            @RequestParam(defaultValue="Asia/Kolkata") String timezone) {
        return service.occurrences(actor(p),from,to,timezone);
    }
    @PostMapping("/dose-events")
    DoseResult record(Principal p,@Valid @RequestBody DoseInput input) { return service.record(actor(p),input); }
}
