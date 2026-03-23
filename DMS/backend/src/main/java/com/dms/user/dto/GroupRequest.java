package com.dms.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record GroupRequest(
    @NotBlank @Size(max = 120) String name,
    @Size(max = 512) String description
) {}
