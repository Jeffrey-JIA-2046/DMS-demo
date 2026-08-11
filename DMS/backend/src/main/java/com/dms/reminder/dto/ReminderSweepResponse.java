package com.dms.reminder.dto;

public record ReminderSweepResponse(
    int scannedDocuments,
    int tasksUpserted
) {
}
