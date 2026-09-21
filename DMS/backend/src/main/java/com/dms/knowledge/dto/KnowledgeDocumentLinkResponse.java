package com.dms.knowledge.dto;

import java.time.Instant;

public record KnowledgeDocumentLinkResponse(
    String id,
    String documentId,
    String documentTitle,
    String note,
    String linkedBy,
    Instant linkedAt
) {
}
