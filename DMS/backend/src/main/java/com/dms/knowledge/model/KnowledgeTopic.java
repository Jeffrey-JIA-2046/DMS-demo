package com.dms.knowledge.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import com.fasterxml.jackson.annotation.JsonProperty;

public class KnowledgeTopic {

    @JsonProperty("id")
    private String id;

    @JsonProperty("title")
    private String title;

    @JsonProperty("description")
    private String description;

    @JsonProperty("tags")
    private Set<String> tags = new LinkedHashSet<>();

    @JsonProperty("created_by_id")
    private String createdById;

    @JsonProperty("created_at")
    private Instant createdAt;

    @JsonProperty("updated_at")
    private Instant updatedAt;

    @JsonProperty("contributions")
    private List<KnowledgeContribution> contributions = new ArrayList<>();

    @JsonProperty("members")
    private List<KnowledgeTopicMember> members = new ArrayList<>();

    @JsonProperty("stars")
    private List<KnowledgeTopicStar> stars = new ArrayList<>();

    @JsonProperty("document_links")
    private List<KnowledgeTopicDocumentLink> documentLinks = new ArrayList<>();

    @JsonProperty("uploads")
    private List<KnowledgeTopicUpload> uploads = new ArrayList<>();

    @JsonProperty("shares")
    private List<KnowledgeTopicShare> shares = new ArrayList<>();

    private com.dms.user.model.AppUser createdBy;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public com.dms.user.model.AppUser getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(com.dms.user.model.AppUser createdBy) {
        this.createdBy = createdBy;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Set<String> getTags() {
        return tags;
    }

    public void setTags(Set<String> tags) {
        this.tags = tags != null ? new LinkedHashSet<>(tags) : new LinkedHashSet<>();
    }

    public String getCreatedById() {
        return createdById;
    }

    public void setCreatedById(String createdById) {
        this.createdById = createdById;
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

    public List<KnowledgeContribution> getContributions() {
        return contributions;
    }

    public List<KnowledgeTopicMember> getMembers() {
        return members;
    }

    public List<KnowledgeTopicStar> getStars() {
        return stars;
    }

    public List<KnowledgeTopicDocumentLink> getDocumentLinks() {
        return documentLinks;
    }

    public List<KnowledgeTopicUpload> getUploads() {
        return uploads;
    }

    public List<KnowledgeTopicShare> getShares() {
        return shares;
    }
}
