package com.dms.audit.controller;

import java.io.IOException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.dms.audit.model.AuditLog;
import com.dms.audit.repository.AuditLogRepository;
import com.dms.document.dto.PageResponse;

@RestController
@RequestMapping("/api/audit")
public class AuditController {

    private final AuditLogRepository repository;

    public AuditController(AuditLogRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    @PreAuthorize("hasRole('SYS_ADMIN')")
    public PageResponse<AuditLog> list(
        @RequestParam(value = "page", required = false, defaultValue = "0") int page,
        @RequestParam(value = "size", required = false, defaultValue = "50") int size,
        @RequestParam(value = "action", required = false) String action,
        @RequestParam(value = "performer", required = false) String performer,
        @RequestParam(value = "startDate", required = false) String startDate,
        @RequestParam(value = "endDate", required = false) String endDate
    ) {
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), 5000);
        Instant start = parseStartDate(startDate);
        Instant endExclusive = parseEndDateExclusive(endDate);

        try {
            List<AuditLog> filtered = repository.findAll().stream()
                .filter(log -> log != null && log.getCreatedAt() != null)
                .toList();

            if (action != null && !action.isBlank()) {
                String wanted = action.trim().toLowerCase(Locale.ROOT);
                filtered = filtered.stream().filter(log -> log.getAction() != null && log.getAction().toLowerCase(Locale.ROOT).equals(wanted)).toList();
            }

            if (performer != null && !performer.isBlank()) {
                String wanted = performer.trim().toLowerCase(Locale.ROOT);
                filtered = filtered.stream().filter(log -> log.getPerformedBy() != null && log.getPerformedBy().toLowerCase(Locale.ROOT).contains(wanted)).toList();
            }

            if (start != null) {
                filtered = filtered.stream().filter(log -> !log.getCreatedAt().isBefore(start)).toList();
            }

            if (endExclusive != null) {
                filtered = filtered.stream().filter(log -> log.getCreatedAt().isBefore(endExclusive)).toList();
            }

            List<AuditLog> sorted = filtered.stream()
                .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                .toList();

            long totalElements = sorted.size();
            int from = Math.min(safePage * safeSize, sorted.size());
            int to = Math.min(from + safeSize, sorted.size());
            List<AuditLog> content = sorted.subList(from, to);
            int totalPages = safeSize == 0 ? 0 : (int) Math.ceil(totalElements / (double) safeSize);
            boolean last = safePage >= Math.max(totalPages - 1, 0);

            return new PageResponse<>(content, safePage, safeSize, totalElements, totalPages, last);
        } catch (IOException ex) {
            if (isIndexNotFound(ex)) {
                return new PageResponse<>(List.of(), safePage, safeSize, 0, 0, true);
            }
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to load audit logs", ex);
        }
    }

    private Instant parseStartDate(String startDate) {
        if (startDate == null || startDate.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(startDate.trim()).atStartOfDay().toInstant(ZoneOffset.UTC);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid startDate format. Use yyyy-MM-dd");
        }
    }

    private Instant parseEndDateExclusive(String endDate) {
        if (endDate == null || endDate.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(endDate.trim()).plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid endDate format. Use yyyy-MM-dd");
        }
    }

    private boolean isIndexNotFound(Exception ex) {
        String message = ex == null ? null : ex.getMessage();
        return message != null && message.contains("index_not_found_exception");
    }
}
