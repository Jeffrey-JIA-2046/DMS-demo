package com.dms.retention.service;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.dms.document.model.Document;
import com.dms.document.model.DocumentStatus;
import com.dms.document.repository.DocumentRepository;
import com.dms.retention.dto.RetentionRuleRequest;
import com.dms.retention.dto.RetentionRuleResponse;
import com.dms.retention.dto.RetentionSweepResponse;
import com.dms.retention.model.RetentionDateBasis;
import com.dms.retention.model.RetentionRule;
import com.dms.retention.repository.RetentionRuleRepository;
import com.dms.task.model.TaskPriority;
import com.dms.task.model.TaskStatus;
import com.dms.task.model.TaskType;
import com.dms.task.model.UserTask;
import com.dms.task.repository.UserTaskRepository;
import com.dms.user.model.AppUser;
import com.dms.user.repository.AppUserRepository;

@Service
public class RetentionManagementService {

    private static final Logger log = LoggerFactory.getLogger(RetentionManagementService.class);

    private final RetentionRuleRepository retentionRuleRepository;
    private final DocumentRepository documentRepository;
    private final UserTaskRepository userTaskRepository;
    private final AppUserRepository appUserRepository;
    private final Clock clock;

    public RetentionManagementService(
        RetentionRuleRepository retentionRuleRepository,
        DocumentRepository documentRepository,
        UserTaskRepository userTaskRepository,
        AppUserRepository appUserRepository,
        Clock clock
    ) {
        this.retentionRuleRepository = retentionRuleRepository;
        this.documentRepository = documentRepository;
        this.userTaskRepository = userTaskRepository;
        this.appUserRepository = appUserRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<RetentionRuleResponse> listRules() {
        try {
            return retentionRuleRepository.findAll().stream()
                .sorted(Comparator.comparing(RetentionRule::getCategory, String.CASE_INSENSITIVE_ORDER))
                .map(this::toResponse)
                .toList();
        } catch (IOException ex) {
            throw new RuntimeException("Failed to read retention rules", ex);
        }
    }

    @Transactional(readOnly = true)
    public List<String> listDocumentCategories() {
        try {
            return documentRepository.findAll().stream()
                .map(Document::getCategory)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .sorted(String.CASE_INSENSITIVE_ORDER)
                .toList();
        } catch (IOException ex) {
            throw new RuntimeException("Failed to read categories", ex);
        }
    }

    @Transactional
    public RetentionRuleResponse createRule(RetentionRuleRequest request) {
        validateRequest(request);
        RetentionRule rule = new RetentionRule();
        Instant now = Instant.now(clock);
        rule.setCategory(request.category().trim());
        rule.setDateBasis(request.dateBasis());
        rule.setYearsToRetain(request.yearsToRetain());
        rule.setActive(request.active() == null ? true : request.active());
        rule.setCreatedAt(now);
        rule.setUpdatedAt(now);
        return persistRule(rule);
    }

    @Transactional
    public RetentionRuleResponse updateRule(String id, RetentionRuleRequest request) {
        validateRequest(request);
        try {
            RetentionRule current = retentionRuleRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Retention rule not found"));
            current.setCategory(request.category().trim());
            current.setDateBasis(request.dateBasis());
            current.setYearsToRetain(request.yearsToRetain());
            current.setActive(request.active() == null ? true : request.active());
            current.setUpdatedAt(Instant.now(clock));
            return persistRule(current);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to update retention rule", ex);
        }
    }

    @Transactional
    public void deleteRule(String id) {
        try {
            retentionRuleRepository.deleteById(id);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to delete retention rule", ex);
        }
    }

    @Transactional
    public RetentionSweepResponse runDisposalSweep() {
        return executeRetentionSweep();
    }

    private RetentionSweepResponse executeRetentionSweep() {
        List<RetentionRule> rules;
        List<Document> allDocuments;
        try {
            rules = retentionRuleRepository.findAll().stream().filter(RetentionRule::isActive).toList();
            if (rules.isEmpty()) {
                return new RetentionSweepResponse(0, 0);
            }
            allDocuments = documentRepository.findAll();
        } catch (IOException ex) {
            throw new RuntimeException("Failed to execute retention sweep", ex);
        }

        LocalDate today = LocalDate.now(clock.withZone(ZoneOffset.UTC));
        int scanned = 0;
        int disposed = 0;

        for (Document document : allDocuments) {
            if (document == null || !StringUtils.hasText(document.getCategory())) {
                continue;
            }
            RetentionRule matchingRule = rules.stream()
                .filter(rule -> rule.getCategory().equalsIgnoreCase(document.getCategory()))
                .findFirst()
                .orElse(null);
            if (matchingRule == null) {
                continue;
            }

            scanned++;
            LocalDate disposalDate = calculateDisposalDate(document, matchingRule);
            if (disposalDate == null || disposalDate.isAfter(today)) {
                continue;
            }

            try {
                upsertRetentionTask(document, disposalDate, matchingRule);
                disposed++;
            } catch (Exception ex) {
                log.warn("Failed to upsert retention task for document {} by retention rule {}", document.getId(), matchingRule.getId(), ex);
            }
        }

        return new RetentionSweepResponse(scanned, disposed);
    }

    private void upsertRetentionTask(Document document, LocalDate disposalDate, RetentionRule rule) throws IOException {
        if (document == null || !StringUtils.hasText(document.getId())) {
            return;
        }

        AppUser assignee = document.getSupervisor();
        if (assignee == null && StringUtils.hasText(document.getSupervisorId())) {
            assignee = appUserRepository.findById(document.getSupervisorId()).orElse(null);
        }
        if (assignee == null) {
            return;
        }

        UserTask task = userTaskRepository.findByDocumentIdAndTaskType(document.getId(), TaskType.RETENTION)
            .orElseGet(UserTask::new);

        task.setTitle("Retention due: \"" + document.getTitle() + "\"");
        task.setDescription("Retention date reached for category '" + safe(document.getCategory())
            + "'. Rule " + safe(rule.getId()) + " requires supervisor action.");
        task.setStatus(TaskStatus.PENDING);
        task.setPriority(TaskPriority.HIGH);
        task.setTaskType(TaskType.RETENTION);
        task.setWorkflowStep("Retention due - supervisor review");
        task.setDocumentId(document.getId());
        task.setDocumentTitle(document.getTitle());
        task.setDueDate(disposalDate);
        task.setAssignee(assignee);

        Instant now = Instant.now(clock);
        if (task.getCreatedAt() == null) {
            task.setCreatedAt(now);
        }
        task.setUpdatedAt(now);
        userTaskRepository.save(task);
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }

    private LocalDate calculateDisposalDate(Document document, RetentionRule rule) {
        LocalDate baseDate = resolveBaseDate(document, rule.getDateBasis());
        if (baseDate == null) {
            return null;
        }
        return baseDate.plusYears(rule.getYearsToRetain());
    }

    private LocalDate resolveBaseDate(Document document, RetentionDateBasis basis) {
        if (basis == RetentionDateBasis.APPROVAL_DATE) {
            return document.getApprovalDecidedAt() == null ? null : document.getApprovalDecidedAt().atZone(ZoneOffset.UTC).toLocalDate();
        }

        String metadataArchiveDate = document.getMetadataValues() == null ? null : document.getMetadataValues().get("archiveDate");
        if (StringUtils.hasText(metadataArchiveDate)) {
            try {
                return LocalDate.parse(metadataArchiveDate.trim());
            } catch (DateTimeParseException ignore) {
                // fall through to status/update fallback
            }
        }

        if (document.getStatus() == DocumentStatus.ARCHIVED && document.getUpdatedAt() != null) {
            return document.getUpdatedAt().atZone(ZoneOffset.UTC).toLocalDate();
        }
        return null;
    }

    private void validateRequest(RetentionRuleRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Retention rule payload is required");
        }
        if (!StringUtils.hasText(request.category())) {
            throw new IllegalArgumentException("Category is required");
        }
        if (request.dateBasis() == null) {
            throw new IllegalArgumentException("Date basis is required");
        }
        if (request.yearsToRetain() < 1) {
            throw new IllegalArgumentException("Years to retain must be at least 1");
        }
    }

    private RetentionRuleResponse persistRule(RetentionRule rule) {
        try {
            RetentionRule saved = retentionRuleRepository.save(rule);
            return toResponse(saved);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to save retention rule", ex);
        }
    }

    private RetentionRuleResponse toResponse(RetentionRule rule) {
        return new RetentionRuleResponse(
            rule.getId(),
            rule.getCategory(),
            rule.getDateBasis(),
            rule.getYearsToRetain(),
            rule.isActive(),
            rule.getCreatedAt(),
            rule.getUpdatedAt()
        );
    }
}
