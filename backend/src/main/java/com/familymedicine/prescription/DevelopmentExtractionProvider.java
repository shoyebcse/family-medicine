package com.familymedicine.prescription;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/** Explicit development fixture, never enabled by a missing API key or provider failure. */
@Component
@Primary
@Profile("dev")
public class DevelopmentExtractionProvider implements ExtractionProvider {
    private final String mode;
    private final OpenAiExtractionProvider live;
    public DevelopmentExtractionProvider(@Value("${PRESCRIPTION_EXTRACTION_MODE:openai}") String mode,OpenAiExtractionProvider live) {
        if(!List.of("mock","openai").contains(mode)) throw new IllegalArgumentException("PRESCRIPTION_EXTRACTION_MODE must be mock or openai");
        this.mode=mode;this.live=live;
    }
    @Override public boolean available() { return mode.equals("mock") || live.available(); }
    @Override public String mode() { return mode; }
    @Override public PrescriptionContracts.Extraction extract(List<PrescriptionFiles.Page> pages) {
        if(!mode.equals("mock")) return live.extract(pages);
        try {
            // Return the requested fixture unchanged. Do not interpret uploaded patient data or call the network.
            return JsonMapper.builder().build().readValue(new ClassPathResource("development/prescription-fixture.json").getContentAsByteArray(),PrescriptionContracts.Extraction.class);
        } catch(java.io.IOException e) { throw new IllegalStateException("Development extraction fixture is unavailable"); }
    }
}
