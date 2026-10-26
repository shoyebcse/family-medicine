package com.familymedicine.prescription;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/** Explicit local debugging only; never log request images, authorization headers or API keys. */
@Component
public class ExtractionDiagnostics {
    private static final Logger LOG=LoggerFactory.getLogger(ExtractionDiagnostics.class);
    private final boolean responseLogging;
    private final String key;
    private final JsonMapper json=JsonMapper.builder().build();
    public ExtractionDiagnostics(Environment environment,@Value("${OPENAI_LOG_RESPONSES:false}") boolean enabled,
            @Value("${OPENAI_API_KEY:}") String key) {
        responseLogging=enabled && environment.matchesProfiles("dev"); this.key=key;
    }
    public String diagnosticBody(String body) {
        if(!responseLogging) return "[response logging disabled]";
        String redacted=key.isBlank()?body:body.replace(key,"[REDACTED_KEY]");
        redacted=redacted.replaceAll("sk-[A-Za-z0-9_-]+","[REDACTED_KEY]");
        redacted=redacted.replaceAll("data:image/[^;,\\s]+;base64,[A-Za-z0-9+/=]+","[REDACTED_IMAGE]");
        if(redacted.length()>65536) redacted=redacted.substring(0,65536)+" [TRUNCATED]";
        // JSON escaping keeps embedded newlines/control characters from forging log entries.
        return json.writeValueAsString(redacted);
    }
    public void response(int status,String requestId,int pages,String body) {
        LOG.info("OpenAI extraction model=gpt-4o-mini httpStatus={} requestId={} pages={} responseCharacters={}",
            status,requestId.replaceAll("[^A-Za-z0-9_-]",""),pages,body.length());
        if(responseLogging) LOG.info("OpenAI extraction RAW_RESPONSE (sensitive development data): {}",diagnosticBody(body));
    }
    public void parsed(int count,long unclear) { LOG.info("OpenAI extraction parsed medicines={} unclear={}",count,unclear); }
    public void rejected(String code) { LOG.warn("OpenAI extraction rejected code={}",code); }
}
