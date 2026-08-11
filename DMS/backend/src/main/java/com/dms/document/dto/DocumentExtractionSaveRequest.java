package com.dms.document.dto;

import java.util.Map;

import jakarta.validation.constraints.Size;

public record DocumentExtractionSaveRequest(
    @Size(max = 120) String prompt,
    Integer confidence,
    @Size(max = 80) String formType,
    Map<String, Object> extractedJson
) {
}
