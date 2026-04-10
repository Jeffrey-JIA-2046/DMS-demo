package com.dms.document.dto;

import java.util.Map;
import java.util.Set;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record DocumentUploadRequest(
    @NotBlank @Size(max = 255) String title,
    @Size(max = 1024) String description,
    @NotBlank @Size(max = 160) String owner,
    @Size(max = 120) String category,
    @NotBlank String documentDate,
    @NotBlank String expiryDate,
    Set<@Size(max = 40) String> tags,
    @NotNull String folderId,
    @NotNull String approverId,
    @NotBlank String supervisorId,
    Map<String, String> metadata,
    Boolean runOcr,
    Boolean runDataExtraction
) {
}
