package com.dms.document.dto;

import java.time.Instant;

public record DocumentVersionResponse(
    String id,
    int version,
    String fileName,
    long sizeBytes,
    String contentType,
    Instant createdAt
) {
}
