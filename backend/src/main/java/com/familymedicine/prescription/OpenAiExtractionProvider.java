package com.familymedicine.prescription;

import com.familymedicine.domain.RuleViolation;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

@Component
public class OpenAiExtractionProvider implements ExtractionProvider {
    private final String key;
    private final boolean enabled;
    private final String prompt;
    private final String guidance;
    private final ExtractionDiagnostics diagnostics;
    private final String mode;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final JsonMapper json=JsonMapper.builder().build();
    public OpenAiExtractionProvider(String key,boolean enabled) throws java.io.IOException { this(key,enabled,null,"openai"); }
    @org.springframework.beans.factory.annotation.Autowired
    public OpenAiExtractionProvider(@Value("${OPENAI_API_KEY:}") String key,
            @Value("${PRESCRIPTION_EXTRACTION_ENABLED:false}") boolean enabled,ExtractionDiagnostics diagnostics,
            @Value("${PRESCRIPTION_EXTRACTION_MODE:openai}") String mode) throws java.io.IOException {
        this.key=key; this.enabled=enabled;
        this.diagnostics=diagnostics;
        this.mode=mode;
        prompt=new ClassPathResource("prescription-prompt.txt").getContentAsString(StandardCharsets.UTF_8);
        guidance=new ClassPathResource("prescription-extraction-guidance.txt").getContentAsString(StandardCharsets.UTF_8);
    }
    static Map<String,Object> object(Map<String,Object> properties) {
        return Map.of("type","object","properties",properties,"required",new ArrayList<>(properties.keySet()),"additionalProperties",false);
    }
    static Map<String,Object> schema() {
        var text=Map.of("type",List.of("string","null"));
        Map<String,Object> fields=new LinkedHashMap<>();
        for(String name:List.of("raw","brand","strength","dose","frequency","pattern","food","duration")) fields.put(name,text);
        fields.put("timing",Map.of("type","array","items",Map.of("type","string")));
        fields.put("sos",Map.of("type","boolean")); fields.put("unclear",Map.of("type","boolean"));
        return object(Map.of("patient",object(Map.of("name",text)),"doctor",object(Map.of("name",text)),"date",text,
            "medicines",Map.of("type","array","items",object(fields))));
    }
    @Override public PrescriptionContracts.Extraction extract(List<PrescriptionFiles.Page> pages) {
        if(!available())
            throw new RuleViolation("EXTRACTION_NOT_CONFIGURED","Prescription extraction is not enabled. Configure the backend OpenAI key or enter medicines manually.",503);
        var body=requestBody(pages);
        return send(pages,body);
    }
    Map<String,Object> requestBody(List<PrescriptionFiles.Page> pages) {
        var content=new ArrayList<Map<String,Object>>();
        content.add(Map.of("type","input_text","text",prompt));
        for(int index=0;index<pages.size();index++) {
            var page=pages.get(index);
            content.add(Map.of("type","input_text","text","Prescription page "+(index+1)+" of "+pages.size()+". Inspect the full page, including continuation treatment rows and margin instructions."));
            content.add(Map.of("type","input_image","detail","high","image_url","data:"+page.type()+";base64,"+Base64.getEncoder().encodeToString(page.data())));
        }
        return Map.of("model","gpt-4o-mini","store",false,"max_output_tokens",10000,"temperature",0,
            "instructions",guidance,
            "input",List.of(Map.of("role","user","content",content)),
            "text",Map.of("format",Map.of("type","json_schema","name","prescription","strict",true,"schema",schema())));
    }
    private PrescriptionContracts.Extraction send(List<PrescriptionFiles.Page> pages,Map<String,Object> body) {
        try {
            var request=HttpRequest.newBuilder(URI.create("https://api.openai.com/v1/responses"))
                .timeout(Duration.ofSeconds(75)).header("Authorization","Bearer "+key).header("Content-Type","application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build();
            // No automatic retries: an ambiguous timeout must not silently incur another charge.
            var response=http.send(request,HttpResponse.BodyHandlers.ofInputStream());
            try(var stream=response.body()) {
            byte[] bytes=stream.readNBytes(1048577);
            if(bytes.length>1048576) { if(diagnostics!=null) diagnostics.rejected("RESPONSE_TOO_LARGE"); throw unavailable(); }
            String responseBody=new String(bytes,StandardCharsets.UTF_8);
            if(diagnostics!=null) diagnostics.response(response.statusCode(),response.headers().firstValue("x-request-id").orElse("unavailable"),pages.size(),responseBody);
            if(response.statusCode()!=200) throw new RuleViolation("EXTRACTION_PROVIDER_FAILED",response.statusCode()==429?
                "Extraction is temporarily limited. Your prescription was not activated. Try later or enter manually.":
                "The extraction service could not process this request. Check backend configuration or enter manually.",502);
            try {
                var result=parse(responseBody);
                if(diagnostics!=null) diagnostics.parsed(result.medicines().size(),result.medicines().stream().filter(PrescriptionContracts.Medicine::unclear).count());
                return result;
            } catch(RuleViolation e) { if(diagnostics!=null) diagnostics.rejected(e.code()); throw e; }
            }
        } catch(InterruptedException e) { Thread.currentThread().interrupt(); throw unavailable(); }
          catch(java.io.IOException e) { throw unavailable(); }
    }
    @Override public boolean available() { return mode.equals("openai") && enabled && !key.isBlank() && !key.startsWith("REPLACE_") && !key.contains("your-api-key"); }
    public PrescriptionContracts.Extraction parse(String response) {
        try {
            var root=json.readTree(response);
            if(!"completed".equals(root.path("status").asText())) throw unavailable();
            StringBuilder output=new StringBuilder();
            for(var item:root.path("output")) for(var part:item.path("content")) {
                if("refusal".equals(part.path("type").asText())) throw unavailable();
                if("output_text".equals(part.path("type").asText())) output.append(part.path("text").asText());
            }
            var tree=json.readTree(output.toString());
            for(String person:List.of("patient","doctor")) {
                var node=tree.path(person);
                if(!node.isObject() || !node.has("name") || !(node.path("name").isNull() || node.path("name").isTextual())) throw unavailable();
            }
            if(!tree.has("date") || !(tree.path("date").isNull() || tree.path("date").isTextual()) || !tree.path("medicines").isArray()) throw unavailable();
            for(var medicine:tree.path("medicines")) {
                for(String field:List.of("raw","brand","strength","dose","frequency","pattern","food","duration")) {
                    if(!medicine.has(field) || !(medicine.path(field).isNull() || medicine.path(field).isTextual()) || medicine.path(field).asText("").length()>3000) throw unavailable();
                }
                if(!medicine.path("sos").isBoolean() || !medicine.path("unclear").isBoolean() || !medicine.path("timing").isArray()) throw unavailable();
                for(var time:medicine.path("timing")) if(!time.isTextual() || time.asText().length()>100) throw unavailable();
            }
            var result=json.readValue(output.toString(),PrescriptionContracts.Extraction.class);
            if(result.patient()==null || result.doctor()==null || result.medicines()==null || result.medicines().size()>50) throw unavailable();
            for(var medicine:result.medicines()) if(medicine==null || medicine.timing()==null || medicine.timing().size()>12) throw unavailable();
            // Missing required regimen evidence always requires review, even if the model says unclear=false.
            var medicines=result.medicines().stream().map(m->new PrescriptionContracts.Medicine(m.raw(),m.brand(),m.strength(),m.dose(),m.frequency(),m.pattern(),m.timing(),m.food(),m.duration(),m.sos(),
                m.unclear() || blank(m.brand()) || blank(m.dose()) || blank(m.frequency()) || blank(m.duration()))).toList();
            return new PrescriptionContracts.Extraction(result.patient(),result.doctor(),result.date(),medicines);
        } catch(RuleViolation e) { throw e; }
          catch(Exception e) { throw unavailable(); }
    }
    private RuleViolation unavailable() { return new RuleViolation("EXTRACTION_UNAVAILABLE","Extraction could not finish safely. No schedules were created. Retry explicitly or enter medicines manually.",502); }
    private static boolean blank(String value) { return value==null || value.isBlank(); }
}
