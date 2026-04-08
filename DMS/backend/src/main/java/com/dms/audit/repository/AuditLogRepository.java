package com.dms.audit.repository;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;

import com.dms.audit.model.AuditLog;
import com.dms.repository.BaseOpenSearchRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opensearch.client.opensearch.OpenSearchClient;

import javax.sql.DataSource;

@Repository
public class AuditLogRepository extends BaseOpenSearchRepository<AuditLog> {

    @Value("${app.opensearch.audit-index:dms-audit-logs}")
    private String auditIndex;

    @Value("${app.opensearch.enabled:false}")
    private boolean openSearchEnabled;

    @Autowired(required = false)
    private DataSource dataSource;

    @Autowired
    public AuditLogRepository(OpenSearchClient openSearchClient, ObjectMapper objectMapper) {
        super(openSearchClient, objectMapper, AuditLog.class);
    }

    @Override
    protected String getIndexName() {
        return auditIndex;
    }

    /**
     * Find audit logs by action.
     */
    public List<AuditLog> findByAction(String action) throws IOException {
        return findAll().stream()
            .filter(log -> action.equals(log.getAction()))
            .toList();
    }

    /**
     * Find audit logs by document ID.
     */
    public List<AuditLog> findByDocumentId(String documentId) throws IOException {
        return findAll().stream()
            .filter(log -> documentId.equals(log.getDocumentId()))
            .toList();
    }

    /**
     * Find audit logs by performed by (username).
     */
    public List<AuditLog> findByPerformedBy(String username) throws IOException {
        return findAll().stream()
            .filter(log -> username.equals(log.getPerformedBy()))
            .toList();
    }

    @Override
    public AuditLog save(AuditLog entity) throws IOException {
        if (!openSearchEnabled && dataSource != null) {
            return saveToMysql(entity);
        }
        if (openSearchEnabled) {
            try {
                return super.save(entity);
            } catch (Exception ex) {
                if (dataSource == null) {
                    throw ex instanceof IOException io ? io : new IOException("Failed to save audit log into OpenSearch", ex);
                }
                return saveToMysql(entity);
            }
        }
        if (dataSource != null) {
            return saveToMysql(entity);
        }
        return super.save(entity);
    }

    @Override
    public List<AuditLog> findAll() throws IOException {
        if (!openSearchEnabled && dataSource != null) {
            return findAllFromMysql();
        }
        if (openSearchEnabled) {
            try {
                return super.findAll();
            } catch (Exception ex) {
                if (dataSource == null) {
                    throw ex instanceof IOException io ? io : new IOException("Failed to read audit logs from OpenSearch", ex);
                }
                return findAllFromMysql();
            }
        }
        if (dataSource != null) {
            return findAllFromMysql();
        }
        return super.findAll();
    }

    /**
     * Find audit logs with pagination.
     */
    public Page<AuditLog> findAll(Pageable pageable) throws IOException {
        if (!openSearchEnabled && dataSource != null) {
            List<AuditLog> all = findAllFromMysql();
            int from = Math.min((int) pageable.getOffset(), all.size());
            int to = Math.min(from + pageable.getPageSize(), all.size());
            return new PageImpl<>(all.subList(from, to), pageable, all.size());
        }
        return super.findAll(pageable);
    }

    private AuditLog saveToMysql(AuditLog entity) throws IOException {
        String createdBy = entity.getPerformedBy() == null ? "system" : entity.getPerformedBy();
        Instant createdAt = entity.getCreatedAt() == null ? Instant.now() : entity.getCreatedAt();
        try (Connection conn = dataSource.getConnection()) {
            if (entity.getId() == null || entity.getId().isBlank()) {
                try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO audit_logs(action, document_id, performed_by, details, created_at) VALUES (?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS)) {
                    ps.setString(1, entity.getAction());
                    ps.setString(2, entity.getDocumentId());
                    ps.setString(3, createdBy);
                    ps.setString(4, entity.getDetails());
                    ps.setTimestamp(5, Timestamp.from(createdAt));
                    ps.executeUpdate();
                    try (ResultSet keys = ps.getGeneratedKeys()) {
                        if (keys.next()) {
                            entity.setId(String.valueOf(keys.getObject(1)));
                        }
                    }
                }
            } else {
                try (PreparedStatement ps = conn.prepareStatement(
                    "UPDATE audit_logs SET action=?, document_id=?, performed_by=?, details=?, created_at=? WHERE id=?")) {
                    ps.setString(1, entity.getAction());
                    ps.setString(2, entity.getDocumentId());
                    ps.setString(3, createdBy);
                    ps.setString(4, entity.getDetails());
                    ps.setTimestamp(5, Timestamp.from(createdAt));
                    ps.setString(6, entity.getId());
                    ps.executeUpdate();
                }
            }
            entity.setPerformedBy(createdBy);
            entity.setCreatedAt(createdAt);
            return entity;
        } catch (Exception ex) {
            throw new IOException("Failed to save audit log into MySQL", ex);
        }
    }

    private List<AuditLog> findAllFromMysql() throws IOException {
        List<AuditLog> logs = new ArrayList<>();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT id, action, document_id, performed_by, details, created_at FROM audit_logs ORDER BY created_at DESC");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                logs.add(mapAuditLog(rs));
            }
            return logs;
        } catch (Exception ex) {
            throw new IOException("Failed to read audit logs from MySQL", ex);
        }
    }

    private AuditLog mapAuditLog(ResultSet rs) throws Exception {
        AuditLog log = new AuditLog();
        Object id = rs.getObject("id");
        log.setId(id == null ? null : String.valueOf(id));
        log.setAction(rs.getString("action"));
        log.setDocumentId(rs.getString("document_id"));
        log.setPerformedBy(rs.getString("performed_by"));
        log.setDetails(rs.getString("details"));
        Timestamp createdAt = rs.getTimestamp("created_at");
        log.setCreatedAt(createdAt == null ? null : createdAt.toInstant());
        return log;
    }
}
