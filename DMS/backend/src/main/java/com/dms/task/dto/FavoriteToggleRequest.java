package com.dms.task.dto;

import jakarta.validation.constraints.NotBlank;

public record FavoriteToggleRequest(
    @NotBlank String targetType,
    @NotBlank String targetId
) {}
