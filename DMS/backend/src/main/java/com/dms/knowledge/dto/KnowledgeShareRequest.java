package com.dms.knowledge.dto;

import java.util.Set;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

public record KnowledgeShareRequest(
    @NotEmpty(message = "Provide at least one recipient username")
    Set<@Size(max = 120, message = "Username is too long") String> recipientUsernames,
    @Size(max = 512, message = "Message must be 512 characters or fewer")
    String message
) {
}
