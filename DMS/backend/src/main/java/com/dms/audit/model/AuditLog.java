package com.dms.audit.model;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonProperty;

public class AuditLog {

    @JsonProperty("id")
    private String id;

    @JsonProperty("action")
    private String action;

    @JsonProperty("document_id")
    private String documentId;

    @JsonProperty("performed_by")
    private String performedBy;

    @JsonProperty("details")
    private String details;

    @JsonProperty("created_at")
    private Instant createdAt;

    public AuditLog() {}

    public AuditLog(String action, String documentId, String performedBy, String details, Instant createdAt) {
        this.action = action;
        this.documentId = documentId;
        this.performedBy = performedBy;
        this.details = details;
        this.createdAt = createdAt;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public String getDocumentId() {
        return documentId;
    }

    public void setDocumentId(String documentId) {
        this.documentId = documentId;
    }

    public String getPerformedBy() {
        return performedBy;
    }

    public void setPerformedBy(String performedBy) {
        this.performedBy = performedBy;
    }

    public String getDetails() {
        return details;
    }

    public void setDetails(String details) {
        this.details = details;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
