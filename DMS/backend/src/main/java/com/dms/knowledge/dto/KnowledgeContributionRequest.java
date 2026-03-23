package com.dms.knowledge.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record KnowledgeContributionRequest(
    @NotBlank(message = "Contribution text is required")
    @Size(max = 4000, message = "Contribution must be 4000 characters or fewer")
    String content,
    String linkedDocumentId
) {
}
