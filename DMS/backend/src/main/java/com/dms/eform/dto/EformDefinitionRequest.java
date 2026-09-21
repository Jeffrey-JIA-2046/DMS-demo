package com.dms.eform.dto;

import java.util.Map;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record EformDefinitionRequest(
    @NotBlank String categoryCode,
    String categoryLabel,
    @NotNull Map<String, Object> schema
) {
}
