package com.dms.task.dto;

import java.time.Instant;
import java.util.List;

public record UserDashboardResponse(
    Instant generatedAt,
    List<TaskItemResponse> tasks
) {}
