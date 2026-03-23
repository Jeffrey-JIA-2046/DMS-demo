package com.dms.knowledge.model;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonProperty;

public class KnowledgeTopicShare {

    @JsonProperty("id")
    private String id;

    @JsonProperty("topic_id")
    private String topicId;

    @JsonProperty("sender_id")
    private String senderId;

    @JsonProperty("recipient_id")
    private String recipientId;

    @JsonProperty("message")
    private String message;

    @JsonProperty("shared_at")
    private Instant sharedAt;

    private KnowledgeTopic topic;
    private com.dms.user.model.AppUser sender;
    private com.dms.user.model.AppUser recipient;

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

    public String getSenderId() {
        return senderId;
    }

    public void setSenderId(String senderId) {
        this.senderId = senderId;
    }

    public String getRecipientId() {
        return recipientId;
    }

    public void setRecipientId(String recipientId) {
        this.recipientId = recipientId;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public Instant getSharedAt() {
        return sharedAt;
    }

    public void setSharedAt(Instant sharedAt) {
        this.sharedAt = sharedAt;
    }

    public KnowledgeTopic getTopic() {
        return topic;
    }

    public void setTopic(KnowledgeTopic topic) {
        this.topic = topic;
    }

    public com.dms.user.model.AppUser getSender() {
        return sender;
    }

    public void setSender(com.dms.user.model.AppUser sender) {
        this.sender = sender;
    }

    public com.dms.user.model.AppUser getRecipient() {
        return recipient;
    }

    public void setRecipient(com.dms.user.model.AppUser recipient) {
        this.recipient = recipient;
    }
}
