package com.dms.user.dto;

public record GroupResponse(
    String id,
    String name,
    String description,
    int memberCount
) {}
