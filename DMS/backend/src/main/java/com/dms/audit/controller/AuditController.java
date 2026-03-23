package com.dms.audit.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.dms.audit.model.AuditLog;
import com.dms.audit.repository.AuditLogRepository;

@RestController
@RequestMapping("/api/audit")
public class AuditController {

    private final AuditLogRepository repository;

    public AuditController(AuditLogRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    @PreAuthorize("hasRole('SYS_ADMIN')")
    public List<AuditLog> list(@RequestParam(value = "limit", required = false, defaultValue = "50") int limit) {
        // TODO: Implement with OpenSearch query
        return List.of();
    }
}
