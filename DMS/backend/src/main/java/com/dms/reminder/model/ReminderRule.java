package com.dms.reminder.model;

import java.time.Instant;

public class ReminderRule {

    private String id;
    private String category;
    private ReminderDateColumn dateColumn;
    private ReminderOffsetDirection direction;
    private int offsetValue;
    private ReminderOffsetUnit offsetUnit;
    private boolean active = true;
    private Instant createdAt;
    private Instant updatedAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public ReminderDateColumn getDateColumn() {
        return dateColumn;
    }

    public void setDateColumn(ReminderDateColumn dateColumn) {
        this.dateColumn = dateColumn;
    }

    public ReminderOffsetDirection getDirection() {
        return direction;
    }

    public void setDirection(ReminderOffsetDirection direction) {
        this.direction = direction;
    }

    public int getOffsetValue() {
        return offsetValue;
    }

    public void setOffsetValue(int offsetValue) {
        this.offsetValue = offsetValue;
    }

    public ReminderOffsetUnit getOffsetUnit() {
        return offsetUnit;
    }

    public void setOffsetUnit(ReminderOffsetUnit offsetUnit) {
        this.offsetUnit = offsetUnit;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
