package com.dms.knowledge.model;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonProperty;

public class KnowledgeTopicUpload {

    @JsonProperty("id")
    private String id;

    @JsonProperty("topic_id")
    private String topicId;

    @JsonProperty("file_name")
    private String fileName;

    @JsonProperty("content_type")
    private String contentType;

    @JsonProperty("size")
    private long size;

    @JsonProperty("content")
    private byte[] content;

    @JsonProperty("description")
    private String description;

    @JsonProperty("uploaded_by_id")
    private String uploadedById;

    @JsonProperty("uploaded_at")
    private Instant uploadedAt;

    private KnowledgeTopic topic;
    private com.dms.user.model.AppUser uploadedBy;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getTopicId() {
        return topicId;
    }

    public void setTopicId(String topicId) {
        this.topicId = topicId;
    }

    public String getFileName() {
        return fileName;
    }

    public void setFileName(String fileName) {
        this.fileName = fileName;
    }

    public String getContentType() {
        return contentType;
    }

    public void setContentType(String contentType) {
        this.contentType = contentType;
    }

    public long getSize() {
        return size;
    }

    public void setSize(long size) {
        this.size = size;
    }

    public byte[] getContent() {
        return content;
    }

    public void setContent(byte[] content) {
        this.content = content;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getUploadedById() {
        return uploadedById;
    }

    public void setUploadedById(String uploadedById) {
        this.uploadedById = uploadedById;
    }

    public Instant getUploadedAt() {
        return uploadedAt;
    }

    public void setUploadedAt(Instant uploadedAt) {
        this.uploadedAt = uploadedAt;
    }

    public KnowledgeTopic getTopic() {
        return topic;
    }

    public void setTopic(KnowledgeTopic topic) {
        this.topic = topic;
    }

    public com.dms.user.model.AppUser getUploadedBy() {
        return uploadedBy;
    }

    public void setUploadedBy(com.dms.user.model.AppUser uploadedBy) {
        this.uploadedBy = uploadedBy;
    }
}
