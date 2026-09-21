package com.dms.chatbot.dto;

import java.time.Instant;
import java.util.List;

public record ChatSearchResponse(
    String prompt,
    Instant generatedAt,
    String overview,
    List<ChatDocumentHitResponse> results
) {
}
