package com.dms.knowledge.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record KnowledgeDocumentLinkRequest(
    @NotNull(message = "Document id is required")
    String documentId,
    @Size(max = 512, message = "Note must be 512 characters or fewer")
    String note
) {
}
