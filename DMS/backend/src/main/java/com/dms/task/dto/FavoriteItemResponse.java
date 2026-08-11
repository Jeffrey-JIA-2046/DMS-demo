package com.dms.task.dto;

import java.time.Instant;

public record FavoriteItemResponse(
    String targetType,
    String targetId,
    String title,
    String subtitle,
    Instant createdAt
) {}
