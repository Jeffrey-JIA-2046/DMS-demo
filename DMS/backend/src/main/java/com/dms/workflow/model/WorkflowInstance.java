package com.dms.workflow.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public class WorkflowInstance {
    private String id;
    private String documentId;
    private String templateId;
    private String templateName;
    private WorkflowInstanceStatus status;
    private String currentActivityId;
    private Instant startedAt;
    private Instant endedAt;
    private List<WorkflowStepLog> steps = new ArrayList<>();

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getDocumentId() {
        return documentId;
    }

    public void setDocumentId(String documentId) {
        this.documentId = documentId;
    }

    public String getTemplateId() {
        return templateId;
    }

    public void setTemplateId(String templateId) {
        this.templateId = templateId;
    }

    public String getTemplateName() {
        return templateName;
    }

    public void setTemplateName(String templateName) {
        this.templateName = templateName;
    }

    public WorkflowInstanceStatus getStatus() {
        return status;
    }

    public void setStatus(WorkflowInstanceStatus status) {
        this.status = status;
    }

    public String getCurrentActivityId() {
        return currentActivityId;
    }

    public void setCurrentActivityId(String currentActivityId) {
        this.currentActivityId = currentActivityId;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(Instant startedAt) {
        this.startedAt = startedAt;
    }

    public Instant getEndedAt() {
        return endedAt;
    }

    public void setEndedAt(Instant endedAt) {
        this.endedAt = endedAt;
    }

    public List<WorkflowStepLog> getSteps() {
        return steps;
    }

    public void setSteps(List<WorkflowStepLog> steps) {
        this.steps = steps != null ? new ArrayList<>(steps) : new ArrayList<>();
    }
}
