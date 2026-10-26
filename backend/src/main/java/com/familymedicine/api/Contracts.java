package com.familymedicine.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import jakarta.validation.constraints.*;
import jakarta.validation.Valid;

public final class Contracts {
    private Contracts() {}
    public record MemberInput(@NotBlank @Size(max=100) String name,
                              @NotBlank @Size(max=50) String relationship,
                              @Pattern(regexp="\\+[1-9][0-9]{7,14}",message="Use + and country code") String phone,
                              Boolean inviteAccess) {}
    public record Member(UUID id, String name, String relationship, String phone, String linkState, String linkedName, boolean owned) {}
    public record ScheduleInput(
        @NotNull UUID memberId,
        @NotBlank @Size(max=150) String medicineName,
        @NotNull @Size(max=100) String strength,
        @NotBlank @Size(max=300) String doseInstruction,
        @DecimalMin(value="0", inclusive=false) @Digits(integer=10, fraction=4) BigDecimal doseQuantity,
        @NotBlank @Size(max=30) String unit,
        @NotEmpty @Size(max=12) List<@Pattern(regexp="(?:[01]\\d|2[0-3]):[0-5]\\d") String> times,
        @NotEmpty @Size(max=7) List<@Min(1) @Max(7) Integer> weekdays,
        @NotBlank @Size(max=80) String timezone,
        @NotNull LocalDate startDate,
        LocalDate endDate,
        boolean noEndAcknowledged,
        boolean reviewed,
        @DecimalMin("0") @Digits(integer=10, fraction=4) BigDecimal initialStock,
        @Valid PrescriptionDetails prescriptionDetails,
        @DecimalMin("0") @Digits(integer=10,fraction=4) BigDecimal lowStockThreshold) {}
    public record StockAlertInput(@DecimalMin("0") @Digits(integer=10,fraction=4) BigDecimal threshold) {}
    public record PrescriptionDetails(
        @Size(max=200) String genericName,
        @NotBlank @Size(max=80) String form,
        @NotBlank @Size(max=80) String route,
        @NotBlank @Size(max=150) String frequency,
        @NotBlank @Size(max=150) String mealInstruction,
        @NotNull Boolean amountUnspecified,
        @NotBlank @Size(max=30) String regimenType) {}
    public record Schedule(UUID id, UUID memberId, String medicineName, String strength,
        String doseInstruction, BigDecimal doseQuantity, String unit, String timezone, BigDecimal stock,
        PrescriptionDetails prescriptionDetails, BigDecimal lowStockThreshold, boolean lowStock, boolean sampleData) {}
    public record PlannedDose(UUID id, Instant dueAt, LocalDate localDate, String localTime) {}
    public record SchedulePreview(List<PlannedDose> occurrences, String timezone, Instant effectiveAt,
                                  String coverageNote) {}
    public record Occurrence(UUID id, UUID scheduleId, UUID memberId, String memberName,
        String medicineName, String strength, String doseInstruction, String unit,
        String timezone, Instant dueAt, String status, Instant actualAt, BigDecimal stock, boolean sampleData) {}
    public record DoseInput(@NotNull UUID eventId, @NotNull UUID occurrenceId,
        @NotNull DoseAction action, Instant actualAt, boolean earlyConfirmed) {}
    public enum DoseAction { TAKEN, SKIPPED }
    public record DoseResult(UUID eventId, UUID occurrenceId, String status, BigDecimal stock, boolean duplicate) {}
}
