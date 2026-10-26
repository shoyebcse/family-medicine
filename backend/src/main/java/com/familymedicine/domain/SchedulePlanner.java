package com.familymedicine.domain;

import com.familymedicine.api.Contracts.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;

/** Pure recurrence logic. The server is the authority for occurrence identities and instants. */
public final class SchedulePlanner {
    private SchedulePlanner() {}
    public static List<PlannedDose> plan(UUID scheduleId, ScheduleInput input, Instant effectiveAt) {
        if (!input.reviewed()) throw new RuleViolation("REVIEW_REQUIRED", "Review the instructions before activating reminders");
        if(input.lowStockThreshold()!=null && (input.lowStockThreshold().signum()<0 || input.initialStock()==null || input.doseQuantity()==null))
            throw new RuleViolation("STOCK_TRACKING_REQUIRED","A low-stock threshold needs tracked stock and a confirmed numeric dose quantity.");
        var details=input.prescriptionDetails();
        if(details!=null) {
            if(!"FIXED".equals(details.regimenType()))
                throw new RuleViolation("UNSUPPORTED_REGIMEN","As-needed, tapering and variable doses need a dedicated plan and cannot use this fixed schedule.");
            if(details.amountUnspecified()==null || (details.amountUnspecified() && input.doseQuantity()!=null) || (!details.amountUnspecified() && input.doseQuantity()==null))
                throw new RuleViolation("DOSE_AMOUNT_REQUIRED","Enter the prescribed amount or explicitly mark it not specified; do not enter both.");
            if(details.amountUnspecified() && input.initialStock()!=null)
                throw new RuleViolation("STOCK_QUANTITY_REQUIRED","Stock tracking needs a confirmed numeric amount.");
            var expected=Map.of("Once daily",1,"Twice daily",2,"Three times daily",3,"Four times daily",4).get(details.frequency());
            if(expected!=null && expected!=input.times().size())
                throw new RuleViolation("FREQUENCY_MISMATCH","The reminder count does not match the selected daily frequency. Review the prescription and times.");
        }
        if (input.endDate() == null && !input.noEndAcknowledged())
            throw new RuleViolation("END_CONDITION_REQUIRED", "Confirm an end date or acknowledge no end date");
        if (input.endDate() != null && input.endDate().isBefore(input.startDate()))
            throw new RuleViolation("INVALID_DATES", "End date must be on or after start date");
        if (new HashSet<>(input.times()).size() != input.times().size())
            throw new RuleViolation("DUPLICATE_TIME", "Each reminder time must be different");
        if (new HashSet<>(input.weekdays()).size() != input.weekdays().size())
            throw new RuleViolation("DUPLICATE_WEEKDAY", "Each weekday must be different");
        final ZoneId zone;
        try { zone=ZoneId.of(input.timezone()); }
        catch (DateTimeException e) { throw new RuleViolation("INVALID_TIMEZONE", "Choose a valid named timezone"); }
        LocalDate today = effectiveAt.atZone(zone).toLocalDate();
        if (input.startDate().isAfter(today.plusDays(365)))
            throw new RuleViolation("START_TOO_FAR", "Choose a start date within the next year for this preview");
        LocalDate from = input.startDate().isAfter(today) ? input.startDate() : today;
        LocalDate through = from.plusDays(34);
        if (input.endDate()!=null && input.endDate().isBefore(through)) through=input.endDate();
        List<PlannedDose> result = new ArrayList<>();
        Set<Instant> instants = new HashSet<>();
        for (LocalDate date=from; !date.isAfter(through); date=date.plusDays(1)) {
            if (!input.weekdays().contains(date.getDayOfWeek().getValue())) continue;
            for (String time: input.times().stream().sorted().toList()) {
                LocalDateTime local = date.atTime(LocalTime.parse(time));
                var offsets = zone.getRules().getValidOffsets(local);
                // DST gap: use the first valid local instant; fold: select the earlier instant.
                Instant due = offsets.isEmpty()
                    ? zone.getRules().getTransition(local).getInstant()
                    : local.atOffset(offsets.get(0)).toInstant();
                if (due.isBefore(effectiveAt)) continue;
                if (!instants.add(due)) throw new RuleViolation("COLLIDING_TIMES", "Adjusted reminder times overlap; review the times");
                UUID id = UUID.nameUUIDFromBytes((scheduleId+":1:"+date+":"+time).getBytes(StandardCharsets.UTF_8));
                result.add(new PlannedDose(id,due,date,time));
            }
        }
        return result.stream().sorted(Comparator.comparing(PlannedDose::dueAt)).toList();
    }
}
