package com.dms.audit.service;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;

import org.springframework.stereotype.Service;

import com.dms.audit.model.AuditLog;
import com.dms.audit.repository.AuditLogRepository;

@Service
public class AuditService {

    private final AuditLogRepository repository;
    private final Clock clock;

    public AuditService(AuditLogRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    public void record(String action, String documentId, String performedBy, String details) {
        AuditLog entry = new AuditLog(action, documentId, performedBy, details, Instant.now(clock));
        try {
            repository.save(entry);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to save audit log", ex);
        }
    }
}
