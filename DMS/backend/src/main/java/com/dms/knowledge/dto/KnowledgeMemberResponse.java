package com.dms.knowledge.dto;

import java.time.Instant;

public record KnowledgeMemberResponse(
    String userId,
    String displayName,
    Instant joinedAt
) {
}
