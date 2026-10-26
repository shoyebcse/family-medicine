package com.familymedicine.domain;
import com.familymedicine.api.Contracts.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class PrescriptionRulesTest {
    private ScheduleInput input(String regimen,String frequency,Boolean unspecified,BigDecimal quantity,BigDecimal stock) {
        return new ScheduleInput(UUID.randomUUID(),"Fictional medicine","125 mg/5 mL","Original instructions",quantity,"mL",List.of("08:00"),List.of(1,2,3,4,5,6,7),"Asia/Kolkata",LocalDate.parse("2026-10-20"),LocalDate.parse("2026-10-21"),false,true,stock,
            new PrescriptionDetails(null,"Liquid","By mouth",frequency,"Not specified",unspecified,regimen),null);
    }
    private void plan(ScheduleInput input) { SchedulePlanner.plan(UUID.randomUUID(),input,Instant.parse("2026-10-19T00:00:00Z")); }
    @Test void frequencyNeverCreatesUnconfirmedTimes() {
        assertThatThrownBy(()->plan(input("FIXED","Twice daily",false,BigDecimal.ONE,null))).hasMessageContaining("reminder count");
    }
    @Test void variableAndAsNeededDoNotBecomeFixedDoses() {
        for(String regimen:List.of("VARIABLE","AS_NEEDED")) assertThatThrownBy(()->plan(input(regimen,"Once daily",false,BigDecimal.ONE,null))).hasMessageContaining("dedicated plan");
    }
    @Test void unspecifiedAmountRequiresExplicitChoiceAndCannotDeductStock() {
        assertThatThrownBy(()->plan(input("FIXED","Once daily",false,null,null))).hasMessageContaining("prescribed amount");
        assertThatThrownBy(()->plan(input("FIXED","Once daily",true,BigDecimal.ONE,null))).hasMessageContaining("both");
        assertThatThrownBy(()->plan(input("FIXED","Once daily",true,null,BigDecimal.TEN))).hasMessageContaining("Stock tracking");
        assertThatCode(()->plan(input("FIXED","Once daily",true,null,null))).doesNotThrowAnyException();
    }
}
