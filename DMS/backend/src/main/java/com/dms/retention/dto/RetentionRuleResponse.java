package com.dms.retention.dto;

import java.time.Instant;

import com.dms.retention.model.RetentionDateBasis;

public record RetentionRuleResponse(
    String id,
    String category,
    RetentionDateBasis dateBasis,
    int yearsToRetain,
    boolean active,
    Instant createdAt,
    Instant updatedAt
) {}
