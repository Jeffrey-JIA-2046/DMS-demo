package com.dms.retention.model;

import java.time.Instant;

public class RetentionRule {

    private String id;
    private String category;
    private RetentionDateBasis dateBasis;
    private int yearsToRetain;
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

    public RetentionDateBasis getDateBasis() {
        return dateBasis;
    }

    public void setDateBasis(RetentionDateBasis dateBasis) {
        this.dateBasis = dateBasis;
    }

    public int getYearsToRetain() {
        return yearsToRetain;
    }

    public void setYearsToRetain(int yearsToRetain) {
        this.yearsToRetain = yearsToRetain;
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
