package com.familymedicine.domain;

import com.familymedicine.api.Contracts.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class SchedulePlannerTest {
    private ScheduleInput input(String zone, LocalDate start, LocalDate end, List<String> times,List<Integer> days) {
        return new ScheduleInput(UUID.randomUUID(),"Example medicine","10 mg","Use confirmed instructions",null,"tablet",
            times,days,zone,start,end,false,true,null,null,null);
    }
    @Test void datesAreInclusiveAndIdsAreStable() {
        var input=input("Asia/Kolkata",LocalDate.parse("2026-10-20"),LocalDate.parse("2026-10-22"),List.of("08:00"),List.of(1,2,3,4,5,6,7));
        UUID id=UUID.randomUUID(); Instant effective=Instant.parse("2026-10-19T00:00:00Z");
        var doses=SchedulePlanner.plan(id,input,effective);
        assertThat(doses).hasSize(3).isEqualTo(SchedulePlanner.plan(id,input,effective));
        assertThat(doses.get(0).dueAt()).isEqualTo(Instant.parse("2026-10-20T02:30:00Z"));
    }
    @Test void noPreactivationDosesAreCreated() {
        var input=input("UTC",LocalDate.parse("2026-10-20"),LocalDate.parse("2026-10-20"),List.of("08:00","20:00"),List.of(2));
        assertThat(SchedulePlanner.plan(UUID.randomUUID(),input,Instant.parse("2026-10-20T12:00:00Z")))
            .extracting(PlannedDose::localTime).containsExactly("20:00");
    }
    @Test void weekdaysAreRespected() {
        var input=input("UTC",LocalDate.parse("2026-10-19"),LocalDate.parse("2026-10-25"),List.of("08:00"),List.of(1,3,5));
        assertThat(SchedulePlanner.plan(UUID.randomUUID(),input,Instant.parse("2026-10-18T00:00:00Z")))
            .extracting(PlannedDose::localDate).containsExactly(LocalDate.parse("2026-10-19"),LocalDate.parse("2026-10-21"),LocalDate.parse("2026-10-23"));
    }
    @Test void dstGapUsesFirstValidTime() {
        var input=input("America/New_York",LocalDate.parse("2026-03-08"),LocalDate.parse("2026-03-08"),List.of("02:30"),List.of(7));
        assertThat(SchedulePlanner.plan(UUID.randomUUID(),input,Instant.parse("2026-03-07T00:00:00Z"))).singleElement()
            .extracting(PlannedDose::dueAt).isEqualTo(Instant.parse("2026-03-08T07:00:00Z"));
    }
    @Test void dstFoldUsesEarlierInstantOnce() {
        var input=input("America/New_York",LocalDate.parse("2026-11-01"),LocalDate.parse("2026-11-01"),List.of("01:30"),List.of(7));
        assertThat(SchedulePlanner.plan(UUID.randomUUID(),input,Instant.parse("2026-10-31T00:00:00Z"))).singleElement()
            .extracting(PlannedDose::dueAt).isEqualTo(Instant.parse("2026-11-01T05:30:00Z"));
    }
    @Test void duplicateTimesAreRejected() {
        var input=input("UTC",LocalDate.parse("2026-10-20"),null,List.of("08:00","08:00"),List.of(2));
        assertThatThrownBy(()->SchedulePlanner.plan(UUID.randomUUID(),input,Instant.parse("2026-10-19T00:00:00Z")))
            .isInstanceOf(RuleViolation.class);
    }
    @Test void dstAdjustedCollisionsAreRejected() {
        var input=input("America/New_York",LocalDate.parse("2026-03-08"),LocalDate.parse("2026-03-08"),List.of("02:30","03:00"),List.of(7));
        assertThatThrownBy(()->SchedulePlanner.plan(UUID.randomUUID(),input,Instant.parse("2026-03-07T00:00:00Z")))
            .hasMessageContaining("overlap");
    }
}
