package com.familymedicine.prescription;

import com.familymedicine.api.Contracts.*;
import com.familymedicine.domain.*;
import static com.familymedicine.prescription.PrescriptionContracts.*;
import jakarta.validation.Validator;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.json.JsonMapper;

@Service
public class PrescriptionService {
    private final JdbcClient db;
    private final MedicineService medicines;
    private final PrescriptionFiles files;
    private final ExtractionProvider provider;
    private final PrescriptionCipher cipher;
    private final Clock clock;
    private final Validator validator;
    private final JsonMapper json=JsonMapper.builder().build();
    public PrescriptionService(JdbcClient db,MedicineService medicines,PrescriptionFiles files,ExtractionProvider provider,
            PrescriptionCipher cipher,Clock clock,Validator validator) {
        this.db=db; this.medicines=medicines; this.files=files; this.provider=provider; this.cipher=cipher; this.clock=clock; this.validator=validator;
    }
    private String protect(UUID id,Object value) { return Base64.getEncoder().encodeToString(cipher.encrypt(json.writeValueAsBytes(value),id.toString())); }
    private <T> T read(UUID id,String text,Class<T> type) { return json.readValue(cipher.decrypt(Base64.getDecoder().decode(text),id.toString()),type); }
    private void audit(UUID id,UUID actor,String action,int version,Object snapshot) {
        db.sql("INSERT INTO prescription_audit(id,prescription_id,actor_id,action,recorded_at,version,snapshot) VALUES(:id,:rx,:actor,:action,:now,:version,:snapshot)")
            .param("id",UUID.randomUUID()).param("rx",id).param("actor",actor).param("action",action)
            .param("now",OffsetDateTime.ofInstant(clock.instant(),ZoneOffset.UTC)).param("version",version).param("snapshot",protect(id,snapshot)).update();
    }
    @Transactional
    public Document extract(UUID actor,UUID member,UUID key,List<MultipartFile> uploads) {
        return extract(actor,member,key,uploads,null);
    }
    @Transactional
    public Document extract(UUID actor,UUID member,UUID key,List<MultipartFile> uploads,List<MultipartFile> originals) {
        medicines.requireMember(actor,member);
        var pages=files.read(uploads);
        var originalFiles=originals==null || originals.isEmpty()?uploads:originals;
        if(originalFiles!=uploads) files.read(originalFiles);
        // Serialize imports for this patient; retries wait and reuse the completed result.
        db.sql("SELECT id FROM members WHERE id=:id FOR UPDATE").param("id",member).query(UUID.class).single();
        String hash;
        try {
            var digest=MessageDigest.getInstance("SHA-256"); digest.update(member.toString().getBytes(StandardCharsets.UTF_8));
            for(var file:uploads) { digest.update(java.nio.ByteBuffer.allocate(8).putLong(file.getSize()).array()); digest.update(file.getBytes()); }
            if(originalFiles!=uploads) for(var file:originalFiles) { digest.update(java.nio.ByteBuffer.allocate(8).putLong(file.getSize()).array()); digest.update(file.getBytes()); }
            hash=HexFormat.of().formatHex(digest.digest());
        } catch(Exception e) { throw new RuleViolation("INVALID_UPLOAD","Could not read prescription files"); }
        var previous=db.sql("SELECT id,request_hash FROM prescriptions WHERE uploader_id=:actor AND command_key=:key")
            .param("actor",actor).param("key",key).query((r,n)->Map.entry(r.getObject(1,UUID.class),r.getString(2))).optional();
        if(previous.isPresent()) {
            if(!previous.get().getValue().equals(hash)) throw conflict();
            return get(actor,previous.get().getKey());
        }
        UUID id=UUID.randomUUID();
        // Confirm encryption configuration before making any billable request.
        protect(id,Map.of());
        var result=provider.extract(pages);
        var items=result.medicines().stream().map(m->new Item(UUID.randomUUID(),m,null,false,null,Map.of())).toList();
        db.sql("INSERT INTO prescriptions(id,member_id,uploader_id,command_key,request_hash,created_at,status,extraction,draft) VALUES(:id,:member,:actor,:key,:hash,:now,'REVIEW_REQUIRED',:extraction,:draft)")
            .param("id",id).param("member",member).param("actor",actor).param("key",key).param("hash",hash)
            .param("now",OffsetDateTime.ofInstant(clock.instant(),ZoneOffset.UTC)).param("extraction",protect(id,result))
            .param("draft",protect(id,new Draft(1,items))).update();
        for(int i=0;i<pages.size();i++) db.sql("INSERT INTO prescription_sources(prescription_id,page_index,media_type,encrypted_data) VALUES(:id,:index,:type,:data)")
            .param("id",id).param("index",i).param("type",pages.get(i).type()).param("data",cipher.encrypt(pages.get(i).data(),id+":"+i)).update();
        try { for(int i=0;i<originalFiles.size();i++) {
            byte[] original=originalFiles.get(i).getBytes();
            String type=original[0]=='%'?"application/pdf":original[0]==(byte)137?"image/png":"image/jpeg";
            db.sql("INSERT INTO prescription_originals(prescription_id,file_index,media_type,encrypted_data) VALUES(:id,:index,:type,:data)")
            .param("id",id).param("index",i).param("type",type).param("data",cipher.encrypt(original,id+":original:"+i)).update();
        }
        } catch(java.io.IOException e) { throw new RuleViolation("INVALID_UPLOAD","Could not preserve the original prescription"); }
        audit(id,actor,"EXTRACTED",1,new Draft(1,items));
        db.sql("UPDATE prescriptions SET extraction_mode=:mode WHERE id=:id").param("mode",provider.mode()).param("id",id).update();
        return get(actor,id);
    }
    public Document get(UUID actor,UUID id) {
        var member=db.sql("SELECT member_id FROM prescriptions WHERE id=:id").param("id",id).query(UUID.class).optional()
            .orElseThrow(()->new RuleViolation("NOT_FOUND","Prescription is unavailable",404));
        medicines.requireMember(actor,member);
        return db.sql("SELECT * FROM prescriptions WHERE id=:id").param("id",id).query((r,n)->new Document(id,member,r.getString("status"),r.getInt("version"),
            r.getObject("created_at",OffsetDateTime.class).toInstant(),read(id,r.getString("extraction"),Extraction.class),
            read(id,r.getString("draft"),Draft.class).items(),
            db.sql("SELECT page_index,media_type FROM prescription_sources WHERE prescription_id=:id ORDER BY page_index").param("id",id).query((s,k)->new Source(s.getInt(1),s.getString(2))).list(),
            plans(id),r.getString("extraction_mode"))).single();
    }
    private Map<UUID,UUID> plans(UUID id) {
        Map<UUID,UUID> result=new LinkedHashMap<>();
        db.sql("SELECT item_id,schedule_id FROM prescription_plans WHERE prescription_id=:id").param("id",id)
            .query((r,n)->Map.entry(r.getObject(1,UUID.class),r.getObject(2,UUID.class))).list().forEach(e->result.put(e.getKey(),e.getValue()));
        return result;
    }
    public List<Document> history(UUID actor,UUID member) {
        medicines.requireMember(actor,member);
        return db.sql("SELECT id FROM prescriptions WHERE member_id=:member ORDER BY created_at DESC LIMIT 100").param("member",member)
            .query(UUID.class).list().stream().map(id->get(actor,id)).toList();
    }
    public PrescriptionFiles.Page source(UUID actor,UUID id,int index) {
        get(actor,id);
        return db.sql("SELECT media_type,encrypted_data FROM prescription_sources WHERE prescription_id=:id AND page_index=:index")
            .param("id",id).param("index",index).query((r,n)->new PrescriptionFiles.Page(r.getString(1),cipher.decrypt(r.getBytes(2),id+":"+index)))
            .optional().orElseThrow(()->new RuleViolation("NOT_FOUND","Page is unavailable",404));
    }
    public List<String> previewFiles(UUID actor,UUID member,List<MultipartFile> uploads) {
        medicines.requireMember(actor,member);
        return files.read(uploads).stream().map(page->"data:"+page.type()+";base64,"+Base64.getEncoder().encodeToString(page.data())).toList();
    }
    public PrescriptionFiles.Page original(UUID actor,UUID id,int index) {
        get(actor,id);
        return db.sql("SELECT media_type,encrypted_data FROM prescription_originals WHERE prescription_id=:id AND file_index=:index")
            .param("id",id).param("index",index).query((r,n)->new PrescriptionFiles.Page(r.getString(1),cipher.decrypt(r.getBytes(2),id+":original:"+index)))
            .optional().orElseThrow(()->new RuleViolation("NOT_FOUND","Original file is unavailable",404));
    }
    public List<Map<String,Object>> auditHistory(UUID actor,UUID id) {
        get(actor,id);
        return db.sql("SELECT actor_id,action,recorded_at,version FROM prescription_audit WHERE prescription_id=:id ORDER BY recorded_at,version")
            .param("id",id).query((r,n)->Map.<String,Object>of("actorId",r.getObject(1,UUID.class),"action",r.getString(2),"recordedAt",r.getObject(3,OffsetDateTime.class),"version",r.getInt(4))).list();
    }
    public List<String> originalPages(UUID actor,UUID id) {
        get(actor,id);
        var data=db.sql("SELECT file_index,encrypted_data FROM prescription_originals WHERE prescription_id=:id ORDER BY file_index")
            .param("id",id).query((r,n)->cipher.decrypt(r.getBytes(2),id+":original:"+r.getInt(1))).list();
        return files.render(data).stream().map(page->"data:"+page.type()+";base64,"+Base64.getEncoder().encodeToString(page.data())).toList();
    }
    private Document lock(UUID actor,UUID id,int version) {
        var document=get(actor,id);
        int current=db.sql("SELECT version FROM prescriptions WHERE id=:id FOR UPDATE").param("id",id).query(Integer.class).single();
        if(current!=version) throw new StalePrescription(current);
        return document;
    }
    @Transactional
    public Document save(UUID actor,UUID id,Draft draft) {
        var document=lock(actor,id,draft.version());
        if(new HashSet<>(draft.items().stream().map(Item::id).toList()).size()!=draft.items().size()) throw new RuleViolation("DUPLICATE_ITEM","Each medicine needs a distinct identity");
        for(var item:draft.items()) {
            var previous=document.items().stream().filter(i->i.id().equals(item.id())).findFirst();
            if(document.plans().containsKey(item.id()) && !previous.orElseThrow().equals(item))
                throw new RuleViolation("ALREADY_ACTIVE","An active entry cannot be edited here. Discontinue its plan and add a new entry.");
            if(item.schedule()!=null && !document.memberId().equals(item.schedule().memberId())) throw new RuleViolation("PATIENT_MISMATCH","The schedule must belong to the selected patient");
        }
        for(var active:document.plans().keySet()) if(draft.items().stream().noneMatch(i->i.id().equals(active)))
            throw new RuleViolation("ALREADY_ACTIVE","An activated entry cannot be removed from prescription history");
        int next=draft.version()+1;
        db.sql("UPDATE prescriptions SET draft=:draft,version=:version WHERE id=:id")
            .param("draft",protect(id,new Draft(next,draft.items()))).param("version",next).param("id",id).update();
        audit(id,actor,"DRAFT_SAVED",next,draft);
        return get(actor,id);
    }
    private void validate(Item item,UUID member) {
        var input=item.schedule();
        if(!item.verified() || input==null || !input.reviewed() || !member.equals(input.memberId())) throw new RuleViolation("REVIEW_REQUIRED","Verify medicine identity and every regimen field first");
        if(item.evidence().sos()) throw new RuleViolation("UNSUPPORTED_REGIMEN","As-needed medicines must remain drafts; fixed alarms are not appropriate");
        var evidence=item.evidence();
        if(evidence.brand()==null || evidence.brand().isBlank() || evidence.dose()==null || evidence.dose().isBlank() || evidence.frequency()==null || evidence.frequency().isBlank() || evidence.duration()==null || evidence.duration().isBlank())
            throw new RuleViolation("INSTRUCTIONS_UNRESOLVED","Confirm medicine identity, dose, frequency and duration before activation");
        String frequency=Map.of("OD", "Once daily", "BD", "Twice daily", "TDS", "Three times daily", "QID", "Four times daily", "HS", "Once daily").getOrDefault(evidence.frequency().strip().toUpperCase(Locale.ROOT),evidence.frequency().strip());
        if(!List.of("Once daily","Twice daily","Three times daily","Four times daily").contains(frequency))
            throw new RuleViolation("UNSUPPORTED_REGIMEN","Only confirmed fixed daily regimens are supported in prescription import");
        if(!evidence.brand().strip().equals(input.medicineName().strip())) throw new RuleViolation("MEDICINE_MISMATCH","The confirmed medicine must match the reviewed entry");
        if(item.evidence().unclear() && (item.reviewNote()==null || item.reviewNote().isBlank())) throw new RuleViolation("UNCERTAINTY_UNRESOLVED","Record how the unclear instructions were confirmed");
        if(input.doseQuantity()==null || input.prescriptionDetails()==null || input.prescriptionDetails().amountUnspecified())
            throw new RuleViolation("DOSE_REQUIRED","Confirm the dose and unit before activating an imported prescription");
        if(!frequency.equals(input.prescriptionDetails().frequency())) throw new RuleViolation("FREQUENCY_MISMATCH","The reviewed frequency must match the confirmed schedule");
        if(evidence.pattern()!=null && !evidence.pattern().isBlank()) {
            if(!List.of("1-0-1","1-1-1","0-0-1","1-0-0","0-1-0").contains(evidence.pattern().strip()))
                throw new RuleViolation("UNSUPPORTED_REGIMEN","Changing-dose patterns must remain drafts");
            long expected=Arrays.stream(evidence.pattern().strip().split("-")).filter("1"::equals).count();
            if(expected!=input.times().size()) throw new RuleViolation("FREQUENCY_MISMATCH","The reviewed pattern must match the reminder count");
        }
        if(!validator.validate(input).isEmpty()) throw new RuleViolation("INVALID_SCHEDULE","Check required schedule fields and permitted field lengths");
        SchedulePlanner.plan(UUID.randomUUID(),input,clock.instant());
    }
    public Map<UUID,SchedulePreview> preview(UUID actor,UUID id) {
        var document=get(actor,id); Map<UUID,SchedulePreview> result=new LinkedHashMap<>();
        for(var item:document.items()) if(item.verified() && !document.plans().containsKey(item.id())) {
            try { validate(item,document.memberId()); result.put(item.id(),medicines.preview(actor,item.schedule())); }
            catch(RuleViolation e) { throw new RuleViolation(e.code(),"Medicine "+(document.items().indexOf(item)+1)+": "+e.getMessage(),e.status()); }
        }
        if(result.isEmpty()) throw new RuleViolation("REVIEW_REQUIRED","Select and verify at least one new medicine");
        return result;
    }
    @Transactional
    public Document activate(UUID actor,UUID id,Activation input) {
        get(actor,id);
        db.sql("SELECT version FROM prescriptions WHERE id=:id FOR UPDATE").param("id",id).query(Integer.class).single();
        var existing=get(actor,id);
        var selected=new HashSet<>(input.itemIds());
        if(selected.size()!=input.itemIds().size()) throw new RuleViolation("DUPLICATE_ITEM","Choose each medicine only once");
        // Completed retries return existing links, including after a lost response.
        if(existing.plans().keySet().containsAll(selected)) return existing;
        if(existing.version()!=input.version()) throw new StalePrescription(existing.version());
        var document=existing;
        var items=document.items().stream().filter(i->selected.contains(i.id())).toList();
        if(items.size()!=selected.size()) throw new RuleViolation("INVALID_ITEM","A selected medicine is unavailable");
        for(var item:items) validate(item,document.memberId());
        var fingerprints=new HashSet<String>();
        for(var item:document.items()) if(document.plans().containsKey(item.id()) || selected.contains(item.id())) {
            var s=item.schedule();
            String fingerprint=s.medicineName().strip().toLowerCase(Locale.ROOT)+"|"+s.strength()+"|"+s.doseQuantity()+"|"+s.unit()+"|"+s.times().stream().sorted().toList()+"|"+s.startDate()+"|"+s.endDate();
            if(!fingerprints.add(fingerprint)) throw new RuleViolation("DUPLICATE_MEDICINE","Two entries describe the same medicine and schedule. Review and remove the duplicate before activation.");
        }
        for(var item:items) if(!document.plans().containsKey(item.id())) {
            UUID key=UUID.nameUUIDFromBytes((id+":"+item.id()).getBytes(StandardCharsets.UTF_8));
            var schedule=medicines.activate(actor,key,item.schedule());
            if("mock".equals(document.extractionMode())) db.sql("UPDATE schedules SET sample_data=TRUE WHERE id=:id").param("id",schedule.id()).update();
            db.sql("INSERT INTO prescription_plans(prescription_id,item_id,schedule_id) VALUES(:rx,:item,:schedule)")
                .param("rx",id).param("item",item.id()).param("schedule",schedule.id()).update();
        }
        db.sql("UPDATE prescriptions SET version=version+1,status='PARTIALLY_OR_FULLY_ACTIVATED' WHERE id=:id").param("id",id).update();
        audit(id,actor,"ACTIVATED",input.version()+1,input);
        return get(actor,id);
    }
    public Routine routine(UUID actor,UUID member) {
        medicines.requireMember(actor,member);
        return db.sql("SELECT routine FROM patient_routines WHERE member_id=:member").param("member",member)
            .query((r,n)->read(member,r.getString(1),Routine.class)).optional().orElse(new Routine(null,null,null,null,null,"Asia/Kolkata"));
    }
    @Transactional public Routine routine(UUID actor,UUID member,Routine routine) {
        medicines.requireMember(actor,member);
        try { ZoneId.of(routine.timezone()); } catch(DateTimeException e) { throw new RuleViolation("INVALID_TIMEZONE","Choose a valid named timezone"); }
        db.sql("SELECT id FROM members WHERE id=:id FOR UPDATE").param("id",member).query(UUID.class).single();
        db.sql("DELETE FROM patient_routines WHERE member_id=:member").param("member",member).update();
        db.sql("INSERT INTO patient_routines(member_id,routine) VALUES(:member,:routine)").param("member",member).param("routine",protect(member,routine)).update();
        return routine;
    }
    private RuleViolation conflict() { return new RuleViolation("STALE_PRESCRIPTION","The prescription changed. Refresh, review the current version, and submit again.",409); }
    @Transactional public Document discontinue(UUID actor,UUID id,UUID item,int version) {
        var document=lock(actor,id,version);
        var schedule=document.plans().get(item);
        if(schedule==null) throw new RuleViolation("NOT_FOUND","Linked medicine plan is unavailable",404);
        db.sql("UPDATE schedules SET discontinued=TRUE WHERE id=:id").param("id",schedule).update();
        db.sql("UPDATE prescriptions SET version=version+1 WHERE id=:id").param("id",id).update();
        audit(id,actor,"DISCONTINUED",version+1,Map.of("itemId",item));
        return get(actor,id);
    }
    public Map<UUID,String> planStates(UUID actor,UUID id) {
        get(actor,id); Map<UUID,String> result=new LinkedHashMap<>();
        db.sql("SELECT p.item_id,s.discontinued,s.end_date,s.timezone FROM prescription_plans p JOIN schedules s ON s.id=p.schedule_id WHERE p.prescription_id=:id")
            .param("id",id).query((r,n)-> {
                var end=r.getObject(3,LocalDate.class);
                String state=r.getBoolean(2)?"DISCONTINUED":end!=null && end.isBefore(clock.instant().atZone(ZoneId.of(r.getString(4))).toLocalDate())?"COMPLETED":"ACTIVE";
                return Map.entry(r.getObject(1,UUID.class),state);
            }).list().forEach(e->result.put(e.getKey(),e.getValue()));
        return result;
    }
}
