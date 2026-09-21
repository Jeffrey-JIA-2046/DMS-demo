package com.dms.knowledge.dto;

import java.util.Set;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record KnowledgeTopicRequest(
    @NotBlank(message = "Title is required")
    @Size(max = 220, message = "Title must be 220 characters or fewer")
    String title,
    @Size(max = 4000, message = "Description must be 4000 characters or fewer")
    String description,
    @Size(max = 12, message = "Limit to 12 tags")
    Set<@Size(max = 64, message = "Each tag must be 64 characters or fewer") String> tags
) {
}
