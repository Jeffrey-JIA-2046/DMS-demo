package com.dms.workflow.dto;

import jakarta.validation.constraints.NotBlank;

public record WorkflowManualDecisionRequest(
    @NotBlank String decision,
    String note
) {
}
