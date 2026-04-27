package com.dms.document.dto;

import java.util.Map;
import java.util.Set;

import jakarta.validation.constraints.Size;

public record DocumentUpdateRequest(
    @Size(max = 255) String title,
    @Size(max = 1024) String description,
    @Size(max = 120) String category,
    @Size(max = 64) String categoryCode,
    Set<@Size(max = 40) String> tags,
    String folderId,
    Map<String, String> metadata
) {
}
