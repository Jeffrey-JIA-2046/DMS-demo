package com.dms.reminder.dto;

import java.time.Instant;

import com.dms.reminder.model.ReminderDateColumn;
import com.dms.reminder.model.ReminderOffsetDirection;
import com.dms.reminder.model.ReminderOffsetUnit;

public record ReminderRuleResponse(
    String id,
    String category,
    ReminderDateColumn dateColumn,
    ReminderOffsetDirection direction,
    int offsetValue,
    ReminderOffsetUnit offsetUnit,
    boolean active,
    Instant createdAt,
    Instant updatedAt
) {
}
