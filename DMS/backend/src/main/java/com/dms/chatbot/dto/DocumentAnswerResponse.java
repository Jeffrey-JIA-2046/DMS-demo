package com.dms.chatbot.dto;

import java.time.Instant;

public record DocumentAnswerResponse(
    String documentId,
    String title,
    String answer,
    Instant generatedAt
) {
}
