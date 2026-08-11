package com.dms.job.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record JobScheduleRequest(
    @NotBlank @Size(max = 64) String cronExpression,
    boolean enabled
) {
}
