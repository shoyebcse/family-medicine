package com.familymedicine.prescription;

import static com.familymedicine.prescription.PrescriptionContracts.*;
import jakarta.validation.Valid;
import java.security.Principal;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/v1")
public class PrescriptionController {
    private final PrescriptionService service;
    private final ExtractionProvider provider;
    private final PrescriptionFiles files;
    public PrescriptionController(PrescriptionService service,ExtractionProvider provider,PrescriptionFiles files) { this.service=service; this.provider=provider; this.files=files; }
    private UUID actor(Principal p) { return UUID.fromString(p.getName()); }
    @GetMapping("/prescriptions/options") Object options() { return Map.of("available",provider.available(),"mode",provider.mode(),"model",provider.mode().equals("mock")?"development-fixture":"gpt-4o-mini","maxBytes",files.maxBytes(),"maxPages",files.maxPages()); }
    @PostMapping(value="/prescriptions/extract",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    Document extract(Principal p,@RequestParam UUID memberId,@RequestHeader("Idempotency-Key") UUID key,@RequestPart List<MultipartFile> files,
            @RequestPart(required=false) List<MultipartFile> originals) {
        return service.extract(actor(p),memberId,key,files,originals);
    }
    @PostMapping(value="/prescriptions/preview-files",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    ResponseEntity<?> previewFiles(Principal p,@RequestParam UUID memberId,@RequestPart List<MultipartFile> files) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.previewFiles(actor(p),memberId,files));
    }
    @GetMapping("/members/{member}/prescriptions") List<Document> history(Principal p,@PathVariable UUID member) { return service.history(actor(p),member); }
    @GetMapping("/prescriptions/{id}") Document get(Principal p,@PathVariable UUID id) { return service.get(actor(p),id); }
    @GetMapping("/prescriptions/{id}/audit") Object audit(Principal p,@PathVariable UUID id) { return service.auditHistory(actor(p),id); }
    @GetMapping("/prescriptions/{id}/original-pages") Object originals(Principal p,@PathVariable UUID id) { return service.originalPages(actor(p),id); }
    @GetMapping("/prescriptions/{id}/originals/{index}") ResponseEntity<byte[]> original(Principal p,@PathVariable UUID id,@PathVariable int index) {
        var file=service.original(actor(p),id,index);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.parseMediaType(file.type()))
            .header("Content-Disposition","attachment; filename=prescription"+(file.type().equals("application/pdf")?".pdf":file.type().equals("image/png")?".png":".jpg"))
            .header("X-Content-Type-Options","nosniff").body(file.data());
    }
    @GetMapping("/prescriptions/{id}/pages/{index}") ResponseEntity<byte[]> page(Principal p,@PathVariable UUID id,@PathVariable int index) {
        var page=service.source(actor(p),id,index);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.parseMediaType(page.type()))
            .header("X-Content-Type-Options","nosniff").body(page.data());
    }
    @GetMapping("/prescriptions/{id}/page-data/{index}") ResponseEntity<?> pageData(Principal p,@PathVariable UUID id,@PathVariable int index) {
        var page=service.source(actor(p),id,index);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("uri","data:"+page.type()+";base64,"+Base64.getEncoder().encodeToString(page.data())));
    }
    @PostMapping("/prescriptions/{id}/draft") Document save(Principal p,@PathVariable UUID id,@Valid @RequestBody Draft draft) { return service.save(actor(p),id,draft); }
    @PostMapping("/prescriptions/{id}/schedule-preview") Object preview(Principal p,@PathVariable UUID id) { return service.preview(actor(p),id); }
    @PostMapping("/prescriptions/{id}/activate") Document activate(Principal p,@PathVariable UUID id,@Valid @RequestBody Activation input) { return service.activate(actor(p),id,input); }
    @GetMapping("/members/{member}/routine") Routine routine(Principal p,@PathVariable UUID member) { return service.routine(actor(p),member); }
    @PostMapping("/members/{member}/routine") Routine routine(Principal p,@PathVariable UUID member,@Valid @RequestBody Routine input) { return service.routine(actor(p),member,input); }
    @GetMapping("/prescriptions/{id}/plan-states") Object states(Principal p,@PathVariable UUID id) { return service.planStates(actor(p),id); }
    @PostMapping("/prescriptions/{id}/items/{item}/discontinue") Document discontinue(Principal p,@PathVariable UUID id,@PathVariable UUID item,@Valid @RequestBody Activation input) {
        return service.discontinue(actor(p),id,item,input.version());
    }
}
