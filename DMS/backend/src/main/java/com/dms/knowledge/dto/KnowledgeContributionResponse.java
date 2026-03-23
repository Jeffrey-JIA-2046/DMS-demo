package com.dms.knowledge.dto;

import java.time.Instant;

public record KnowledgeContributionResponse(
    String id,
    String author,
    String content,
    Instant createdAt,
    String linkedDocumentId,
    String linkedDocumentTitle
) {
}
