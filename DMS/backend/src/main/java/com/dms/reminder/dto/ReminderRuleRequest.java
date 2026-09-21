package com.dms.reminder.dto;

import com.dms.reminder.model.ReminderDateColumn;
import com.dms.reminder.model.ReminderOffsetDirection;
import com.dms.reminder.model.ReminderOffsetUnit;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record ReminderRuleRequest(
    @NotBlank String category,
    @NotNull ReminderDateColumn dateColumn,
    @NotNull ReminderOffsetDirection direction,
    @Min(1) int offsetValue,
    @NotNull ReminderOffsetUnit offsetUnit,
    Boolean active
) {
}
