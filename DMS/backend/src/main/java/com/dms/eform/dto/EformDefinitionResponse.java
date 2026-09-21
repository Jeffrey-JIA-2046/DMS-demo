package com.dms.eform.dto;

import java.time.Instant;
import java.util.Map;

public record EformDefinitionResponse(
    String id,
    String categoryCode,
    String categoryLabel,
    Map<String, Object> schema,
    String createdBy,
    Instant createdAt,
    Instant updatedAt
) {
}
