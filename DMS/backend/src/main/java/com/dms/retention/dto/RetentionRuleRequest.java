package com.dms.retention.dto;

import com.dms.retention.model.RetentionDateBasis;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RetentionRuleRequest(
    @NotBlank @Size(max = 128) String category,
    @NotNull RetentionDateBasis dateBasis,
    @Min(1) @Max(100) int yearsToRetain,
    Boolean active
) {}
