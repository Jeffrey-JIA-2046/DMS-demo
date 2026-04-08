package com.dms.job.dto;

import java.time.Instant;

public record JobScheduleResponse(
    String jobKey,
    String jobName,
    String cronExpression,
    boolean enabled,
    Instant updatedAt,
    Instant lastRunAt,
    String lastStatus,
    String lastMessage
) {
}
