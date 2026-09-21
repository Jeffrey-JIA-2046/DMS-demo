package com.dms.knowledge.model;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonProperty;

public class KnowledgeTopicDocumentLink {

    @JsonProperty("id")
    private String id;

    @JsonProperty("topic_id")
    private String topicId;

    @JsonProperty("document_id")
    private String documentId;

    @JsonProperty("document_title")
    private String documentTitle;

    @JsonProperty("note")
    private String note;

    @JsonProperty("linked_by_id")
    private String linkedById;

    @JsonProperty("linked_at")
    private Instant linkedAt;

    private KnowledgeTopic topic;
    private com.dms.user.model.AppUser linkedBy;

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

    public String getDocumentId() {
        return documentId;
    }

    public void setDocumentId(String documentId) {
        this.documentId = documentId;
    }

    public String getDocumentTitle() {
        return documentTitle;
    }

    public void setDocumentTitle(String documentTitle) {
        this.documentTitle = documentTitle;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public String getLinkedById() {
        return linkedById;
    }

    public void setLinkedById(String linkedById) {
        this.linkedById = linkedById;
    }

    public Instant getLinkedAt() {
        return linkedAt;
    }

    public void setLinkedAt(Instant linkedAt) {
        this.linkedAt = linkedAt;
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

    public com.dms.user.model.AppUser getLinkedBy() {
        return linkedBy;
    }

    public void setLinkedBy(com.dms.user.model.AppUser linkedBy) {
        this.linkedBy = linkedBy;
        if (linkedBy != null) {
            this.linkedById = linkedBy.getId();
        }
    }
}
