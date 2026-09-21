package com.dms.workflow.dto;

import jakarta.validation.constraints.NotBlank;

public record WorkflowBindingRequest(
    @NotBlank String category,
    @NotBlank String templateId,
    Boolean active
) {
}
