package com.dms.document.dto;

import java.time.Instant;
import java.util.Set;

import com.dms.document.model.DocumentStatus;

public record DocumentSummaryResponse(
    String id,
    String title,
    String owner,
    String category,
    DocumentStatus status,
    Set<String> tags,
    DocumentFolderInfo folder,
    int latestVersion,
    long latestSizeBytes,
    Instant updatedAt
) {
}
