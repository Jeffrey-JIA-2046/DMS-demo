package com.dms.task.dto;

import java.time.Instant;
import java.time.LocalDate;

import com.dms.task.model.TaskPriority;
import com.dms.task.model.TaskStatus;
import com.dms.task.model.TaskType;

public record TaskItemResponse(
    String id,
    String title,
    String description,
    TaskStatus status,
    TaskPriority priority,
    TaskType taskType,
    LocalDate dueDate,
    String workflowStep,
    String documentId,
    String documentTitle,
    Instant createdAt,
    Instant updatedAt
) {}
