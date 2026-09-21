package com.dms.eform.repository;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import com.dms.eform.model.EformDefinition;

@Repository
public class EformDefinitionRepository {

    @Autowired(required = false)
    private DataSource dataSource;

    private volatile boolean schemaEnsured;
    private final ConcurrentMap<String, EformDefinition> inMemoryByCategory = new ConcurrentHashMap<>();

    public List<EformDefinition> findAllOrderByCategoryCodeAsc() throws IOException {
        if (dataSource == null) {
            return inMemoryByCategory.values().stream()
                .sorted(Comparator.comparing(EformDefinition::getCategoryCode, String.CASE_INSENSITIVE_ORDER))
                .toList();
        }

        ensureSchema();
        List<EformDefinition> definitions = new ArrayList<>();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT id, category_code, category_label, schema_json, created_by, created_at, updated_at FROM eform_definitions ORDER BY category_code ASC");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                definitions.add(map(rs));
            }
        } catch (Exception ex) {
            throw new IOException("Failed to load eForm definitions", ex);
        }
        return definitions;
    }

    public Optional<EformDefinition> findByCategoryCode(String categoryCode) throws IOException {
        String normalizedCode = normalizeCode(categoryCode);
        if (!StringUtils.hasText(normalizedCode)) {
            return Optional.empty();
        }

        if (dataSource == null) {
            return Optional.ofNullable(inMemoryByCategory.get(normalizedCode));
        }

        ensureSchema();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT id, category_code, category_label, schema_json, created_by, created_at, updated_at FROM eform_definitions WHERE category_code = ? LIMIT 1")) {
            ps.setString(1, normalizedCode);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(map(rs));
                }
            }
        } catch (Exception ex) {
            throw new IOException("Failed to read eForm definition", ex);
        }
        return Optional.empty();
    }

    public EformDefinition upsert(EformDefinition definition) throws IOException {
        String normalizedCode = normalizeCode(definition.getCategoryCode());
        if (!StringUtils.hasText(normalizedCode)) {
            throw new IOException("Category code is required");
        }

        definition.setCategoryCode(normalizedCode);

        if (dataSource == null) {
            inMemoryByCategory.put(normalizedCode, definition);
            return definition;
        }

        ensureSchema();
        try (Connection conn = dataSource.getConnection()) {
            try (PreparedStatement ps = conn.prepareStatement(
                "INSERT INTO eform_definitions(category_code, category_label, schema_json, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) " +
                "ON DUPLICATE KEY UPDATE category_label = VALUES(category_label), schema_json = VALUES(schema_json), created_by = VALUES(created_by), created_at = VALUES(created_at), updated_at = VALUES(updated_at)",
                Statement.RETURN_GENERATED_KEYS)) {
                ps.setString(1, definition.getCategoryCode());
                ps.setString(2, definition.getCategoryLabel());
                ps.setString(3, definition.getSchemaJson());
                ps.setString(4, definition.getCreatedBy());
                ps.setTimestamp(5, toTimestamp(definition.getCreatedAt()));
                ps.setTimestamp(6, toTimestamp(definition.getUpdatedAt()));
                ps.executeUpdate();
                try (ResultSet keys = ps.getGeneratedKeys()) {
                    if (keys.next()) {
                        definition.setId(String.valueOf(keys.getLong(1)));
                    }
                }
            }

            if (!StringUtils.hasText(definition.getId())) {
                try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT id FROM eform_definitions WHERE category_code = ? LIMIT 1")) {
                    ps.setString(1, definition.getCategoryCode());
                    try (ResultSet rs = ps.executeQuery()) {
                        if (rs.next()) {
                            definition.setId(String.valueOf(rs.getLong("id")));
                        }
                    }
                }
            }
        } catch (Exception ex) {
            throw new IOException("Failed to save eForm definition", ex);
        }

        return definition;
    }

    public void deleteByCategoryCode(String categoryCode) throws IOException {
        String normalizedCode = normalizeCode(categoryCode);
        if (!StringUtils.hasText(normalizedCode)) {
            return;
        }

        if (dataSource == null) {
            inMemoryByCategory.remove(normalizedCode);
            return;
        }

        ensureSchema();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement("DELETE FROM eform_definitions WHERE category_code = ?")) {
            ps.setString(1, normalizedCode);
            ps.executeUpdate();
        } catch (Exception ex) {
            throw new IOException("Failed to delete eForm definition", ex);
        }
    }

    private void ensureSchema() throws IOException {
        if (schemaEnsured) {
            return;
        }
        if (dataSource == null) {
            throw new IOException("Data source is not configured");
        }

        synchronized (this) {
            if (schemaEnsured) {
                return;
            }
            try (Connection conn = dataSource.getConnection();
                 Statement statement = conn.createStatement()) {
                statement.execute("CREATE TABLE IF NOT EXISTS eform_definitions (" +
                    "id BIGINT NOT NULL AUTO_INCREMENT," +
                    "category_code VARCHAR(128) NOT NULL," +
                    "category_label VARCHAR(255) NULL," +
                    "schema_json LONGTEXT NOT NULL," +
                    "created_by VARCHAR(255) NULL," +
                    "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP," +
                    "updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
                    "PRIMARY KEY (id)," +
                    "UNIQUE KEY uk_eform_definitions_category_code (category_code)" +
                    ")");
                schemaEnsured = true;
            } catch (Exception ex) {
                throw new IOException("Failed to ensure eForm definition schema", ex);
            }
        }
    }

    private EformDefinition map(ResultSet rs) throws Exception {
        EformDefinition definition = new EformDefinition();
        definition.setId(String.valueOf(rs.getLong("id")));
        definition.setCategoryCode(rs.getString("category_code"));
        definition.setCategoryLabel(rs.getString("category_label"));
        definition.setSchemaJson(rs.getString("schema_json"));
        definition.setCreatedBy(rs.getString("created_by"));
        definition.setCreatedAt(toInstant(rs.getTimestamp("created_at")));
        definition.setUpdatedAt(toInstant(rs.getTimestamp("updated_at")));
        return definition;
    }

    private String normalizeCode(String categoryCode) {
        if (!StringUtils.hasText(categoryCode)) {
            return null;
        }
        return categoryCode.trim().toUpperCase();
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
