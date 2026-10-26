package com.familymedicine.prescription;

import java.util.List;

public interface ExtractionProvider {
    default boolean available() { return true; }
    default String mode() { return "openai"; }
    PrescriptionContracts.Extraction extract(List<PrescriptionFiles.Page> pages);
}
