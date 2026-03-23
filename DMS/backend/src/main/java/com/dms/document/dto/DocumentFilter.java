package com.dms.document.dto;

import java.util.Set;

import com.dms.document.model.DocumentStatus;

public record DocumentFilter(
    String query,
    String owner,
    String category,
    DocumentStatus status,
    Set<String> tags,
    String folderId
) {
}
