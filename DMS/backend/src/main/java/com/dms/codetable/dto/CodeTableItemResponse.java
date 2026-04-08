package com.dms.codetable.dto;

import java.time.Instant;

public record CodeTableItemResponse(
    String id,
    String tableCode,
    String itemCode,
    String itemLabel,
    String description,
    int sortOrder,
    boolean active,
    Instant createdAt,
    Instant updatedAt
) {
}
