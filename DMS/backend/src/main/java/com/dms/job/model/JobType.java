package com.dms.job.model;

public enum JobType {
    RETENTION_SWEEP,
    REMINDER_SWEEP;

    public static JobType fromKey(String key) {
        if (key == null || key.isBlank()) {
            throw new IllegalArgumentException("Job key is required");
        }
        try {
            return JobType.valueOf(key.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("Unsupported job key: " + key);
        }
    }
}
