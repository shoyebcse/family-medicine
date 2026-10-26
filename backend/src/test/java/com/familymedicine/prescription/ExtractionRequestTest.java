package com.familymedicine.prescription;

import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

class ExtractionRequestTest {
    @Test void everyPageIsSentInOrderWithLabelsAndOriginalPrompt() throws Exception {
        var provider=new OpenAiExtractionProvider("",false);
        var request=JsonMapper.builder().build().valueToTree(provider.requestBody(List.of(
            new PrescriptionFiles.Page("image/png",new byte[]{1}),new PrescriptionFiles.Page("image/jpeg",new byte[]{2}))));
        assertThat(request.path("model").asText()).isEqualTo("gpt-4o-mini");
        assertThat(request.path("temperature").asInt()).isZero();
        var content=request.path("input").get(0).path("content");
        assertThat(content.size()).isEqualTo(5);
        assertThat(content.get(0).path("text").asText()).contains("Extract ALL medicines", "Never infer the dose from the strength");
        assertThat(content.get(1).path("text").asText()).contains("page 1 of 2");
        assertThat(content.get(2).path("image_url").asText()).isEqualTo("data:image/png;base64,AQ==");
        assertThat(content.get(3).path("text").asText()).contains("page 2 of 2");
        assertThat(content.get(4).path("image_url").asText()).isEqualTo("data:image/jpeg;base64,Ag==");
        assertThat(request.path("instructions").asText()).contains("Symptoms, diagnoses", "numbered treatment rows", "brand holds the medicine name exactly as written");
    }
}
