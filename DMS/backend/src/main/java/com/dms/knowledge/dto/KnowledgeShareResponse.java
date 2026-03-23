package com.dms.knowledge.dto;

import java.time.Instant;

public record KnowledgeShareResponse(
    String id,
    String sender,
    String recipient,
    String message,
    Instant sharedAt
) {
}
