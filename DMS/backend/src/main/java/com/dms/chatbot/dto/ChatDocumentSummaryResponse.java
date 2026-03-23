package com.dms.chatbot.dto;

import java.time.Instant;

public record ChatDocumentSummaryResponse(
    String documentId,
    String title,
    String summary,
    Instant generatedAt
) {
}
