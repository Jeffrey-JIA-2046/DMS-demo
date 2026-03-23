package com.dms.knowledge.dto;

import java.time.Instant;

public record KnowledgeAttachmentResponse(
    String id,
    String fileName,
    long size,
    String contentType,
    String description,
    String uploadedBy,
    Instant uploadedAt
) {
}
