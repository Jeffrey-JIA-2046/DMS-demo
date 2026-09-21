package com.dms.document.dto;

import java.time.Instant;

public record DocumentApprovalNoteResponse(
    String id,
    String authorId,
    String authorUsername,
    String authorDisplayName,
    String note,
    Instant createdAt
) {}
