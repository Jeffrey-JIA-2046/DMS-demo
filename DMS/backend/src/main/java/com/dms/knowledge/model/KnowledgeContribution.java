package com.dms.knowledge.model;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonProperty;

public class KnowledgeContribution {

    @JsonProperty("id")
    private String id;

    @JsonProperty("topic_id")
    private String topicId;

    @JsonProperty("author_id")
    private String authorId;

    @JsonProperty("content")
    private String content;

    @JsonProperty("linked_document_id")
    private String linkedDocumentId;

    @JsonProperty("linked_document_title")
    private String linkedDocumentTitle;

    @JsonProperty("created_at")
    private Instant createdAt;

    private KnowledgeTopic topic;
    private com.dms.user.model.AppUser author;

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

    public String getAuthorId() {
        return authorId;
    }

    public void setAuthorId(String authorId) {
        this.authorId = authorId;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getLinkedDocumentId() {
        return linkedDocumentId;
    }

    public void setLinkedDocumentId(String linkedDocumentId) {
        this.linkedDocumentId = linkedDocumentId;
    }

    public String getLinkedDocumentTitle() {
        return linkedDocumentTitle;
    }

    public void setLinkedDocumentTitle(String linkedDocumentTitle) {
        this.linkedDocumentTitle = linkedDocumentTitle;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public KnowledgeTopic getTopic() {
        return topic;
    }

    public void setTopic(KnowledgeTopic topic) {
        this.topic = topic;
        if (topic != null) {
            this.topicId = topic.getId();
        }
    }

    public com.dms.user.model.AppUser getAuthor() {
        return author;
    }

    public void setAuthor(com.dms.user.model.AppUser author) {
        this.author = author;
        if (author != null) {
            this.authorId = author.getId();
        }
    }
}
