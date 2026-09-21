package com.dms.task.model;

import java.time.Instant;

public class UserFavorite {

    private String id;
    private String username;
    private FavoriteTargetType targetType;
    private String targetId;
    private Instant createdAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public FavoriteTargetType getTargetType() {
        return targetType;
    }

    public void setTargetType(FavoriteTargetType targetType) {
        this.targetType = targetType;
    }

    public String getTargetId() {
        return targetId;
    }

    public void setTargetId(String targetId) {
        this.targetId = targetId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
