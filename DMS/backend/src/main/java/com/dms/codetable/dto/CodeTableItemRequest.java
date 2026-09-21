package com.dms.codetable.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CodeTableItemRequest(
    @NotBlank @Size(max = 64) String itemCode,
    @NotBlank @Size(max = 160) String itemLabel,
    @Size(max = 255) String description,
    int sortOrder,
    boolean active
) {
}
