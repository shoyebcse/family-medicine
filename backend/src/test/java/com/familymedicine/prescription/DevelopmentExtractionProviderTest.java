package com.familymedicine.prescription;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.io.ClassPathResource;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

class DevelopmentExtractionProviderTest {
    @Test void mockReturnsExactRequestedFixtureWithoutCallingLiveProvider() throws Exception {
        var live=new OpenAiExtractionProvider("",false) {
            @Override public PrescriptionContracts.Extraction extract(List<PrescriptionFiles.Page> pages) { throw new AssertionError("Mock mode must never call OpenAI"); }
        };
        var provider=new DevelopmentExtractionProvider("mock",live);
        assertThat(provider.available()).isTrue();
        assertThat(provider.mode()).isEqualTo("mock");
        var result=provider.extract(List.of());
        var json=JsonMapper.builder().build();
        tools.jackson.databind.JsonNode actual=json.valueToTree(result);
        assertThat(actual).isEqualTo(json.readTree(new ClassPathResource("development/prescription-fixture.json").getContentAsByteArray()));
        assertThat(result.medicines()).hasSize(6);
        assertThat(result.medicines().get(0).dose()).isEqualTo("1-1-1");
        assertThat(result.medicines().get(0).pattern()).isNull();
        assertThat(result.medicines().get(4).sos()).isTrue();
        assertThat(result.medicines().get(4).duration()).isNull();
    }
    @Test void mockCannotBeActivatedOutsideDevelopmentOrFallThroughToLiveCalls() throws Exception {
        var live=new OpenAiExtractionProvider("test-key",true,null,"mock");
        assertThat(live.available()).isFalse();
        assertThatThrownBy(()->live.extract(List.of())).hasMessageContaining("not enabled");
        try(var context=new AnnotationConfigApplicationContext()) {
            context.getEnvironment().setActiveProfiles("prod");
            context.registerBean(OpenAiExtractionProvider.class,()->live);
            context.register(DevelopmentExtractionProvider.class);
            context.refresh();
            assertThat(context.getBeansOfType(DevelopmentExtractionProvider.class)).isEmpty();
        }
        assertThatThrownBy(()->new DevelopmentExtractionProvider("typo",live)).isInstanceOf(IllegalArgumentException.class);
    }
}
