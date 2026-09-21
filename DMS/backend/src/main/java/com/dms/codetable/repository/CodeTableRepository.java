package com.dms.codetable.repository;

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

import com.dms.codetable.model.CodeTableItem;

@Repository
public class CodeTableRepository {

    @Autowired(required = false)
    private DataSource dataSource;

    private final Map<String, CodeTableItem> inMemory = new ConcurrentHashMap<>();
    private final AtomicLong idCounter = new AtomicLong(1);

    public List<String> findAllTableCodes() throws IOException {
        if (dataSource == null) {
            return inMemory.values().stream()
                .map(CodeTableItem::getTableCode)
                .distinct()
                .sorted()
                .toList();
        }
        ensureTable();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT DISTINCT table_code FROM system_code_table_items ORDER BY table_code");
             ResultSet rs = ps.executeQuery()) {
            List<String> codes = new ArrayList<>();
            while (rs.next()) {
                codes.add(rs.getString("table_code"));
            }
            return codes;
        } catch (Exception ex) {
            throw new IOException("Failed to read code table codes", ex);
        }
    }

    public List<CodeTableItem> findByTableCode(String tableCode) throws IOException {
        if (dataSource == null) {
            return inMemory.values().stream()
                .filter(item -> tableCode.equals(item.getTableCode()))
                .sorted(Comparator.comparingInt(CodeTableItem::getSortOrder)
                    .thenComparing(CodeTableItem::getItemLabel, String.CASE_INSENSITIVE_ORDER))
                .toList();
        }
        ensureTable();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT id, table_code, item_code, item_label, description, sort_order, active, created_at, updated_at "
                 + "FROM system_code_table_items WHERE table_code = ? ORDER BY sort_order ASC, item_label ASC")) {
            ps.setString(1, tableCode);
            try (ResultSet rs = ps.executeQuery()) {
                List<CodeTableItem> items = new ArrayList<>();
                while (rs.next()) {
                    items.add(mapItem(rs));
                }
                return items;
            }
        } catch (Exception ex) {
            throw new IOException("Failed to read code table items", ex);
        }
    }

    public List<CodeTableItem> findActiveByTableCode(String tableCode) throws IOException {
        return findByTableCode(tableCode).stream()
            .filter(CodeTableItem::isActive)
            .toList();
    }

    public Optional<CodeTableItem> findById(String id) throws IOException {
        if (dataSource == null) {
            return Optional.ofNullable(inMemory.get(id));
        }
        ensureTable();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT id, table_code, item_code, item_label, description, sort_order, active, created_at, updated_at "
                 + "FROM system_code_table_items WHERE id = ? LIMIT 1")) {
            ps.setLong(1, Long.parseLong(id));
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(mapItem(rs));
                }
                return Optional.empty();
            }
        } catch (Exception ex) {
            throw new IOException("Failed to read code table item", ex);
        }
    }

    public CodeTableItem save(CodeTableItem item) throws IOException {
        if (dataSource == null) {
            Instant now = Instant.now();
            if (item.getId() == null) {
                item.setId(String.valueOf(idCounter.getAndIncrement()));
                item.setCreatedAt(now);
            }
            item.setUpdatedAt(now);
            inMemory.put(item.getId(), item);
            return item;
        }
        ensureTable();
        try (Connection conn = dataSource.getConnection()) {
            Long id = parseLong(item.getId());
            Instant now = Instant.now();
            if (id == null) {
                try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO system_code_table_items(table_code, item_code, item_label, description, sort_order, active, created_at, updated_at) "
                    + "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS)) {
                    ps.setString(1, item.getTableCode());
                    ps.setString(2, item.getItemCode());
                    ps.setString(3, item.getItemLabel());
                    ps.setString(4, item.getDescription());
                    ps.setInt(5, item.getSortOrder());
                    ps.setBoolean(6, item.isActive());
                    ps.setTimestamp(7, Timestamp.from(item.getCreatedAt() == null ? now : item.getCreatedAt()));
                    ps.setTimestamp(8, Timestamp.from(now));
                    ps.executeUpdate();
                    try (ResultSet keys = ps.getGeneratedKeys()) {
                        if (keys.next()) {
                            item.setId(String.valueOf(keys.getLong(1)));
                        }
                    }
                    item.setUpdatedAt(now);
                    return item;
                }
            }
            try (PreparedStatement ps = conn.prepareStatement(
                "UPDATE system_code_table_items SET table_code=?, item_code=?, item_label=?, description=?, sort_order=?, active=?, updated_at=? WHERE id=?")) {
                ps.setString(1, item.getTableCode());
                ps.setString(2, item.getItemCode());
                ps.setString(3, item.getItemLabel());
                ps.setString(4, item.getDescription());
                ps.setInt(5, item.getSortOrder());
                ps.setBoolean(6, item.isActive());
                ps.setTimestamp(7, Timestamp.from(now));
                ps.setLong(8, id);
                ps.executeUpdate();
                item.setUpdatedAt(now);
                return item;
            }
        } catch (Exception ex) {
            throw new IOException("Failed to save code table item", ex);
        }
    }

    public void deleteById(String id) throws IOException {
        if (dataSource == null) {
            inMemory.remove(id);
            return;
        }
        ensureTable();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement("DELETE FROM system_code_table_items WHERE id = ?")) {
            ps.setLong(1, Long.parseLong(id));
            ps.executeUpdate();
        } catch (Exception ex) {
            throw new IOException("Failed to delete code table item", ex);
        }
    }

    private void ensureTable() throws IOException {
        try (Connection conn = dataSource.getConnection();
             Statement st = conn.createStatement()) {
            st.execute(
                "CREATE TABLE IF NOT EXISTS system_code_table_items ("
                + "id BIGINT PRIMARY KEY AUTO_INCREMENT,"
                + "table_code VARCHAR(64) NOT NULL,"
                + "item_code VARCHAR(64) NOT NULL,"
                + "item_label VARCHAR(160) NOT NULL,"
                + "description VARCHAR(255) NULL,"
                + "sort_order INT NOT NULL DEFAULT 0,"
                + "active BOOLEAN NOT NULL DEFAULT TRUE,"
                + "created_at TIMESTAMP NULL,"
                + "updated_at TIMESTAMP NULL,"
                + "UNIQUE KEY uq_code_table_item (table_code, item_code)"
                + ")"
            );
        } catch (Exception ex) {
            throw new IOException("Failed to ensure code table items table", ex);
        }
    }

    private CodeTableItem mapItem(ResultSet rs) throws Exception {
        CodeTableItem item = new CodeTableItem();
        item.setId(String.valueOf(rs.getLong("id")));
        item.setTableCode(rs.getString("table_code"));
        item.setItemCode(rs.getString("item_code"));
        item.setItemLabel(rs.getString("item_label"));
        item.setDescription(rs.getString("description"));
        item.setSortOrder(rs.getInt("sort_order"));
        item.setActive(rs.getBoolean("active"));
        Timestamp createdTs = rs.getTimestamp("created_at");
        if (createdTs != null) item.setCreatedAt(createdTs.toInstant());
        Timestamp updatedTs = rs.getTimestamp("updated_at");
        if (updatedTs != null) item.setUpdatedAt(updatedTs.toInstant());
        return item;
    }

    private Long parseLong(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
