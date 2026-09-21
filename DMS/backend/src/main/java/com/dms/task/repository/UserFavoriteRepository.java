package com.dms.task.repository;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import com.dms.task.model.FavoriteTargetType;
import com.dms.task.model.UserFavorite;

@Repository
public class UserFavoriteRepository {

    @Autowired(required = false)
    private DataSource dataSource;
    private volatile boolean schemaEnsured;

    public List<UserFavorite> findByUsernameOrderByCreatedAtDesc(String username) throws IOException {
        ensureSchema();
        List<UserFavorite> favorites = new ArrayList<>();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT id, username, target_type, target_id, created_at FROM user_favorites WHERE username = ? ORDER BY created_at DESC")) {
            ps.setString(1, username);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    favorites.add(map(rs));
                }
            }
        } catch (Exception ex) {
            throw new IOException("Failed to load user favorites", ex);
        }
        return favorites;
    }

    public void upsert(String username, FavoriteTargetType targetType, String targetId, Instant createdAt) throws IOException {
        ensureSchema();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "INSERT INTO user_favorites(username, target_type, target_id, created_at) VALUES (?, ?, ?, ?) " +
                     "ON DUPLICATE KEY UPDATE created_at = VALUES(created_at)")) {
            ps.setString(1, username);
            ps.setString(2, targetType.name());
            ps.setString(3, targetId);
            ps.setTimestamp(4, toTimestamp(createdAt));
            ps.executeUpdate();
        } catch (Exception ex) {
            throw new IOException("Failed to save user favorite", ex);
        }
    }

    public void delete(String username, FavoriteTargetType targetType, String targetId) throws IOException {
        ensureSchema();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "DELETE FROM user_favorites WHERE username = ? AND target_type = ? AND target_id = ?")) {
            ps.setString(1, username);
            ps.setString(2, targetType.name());
            ps.setString(3, targetId);
            ps.executeUpdate();
        } catch (Exception ex) {
            throw new IOException("Failed to delete user favorite", ex);
        }
    }

    private void ensureSchema() throws IOException {
        if (dataSource == null) {
            throw new IOException("Data source is not configured");
        }
        if (schemaEnsured) {
            return;
        }
        synchronized (this) {
            if (schemaEnsured) {
                return;
            }
            try (Connection conn = dataSource.getConnection();
                 Statement statement = conn.createStatement()) {
                statement.execute("CREATE TABLE IF NOT EXISTS user_favorites (" +
                    "id BIGINT NOT NULL AUTO_INCREMENT," +
                    "username VARCHAR(255) NOT NULL," +
                    "target_type VARCHAR(20) NOT NULL," +
                    "target_id VARCHAR(128) NOT NULL," +
                    "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP," +
                    "PRIMARY KEY (id)," +
                    "UNIQUE KEY uk_user_favorites_user_target (username, target_type, target_id)," +
                    "KEY idx_user_favorites_user_created (username, created_at)" +
                    ")");
                schemaEnsured = true;
            } catch (Exception ex) {
                throw new IOException("Failed to ensure favorites schema", ex);
            }
        }
    }

    private UserFavorite map(ResultSet rs) throws Exception {
        UserFavorite favorite = new UserFavorite();
        favorite.setId(String.valueOf(rs.getLong("id")));
        favorite.setUsername(rs.getString("username"));
        String rawType = rs.getString("target_type");
        if (!StringUtils.hasText(rawType)) {
            throw new IllegalArgumentException("Favorite target type is missing");
        }
        favorite.setTargetType(FavoriteTargetType.valueOf(rawType));
        favorite.setTargetId(rs.getString("target_id"));
        favorite.setCreatedAt(toInstant(rs.getTimestamp("created_at")));
        return favorite;
    }

    private Timestamp toTimestamp(Instant instant) {
        if (instant == null) {
            return null;
        }
        return Timestamp.from(instant);
    }

    private Instant toInstant(Timestamp timestamp) {
        if (timestamp == null) {
            return null;
        }
        return timestamp.toInstant();
    }
}
