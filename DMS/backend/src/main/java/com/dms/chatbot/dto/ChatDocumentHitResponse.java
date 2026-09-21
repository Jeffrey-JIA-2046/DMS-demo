package com.dms.chatbot.dto;

import java.time.Instant;

public record ChatDocumentHitResponse(
    String documentId,
    String title,
    String owner,
    String category,
    String status,
    String snippet,
    Instant updatedAt
) {
}
