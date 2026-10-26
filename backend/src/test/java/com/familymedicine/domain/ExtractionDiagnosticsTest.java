package com.familymedicine.domain;

import com.familymedicine.prescription.ExtractionDiagnostics;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import static org.assertj.core.api.Assertions.*;

class ExtractionDiagnosticsTest {
    private MockEnvironment environment(String profile) { var environment=new MockEnvironment();environment.setActiveProfiles(profile);return environment; }
    @Test void responseBodiesRequireBothDevelopmentProfileAndExplicitOptIn() {
        assertThat(new ExtractionDiagnostics(environment("prod"),true,"secret").diagnosticBody("private patient")).doesNotContain("private patient");
        assertThat(new ExtractionDiagnostics(environment("dev"),false,"secret").diagnosticBody("private patient")).doesNotContain("private patient");
        assertThat(new ExtractionDiagnostics(environment("dev"),true,"secret").diagnosticBody("fictional patient")).contains("fictional patient");
    }
    @Test void credentialsImagesAndControlCharactersAreProtected() {
        String body=new ExtractionDiagnostics(environment("dev"),true,"my-private-key").diagnosticBody("my-private-key sk-example-secret data:image/png;base64,AAAA\nforged log");
        assertThat(body).doesNotContain("my-private-key","sk-example-secret","base64,AAAA","\n");
        assertThat(body).contains("REDACTED_KEY","REDACTED_IMAGE","\\n");
    }
    @Test void diagnosticResponseHasABoundedSize() {
        assertThat(new ExtractionDiagnostics(environment("dev"),true,"").diagnosticBody("x".repeat(100000))).contains("TRUNCATED").hasSizeLessThan(66000);
    }
}
