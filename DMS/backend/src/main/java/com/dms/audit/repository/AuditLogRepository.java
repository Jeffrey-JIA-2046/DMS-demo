package com.dms.audit.repository;

import java.io.IOException;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;

import com.dms.audit.model.AuditLog;
import com.dms.repository.BaseOpenSearchRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opensearch.client.opensearch.OpenSearchClient;

@Repository
public class AuditLogRepository extends BaseOpenSearchRepository<AuditLog> {

    @Value("${app.opensearch.audit-index:dms-audit-logs}")
    private String auditIndex;

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

    /**
     * Find audit logs with pagination.
     */
    public Page<AuditLog> findAll(Pageable pageable) throws IOException {
        return super.findAll(pageable);
    }
}
