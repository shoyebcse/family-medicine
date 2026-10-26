package com.familymedicine.domain;

import com.familymedicine.prescription.*;
import java.io.ByteArrayOutputStream;
import java.util.List;
import org.apache.pdfbox.pdmodel.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.mock.env.MockEnvironment;
import static org.assertj.core.api.Assertions.*;

class PrescriptionProviderTest {
    private String completed(String text) {
        var json=tools.jackson.databind.json.JsonMapper.builder().build();
        return json.writeValueAsString(java.util.Map.of("status","completed","output",List.of(java.util.Map.of("type","message","content",List.of(java.util.Map.of("type","output_text","text",text))))));
    }
    @Test void providerPreservesMissingDoseDespitePresentStrength() throws Exception {
        var provider=new OpenAiExtractionProvider("REPLACE_WITH_YOUR_OPENAI_API_KEY",false);
        var result=provider.parse(completed("""
            {"patient":{"name":null},"doctor":{"name":null},"date":null,"medicines":[{"raw":"uncertain fictional name","brand":null,"strength":"500 mg","dose":null,"frequency":null,"pattern":null,"timing":[],"food":null,"duration":null,"sos":false,"unclear":true}]}
            """));
        assertThat(result.medicines().get(0).dose()).isNull();
        assertThat(result.medicines().get(0).strength()).isEqualTo("500 mg");
        assertThat(result.medicines().get(0).unclear()).isTrue();
        assertThatThrownBy(()->provider.extract(List.of())).hasMessageContaining("not enabled");
    }
    @Test void incompleteRefusedOrMalformedProviderResultsCannotBecomeDrafts() throws Exception {
        var provider=new OpenAiExtractionProvider("",false);
        assertThatThrownBy(()->provider.parse("{\"status\":\"incomplete\"}")).isInstanceOf(RuleViolation.class);
        assertThatThrownBy(()->provider.parse(completed("not json"))).isInstanceOf(RuleViolation.class);
        assertThatThrownBy(()->provider.parse(completed("{\"medicines\":[]}"))).isInstanceOf(RuleViolation.class);
        assertThatThrownBy(()->provider.parse("{\"status\":\"completed\",\"output\":[{\"content\":[{\"type\":\"refusal\"}]}]}" )).isInstanceOf(RuleViolation.class);
    }
    @Test void incompleteInstructionsCannotBeMarkedClearByTheProvider() throws Exception {
        var provider=new OpenAiExtractionProvider("",false);
        var result=provider.parse(completed("""
            {"patient":{"name":null},"doctor":{"name":null},"date":null,"medicines":[{"raw":"Fictional written medicine OD","brand":null,"strength":null,"dose":null,"frequency":"OD","pattern":null,"timing":[],"food":null,"duration":null,"sos":false,"unclear":false}]}
            """));
        var medicine=result.medicines().get(0);
        assertThat(medicine.unclear()).isTrue();
        assertThat(medicine.brand()).isNull();
        assertThat(medicine.dose()).isNull();
        assertThat(medicine.raw()).isEqualTo("Fictional written medicine OD");
        assertThat(medicine.frequency()).isEqualTo("OD");
    }
    @Test void multiPagePdfIsRenderedInOrderAndMalformedFilesRejectedBeforeProvider() throws Exception {
        var files=new PrescriptionFiles(10485760,8);
        var bytes=new ByteArrayOutputStream();
        try(var pdf=new PDDocument()) { pdf.addPage(new PDPage());pdf.addPage(new PDPage());pdf.save(bytes); }
        var pages=files.read(List.of(new MockMultipartFile("files","scan.pdf","application/pdf",bytes.toByteArray())));
        assertThat(pages).hasSize(2); assertThat(pages).allMatch(page->page.type().equals("image/png"));
        assertThatThrownBy(()->files.read(List.of(new MockMultipartFile("files","fake.png","image/png",new byte[]{1,2,3})))).isInstanceOf(RuleViolation.class);
        assertThatThrownBy(()->new PrescriptionFiles(4,8).read(List.of(new MockMultipartFile("files","scan.pdf","application/pdf",bytes.toByteArray())))).isInstanceOf(RuleViolation.class);
        assertThatThrownBy(()->new PrescriptionFiles(10485760,1).read(List.of(new MockMultipartFile("files","scan.pdf","application/pdf",bytes.toByteArray())))).isInstanceOf(RuleViolation.class);
    }
    @Test void protectedEvidenceCannotBeDecryptedForAnotherPrescription() {
        var environment=new MockEnvironment(); environment.setActiveProfiles("test");
        var cipher=new PrescriptionCipher("","test-key",environment);
        byte[] input="fictional protected evidence".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        byte[] encrypted=cipher.encrypt(input,"prescription-a");
        assertThat(cipher.decrypt(encrypted,"prescription-a")).isEqualTo(input);
        assertThatThrownBy(()->cipher.decrypt(encrypted,"prescription-b")).isInstanceOf(IllegalStateException.class);
    }
}
