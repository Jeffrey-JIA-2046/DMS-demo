package com.dms.reminder.repository;

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

import com.dms.reminder.model.ReminderDateColumn;
import com.dms.reminder.model.ReminderOffsetDirection;
import com.dms.reminder.model.ReminderOffsetUnit;
import com.dms.reminder.model.ReminderRule;

@Repository
public class ReminderRuleRepository {

    @Autowired(required = false)
    private DataSource dataSource;

    private final Map<String, ReminderRule> inMemory = new ConcurrentHashMap<>();
    private final AtomicLong idCounter = new AtomicLong(1);

    public List<ReminderRule> findAll() throws IOException {
        if (dataSource == null) {
            List<ReminderRule> values = new ArrayList<>(inMemory.values());
            values.sort(Comparator.comparing(ReminderRule::getCategory, String.CASE_INSENSITIVE_ORDER));
            return values;
        }

        ensureTable();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT id, category, date_column, direction, offset_value, offset_unit, active, created_at, updated_at FROM document_reminder_rules ORDER BY category ASC, id ASC");
             ResultSet rs = ps.executeQuery()) {
            List<ReminderRule> rules = new ArrayList<>();
            while (rs.next()) {
                rules.add(mapRule(rs));
            }
            return rules;
        } catch (Exception ex) {
            throw new IOException("Failed to read reminder rules", ex);
        }
    }

    public Optional<ReminderRule> findById(String id) throws IOException {
        if (dataSource == null) {
            return Optional.ofNullable(inMemory.get(id));
        }

        ensureTable();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT id, category, date_column, direction, offset_value, offset_unit, active, created_at, updated_at FROM document_reminder_rules WHERE id = ? LIMIT 1")) {
            ps.setLong(1, Long.parseLong(id));
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(mapRule(rs));
                }
                return Optional.empty();
            }
        } catch (Exception ex) {
            throw new IOException("Failed to read reminder rule", ex);
        }
    }

    public ReminderRule save(ReminderRule rule) throws IOException {
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
                    "INSERT INTO document_reminder_rules(category, date_column, direction, offset_value, offset_unit, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS)) {
                    Instant now = Instant.now();
                    ps.setString(1, rule.getCategory());
                    ps.setString(2, rule.getDateColumn().name());
                    ps.setString(3, rule.getDirection().name());
                    ps.setInt(4, rule.getOffsetValue());
                    ps.setString(5, rule.getOffsetUnit().name());
                    ps.setBoolean(6, rule.isActive());
                    ps.setTimestamp(7, Timestamp.from(rule.getCreatedAt() == null ? now : rule.getCreatedAt()));
                    ps.setTimestamp(8, Timestamp.from(rule.getUpdatedAt() == null ? now : rule.getUpdatedAt()));
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
                "UPDATE document_reminder_rules SET category=?, date_column=?, direction=?, offset_value=?, offset_unit=?, active=?, created_at=?, updated_at=? WHERE id=?")) {
                ps.setString(1, rule.getCategory());
                ps.setString(2, rule.getDateColumn().name());
                ps.setString(3, rule.getDirection().name());
                ps.setInt(4, rule.getOffsetValue());
                ps.setString(5, rule.getOffsetUnit().name());
                ps.setBoolean(6, rule.isActive());
                ps.setTimestamp(7, rule.getCreatedAt() == null ? null : Timestamp.from(rule.getCreatedAt()));
                ps.setTimestamp(8, rule.getUpdatedAt() == null ? null : Timestamp.from(rule.getUpdatedAt()));
                ps.setLong(9, id);
                ps.executeUpdate();
                return rule;
            }
        } catch (Exception ex) {
            throw new IOException("Failed to save reminder rule", ex);
        }
    }

    public void deleteById(String id) throws IOException {
        if (dataSource == null) {
            inMemory.remove(id);
            return;
        }

        ensureTable();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement("DELETE FROM document_reminder_rules WHERE id = ?")) {
            ps.setLong(1, Long.parseLong(id));
            ps.executeUpdate();
        } catch (Exception ex) {
            throw new IOException("Failed to delete reminder rule", ex);
        }
    }

    private void ensureTable() throws IOException {
        try (Connection conn = dataSource.getConnection();
             Statement st = conn.createStatement()) {
            st.execute(
                "CREATE TABLE IF NOT EXISTS document_reminder_rules ("
                    + "id BIGINT PRIMARY KEY AUTO_INCREMENT,"
                    + "category VARCHAR(128) NOT NULL,"
                    + "date_column VARCHAR(32) NOT NULL,"
                    + "direction VARCHAR(16) NOT NULL,"
                    + "offset_value INT NOT NULL,"
                    + "offset_unit VARCHAR(16) NOT NULL,"
                    + "active BOOLEAN NOT NULL DEFAULT TRUE,"
                    + "created_at TIMESTAMP NULL,"
                    + "updated_at TIMESTAMP NULL"
                    + ")"
            );
        } catch (Exception ex) {
            throw new IOException("Failed to ensure reminder rule table", ex);
        }
    }

    private ReminderRule mapRule(ResultSet rs) throws Exception {
        ReminderRule rule = new ReminderRule();
        rule.setId(String.valueOf(rs.getLong("id")));
        rule.setCategory(rs.getString("category"));
        rule.setDateColumn(ReminderDateColumn.valueOf(rs.getString("date_column")));
        rule.setDirection(ReminderOffsetDirection.valueOf(rs.getString("direction")));
        rule.setOffsetValue(rs.getInt("offset_value"));
        rule.setOffsetUnit(ReminderOffsetUnit.valueOf(rs.getString("offset_unit")));
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
