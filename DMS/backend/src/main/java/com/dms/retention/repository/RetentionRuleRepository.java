package com.dms.retention.repository;

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
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

import com.dms.retention.model.RetentionDateBasis;
import com.dms.retention.model.RetentionRule;

@Repository
public class RetentionRuleRepository {

    @Autowired(required = false)
    private DataSource dataSource;

    private final Map<String, RetentionRule> inMemory = new ConcurrentHashMap<>();
    private final AtomicLong idCounter = new AtomicLong(1);

    public List<RetentionRule> findAll() throws IOException {
        if (dataSource == null) {
            List<RetentionRule> values = new ArrayList<>(inMemory.values());
            values.sort(Comparator.comparing(RetentionRule::getCategory, String.CASE_INSENSITIVE_ORDER));
            return values;
        }

        ensureTable();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT id, category, date_basis, years_to_retain, active, created_at, updated_at FROM document_retention_rules ORDER BY category ASC, id ASC");
             ResultSet rs = ps.executeQuery()) {
            List<RetentionRule> rules = new ArrayList<>();
            while (rs.next()) {
                rules.add(mapRule(rs));
            }
            return rules;
        } catch (Exception ex) {
            throw new IOException("Failed to read retention rules", ex);
        }
    }

    public Optional<RetentionRule> findById(String id) throws IOException {
        if (dataSource == null) {
            return Optional.ofNullable(inMemory.get(id));
        }

        ensureTable();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT id, category, date_basis, years_to_retain, active, created_at, updated_at FROM document_retention_rules WHERE id = ? LIMIT 1")) {
            ps.setLong(1, Long.parseLong(id));
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(mapRule(rs));
                }
                return Optional.empty();
            }
        } catch (Exception ex) {
            throw new IOException("Failed to read retention rule", ex);
        }
    }

    public RetentionRule save(RetentionRule rule) throws IOException {
        if (dataSource == null) {
            Instant now = Instant.now();
            if (rule.getId() == null) {
                rule.setId(String.valueOf(idCounter.getAndIncrement()));
                rule.setCreatedAt(now);
            }
            rule.setUpdatedAt(now);
            inMemory.put(rule.getId(), rule);
            return rule;
        }

        ensureTable();
        try (Connection conn = dataSource.getConnection()) {
            Long id = parseLong(rule.getId());
            if (id == null) {
                try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO document_retention_rules(category, date_basis, years_to_retain, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS)) {
                    Instant now = Instant.now();
                    ps.setString(1, rule.getCategory());
                    ps.setString(2, rule.getDateBasis().name());
                    ps.setInt(3, rule.getYearsToRetain());
                    ps.setBoolean(4, rule.isActive());
                    ps.setTimestamp(5, Timestamp.from(rule.getCreatedAt() == null ? now : rule.getCreatedAt()));
                    ps.setTimestamp(6, Timestamp.from(rule.getUpdatedAt() == null ? now : rule.getUpdatedAt()));
                    ps.executeUpdate();
                    try (ResultSet keys = ps.getGeneratedKeys()) {
                        if (keys.next()) {
                            rule.setId(String.valueOf(keys.getLong(1)));
                        }
                    }
                    return rule;
                }
            }

            try (PreparedStatement ps = conn.prepareStatement(
                "UPDATE document_retention_rules SET category=?, date_basis=?, years_to_retain=?, active=?, created_at=?, updated_at=? WHERE id=?")) {
                ps.setString(1, rule.getCategory());
                ps.setString(2, rule.getDateBasis().name());
                ps.setInt(3, rule.getYearsToRetain());
                ps.setBoolean(4, rule.isActive());
                ps.setTimestamp(5, rule.getCreatedAt() == null ? null : Timestamp.from(rule.getCreatedAt()));
                ps.setTimestamp(6, rule.getUpdatedAt() == null ? null : Timestamp.from(rule.getUpdatedAt()));
                ps.setLong(7, id);
                ps.executeUpdate();
                return rule;
            }
        } catch (Exception ex) {
            throw new IOException("Failed to save retention rule", ex);
        }
    }

    public void deleteById(String id) throws IOException {
        if (dataSource == null) {
            inMemory.remove(id);
            return;
        }

        ensureTable();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement("DELETE FROM document_retention_rules WHERE id = ?")) {
            ps.setLong(1, Long.parseLong(id));
            ps.executeUpdate();
        } catch (Exception ex) {
            throw new IOException("Failed to delete retention rule", ex);
        }
    }

    private void ensureTable() throws IOException {
        try (Connection conn = dataSource.getConnection();
             Statement st = conn.createStatement()) {
            st.execute(
                "CREATE TABLE IF NOT EXISTS document_retention_rules ("
                    + "id BIGINT PRIMARY KEY AUTO_INCREMENT,"
                    + "category VARCHAR(128) NOT NULL,"
                    + "date_basis VARCHAR(32) NOT NULL,"
                    + "years_to_retain INT NOT NULL,"
                    + "active BOOLEAN NOT NULL DEFAULT TRUE,"
                    + "created_at TIMESTAMP NULL,"
                    + "updated_at TIMESTAMP NULL"
                    + ")"
            );
        } catch (Exception ex) {
            throw new IOException("Failed to ensure retention rule table", ex);
        }
    }

    private RetentionRule mapRule(ResultSet rs) throws Exception {
        RetentionRule rule = new RetentionRule();
        rule.setId(String.valueOf(rs.getLong("id")));
        rule.setCategory(rs.getString("category"));
        rule.setDateBasis(RetentionDateBasis.valueOf(rs.getString("date_basis")));
        rule.setYearsToRetain(rs.getInt("years_to_retain"));
        rule.setActive(rs.getBoolean("active"));

        Timestamp createdTs = rs.getTimestamp("created_at");
        if (createdTs != null) {
            rule.setCreatedAt(createdTs.toInstant());
        }
        Timestamp updatedTs = rs.getTimestamp("updated_at");
        if (updatedTs != null) {
            rule.setUpdatedAt(updatedTs.toInstant());
        }
        return rule;
    }

    private Long parseLong(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
