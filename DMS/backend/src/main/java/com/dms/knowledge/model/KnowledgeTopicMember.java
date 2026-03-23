package com.dms.knowledge.model;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.dms.user.model.AppUser;

public class KnowledgeTopicMember {

    @JsonProperty("id")
    private String id;

    @JsonProperty("topic_id")
    private String topicId;

    @JsonProperty("user_id")
    private String userId;

    @JsonProperty("joined_at")
    private Instant joinedAt;

    private transient KnowledgeTopic topic;
    private transient AppUser user;

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

    public Instant getJoinedAt() {
        return joinedAt;
    }

    public void setJoinedAt(Instant joinedAt) {
        this.joinedAt = joinedAt;
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

    public AppUser getUser() {
        return user;
    }

    public void setUser(AppUser user) {
        this.user = user;
        if (user != null) {
            this.userId = user.getId();
        }
    }
}
