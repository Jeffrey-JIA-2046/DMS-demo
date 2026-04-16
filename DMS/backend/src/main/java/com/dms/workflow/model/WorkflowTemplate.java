package com.dms.workflow.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public class WorkflowTemplate {
    private String id;
    private String templateGroupId;
    private String name;
    private String description;
    private boolean published;
    private int versionNumber;
    private WorkflowTemplateLifecycle lifecycleStatus = WorkflowTemplateLifecycle.DRAFT;
    private String basedOnTemplateId;
    private String createdBy;
    private Instant createdAt;
    private Instant updatedAt;
    private Instant publishedAt;
    private List<WorkflowActivity> activities = new ArrayList<>();
    private List<WorkflowConnection> connections = new ArrayList<>();

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getTemplateGroupId() {
        return templateGroupId;
    }

    public void setTemplateGroupId(String templateGroupId) {
        this.templateGroupId = templateGroupId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public boolean isPublished() {
        return published;
    }

    public void setPublished(boolean published) {
        this.published = published;
    }

    public int getVersionNumber() {
        return versionNumber;
    }

    public void setVersionNumber(int versionNumber) {
        this.versionNumber = versionNumber;
    }

    public WorkflowTemplateLifecycle getLifecycleStatus() {
        return lifecycleStatus;
    }

    public void setLifecycleStatus(WorkflowTemplateLifecycle lifecycleStatus) {
        this.lifecycleStatus = lifecycleStatus;
    }

    public String getBasedOnTemplateId() {
        return basedOnTemplateId;
    }

    public void setBasedOnTemplateId(String basedOnTemplateId) {
        this.basedOnTemplateId = basedOnTemplateId;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(String createdBy) {
        this.createdBy = createdBy;
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

    public Instant getPublishedAt() {
        return publishedAt;
    }

    public void setPublishedAt(Instant publishedAt) {
        this.publishedAt = publishedAt;
    }

    public List<WorkflowActivity> getActivities() {
        return activities;
    }

    public void setActivities(List<WorkflowActivity> activities) {
        this.activities = activities != null ? new ArrayList<>(activities) : new ArrayList<>();
    }

    public List<WorkflowConnection> getConnections() {
        return connections;
    }

    public void setConnections(List<WorkflowConnection> connections) {
        this.connections = connections != null ? new ArrayList<>(connections) : new ArrayList<>();
    }
}
