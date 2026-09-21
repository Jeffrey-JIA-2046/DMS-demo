package com.dms.knowledge.model;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonProperty;

public class KnowledgeTopicStar {

    @JsonProperty("id")
    private String id;

    @JsonProperty("topic_id")
    private String topicId;

    @JsonProperty("user_id")
    private String userId;

    @JsonProperty("starred_at")
    private Instant starredAt;

    private KnowledgeTopic topic;
    private com.dms.user.model.AppUser user;

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

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public Instant getStarredAt() {
        return starredAt;
    }

    public void setStarredAt(Instant starredAt) {
        this.starredAt = starredAt;
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

    public com.dms.user.model.AppUser getUser() {
        return user;
    }

    public void setUser(com.dms.user.model.AppUser user) {
        this.user = user;
        if (user != null) {
            this.userId = user.getId();
        }
    }
}
