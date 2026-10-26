package com.familymedicine.prescription;

import com.familymedicine.api.Contracts.ScheduleInput;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.*;

public final class PrescriptionContracts {
    private PrescriptionContracts() {}
    public record Person(String name) {}
    public record Medicine(@Size(max=3000) String raw, @Size(max=150) String brand, @Size(max=100) String strength,
        @Size(max=300) String dose, @Size(max=150) String frequency,
        @Size(max=100) String pattern, @NotNull @Size(max=12) List<@Size(max=100) String> timing,
        @Size(max=150) String food, @Size(max=150) String duration, boolean sos, boolean unclear) {}
    public record Extraction(Person patient, Person doctor, String date, List<Medicine> medicines) {}
    public record Source(int index, String mediaType) {}
    public record Item(@NotNull UUID id, @NotNull @Valid Medicine evidence, @Valid ScheduleInput schedule,
        boolean verified, @Size(max=200) String reviewNote,
        @Size(max=30) Map<@Size(max=50) String,@Size(max=2000) String> fields) {}
    public record Draft(@Min(1) int version, @NotNull @Size(max=50) List<@Valid Item> items) {}
    public record Document(UUID id, UUID memberId, String status, int version, Instant createdAt,
        Extraction extraction, List<Item> items, List<Source> sources, Map<UUID,UUID> plans, String extractionMode) {}
    public record Routine(
        @Pattern(regexp="(?:[01]\\d|2[0-3]):[0-5]\\d") String wakeUp,
        @Pattern(regexp="(?:[01]\\d|2[0-3]):[0-5]\\d") String breakfast,
        @Pattern(regexp="(?:[01]\\d|2[0-3]):[0-5]\\d") String lunch,
        @Pattern(regexp="(?:[01]\\d|2[0-3]):[0-5]\\d") String dinner,
        @Pattern(regexp="(?:[01]\\d|2[0-3]):[0-5]\\d") String bedtime,
        @NotBlank @Size(max=80) String timezone) {}
    public record Activation(@Min(1) int version, @NotEmpty @Size(max=50) List<UUID> itemIds) {}
}
