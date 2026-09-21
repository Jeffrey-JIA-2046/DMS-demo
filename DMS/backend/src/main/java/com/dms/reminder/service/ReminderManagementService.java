package com.dms.reminder.service;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.Comparator;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.dms.document.model.Document;
import com.dms.document.repository.DocumentRepository;
import com.dms.reminder.dto.ReminderRuleRequest;
import com.dms.reminder.dto.ReminderRuleResponse;
import com.dms.reminder.dto.ReminderSweepResponse;
import com.dms.reminder.model.ReminderDateColumn;
import com.dms.reminder.model.ReminderOffsetDirection;
import com.dms.reminder.model.ReminderOffsetUnit;
import com.dms.reminder.model.ReminderRule;
import com.dms.reminder.repository.ReminderRuleRepository;
import com.dms.task.model.TaskPriority;
import com.dms.task.model.TaskStatus;
import com.dms.task.model.TaskType;
import com.dms.task.model.UserTask;
import com.dms.task.repository.UserTaskRepository;
import com.dms.user.model.AppUser;
import com.dms.user.repository.AppUserRepository;

@Service
public class ReminderManagementService {

    private static final Logger log = LoggerFactory.getLogger(ReminderManagementService.class);

    private final ReminderRuleRepository reminderRuleRepository;
    private final DocumentRepository documentRepository;
    private final UserTaskRepository userTaskRepository;
    private final AppUserRepository appUserRepository;
    private final Clock clock;

    public ReminderManagementService(
        ReminderRuleRepository reminderRuleRepository,
        DocumentRepository documentRepository,
        UserTaskRepository userTaskRepository,
        AppUserRepository appUserRepository,
        Clock clock
    ) {
        this.reminderRuleRepository = reminderRuleRepository;
        this.documentRepository = documentRepository;
        this.userTaskRepository = userTaskRepository;
        this.appUserRepository = appUserRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<ReminderRuleResponse> listRules() {
        try {
            return reminderRuleRepository.findAll().stream()
                .sorted(Comparator.comparing(ReminderRule::getCategory, String.CASE_INSENSITIVE_ORDER))
                .map(this::toResponse)
                .toList();
        } catch (IOException ex) {
            throw new RuntimeException("Failed to read reminder rules", ex);
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
    public ReminderRuleResponse createRule(ReminderRuleRequest request) {
        validateRequest(request);
        ReminderRule rule = new ReminderRule();
        Instant now = Instant.now(clock);
        rule.setCategory(request.category().trim());
        rule.setDateColumn(request.dateColumn());
        rule.setDirection(request.direction());
        rule.setOffsetValue(request.offsetValue());
        rule.setOffsetUnit(request.offsetUnit());
        rule.setActive(request.active() == null ? true : request.active());
        rule.setCreatedAt(now);
        rule.setUpdatedAt(now);
        return persistRule(rule);
    }

    @Transactional
    public ReminderRuleResponse updateRule(String id, ReminderRuleRequest request) {
        validateRequest(request);
        try {
            ReminderRule current = reminderRuleRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Reminder rule not found"));
            current.setCategory(request.category().trim());
            current.setDateColumn(request.dateColumn());
            current.setDirection(request.direction());
            current.setOffsetValue(request.offsetValue());
            current.setOffsetUnit(request.offsetUnit());
            current.setActive(request.active() == null ? true : request.active());
            current.setUpdatedAt(Instant.now(clock));
            return persistRule(current);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to update reminder rule", ex);
        }
    }

    @Transactional
    public void deleteRule(String id) {
        try {
            reminderRuleRepository.deleteById(id);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to delete reminder rule", ex);
        }
    }

    @Transactional
    public ReminderSweepResponse runReminderSweep() {
        return executeReminderSweep();
    }

    private ReminderSweepResponse executeReminderSweep() {
        List<ReminderRule> rules;
        List<Document> documents;
        try {
            rules = reminderRuleRepository.findAll().stream().filter(ReminderRule::isActive).toList();
            if (rules.isEmpty()) {
                return new ReminderSweepResponse(0, 0);
            }
            documents = documentRepository.findAll();
        } catch (IOException ex) {
            throw new RuntimeException("Failed to execute reminder sweep", ex);
        }

        int scanned = 0;
        int taskUpdates = 0;

        for (Document document : documents) {
            if (document == null || !StringUtils.hasText(document.getCategory())) {
                continue;
            }
            ReminderRule rule = rules.stream()
                .filter(it -> it.getCategory().equalsIgnoreCase(document.getCategory()))
                .findFirst()
                .orElse(null);
            if (rule == null) {
                continue;
            }

            scanned++;
            LocalDate baseDate = resolveBaseDate(document, rule.getDateColumn());
            if (baseDate == null) {
                continue;
            }
            LocalDate reminderDate = calculateReminderDate(baseDate, rule);
            if (reminderDate == null) {
                continue;
            }

            try {
                upsertReminderTask(document, reminderDate, rule);
                updateDocumentReminderDate(document, reminderDate);
                taskUpdates++;
            } catch (Exception ex) {
                log.warn("Failed to upsert reminder task for document {}", document.getId(), ex);
            }
        }

        return new ReminderSweepResponse(scanned, taskUpdates);
    }

    private void upsertReminderTask(Document document, LocalDate reminderDate, ReminderRule rule) throws IOException {
        AppUser assignee = document.getSupervisor();
        if (assignee == null && StringUtils.hasText(document.getSupervisorId())) {
            assignee = appUserRepository.findById(document.getSupervisorId()).orElse(null);
        }
        if (assignee == null && StringUtils.hasText(document.getOwner())) {
            assignee = appUserRepository.findByUsernameIgnoreCaseWithFallback(document.getOwner()).orElse(null);
        }
        if (assignee == null) {
            return;
        }

        UserTask task = userTaskRepository.findByDocumentIdAndTaskType(document.getId(), TaskType.REMINDER)
            .orElseGet(UserTask::new);

        String label = rule.getDirection() == ReminderOffsetDirection.BEFORE ? "before" : "after";
        task.setTitle("Reminder: " + document.getTitle());
        task.setDescription("Category reminder rule: " + rule.getOffsetValue() + " " + rule.getOffsetUnit().name().toLowerCase() + " " + label + " " + rule.getDateColumn().name().toLowerCase());
        task.setStatus(TaskStatus.PENDING);
        task.setPriority(TaskPriority.NORMAL);
        task.setTaskType(TaskType.REMINDER);
        task.setWorkflowStep("Date reminder");
        task.setDocumentId(document.getId());
        task.setDocumentTitle(document.getTitle());
        task.setDueDate(reminderDate);
        task.setAssignee(assignee);
        Instant now = Instant.now(clock);
        if (task.getCreatedAt() == null) {
            task.setCreatedAt(now);
        }
        task.setUpdatedAt(now);
        userTaskRepository.save(task);
    }

    private void updateDocumentReminderDate(Document document, LocalDate reminderDate) throws IOException {
        String current = document.getMetadataValues() == null ? null : document.getMetadataValues().get("reminderDate");
        String next = reminderDate.toString();
        if (next.equals(current)) {
            return;
        }
        if (document.getMetadataValues() != null) {
            document.getMetadataValues().put("reminderDate", next);
        }
        document.setUpdatedAt(Instant.now(clock));
        documentRepository.save(document);
    }

    private LocalDate calculateReminderDate(LocalDate baseDate, ReminderRule rule) {
        LocalDate shifted;
        ReminderOffsetUnit unit = rule.getOffsetUnit();
        int amount = rule.getOffsetValue();
        if (rule.getDirection() == ReminderOffsetDirection.BEFORE) {
            shifted = shift(baseDate, unit, -amount);
        } else {
            shifted = shift(baseDate, unit, amount);
        }
        return shifted;
    }

    private LocalDate shift(LocalDate value, ReminderOffsetUnit unit, int amount) {
        return switch (unit) {
            case DAYS -> value.plusDays(amount);
            case MONTHS -> value.plusMonths(amount);
            case YEARS -> value.plusYears(amount);
        };
    }

    private LocalDate resolveBaseDate(Document document, ReminderDateColumn column) {
        return switch (column) {
            case DOCUMENT_DATE -> parseMetadataDate(document, "documentDate");
            case APPROVAL_DATE -> document.getApprovalDecidedAt() == null ? null : document.getApprovalDecidedAt().atZone(ZoneOffset.UTC).toLocalDate();
            case EXPIRY_DATE -> parseMetadataDate(document, "expiryDate");
            case ARCHIVE_DATE -> parseMetadataDate(document, "archiveDate");
        };
    }

    private LocalDate parseMetadataDate(Document document, String key) {
        String raw = document.getMetadataValues() == null ? null : document.getMetadataValues().get(key);
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        try {
            return LocalDate.parse(raw.trim());
        } catch (DateTimeParseException ex) {
            return null;
        }
    }

    private void validateRequest(ReminderRuleRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Reminder rule payload is required");
        }
        if (!StringUtils.hasText(request.category())) {
            throw new IllegalArgumentException("Category is required");
        }
        if (request.dateColumn() == null) {
            throw new IllegalArgumentException("Date column is required");
        }
        if (request.direction() == null) {
            throw new IllegalArgumentException("Direction is required");
        }
        if (request.offsetValue() < 1) {
            throw new IllegalArgumentException("Offset value must be at least 1");
        }
        if (request.offsetUnit() == null) {
            throw new IllegalArgumentException("Offset unit is required");
        }
    }

    private ReminderRuleResponse persistRule(ReminderRule rule) {
        try {
            ReminderRule saved = reminderRuleRepository.save(rule);
            return toResponse(saved);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to save reminder rule", ex);
        }
    }

    private ReminderRuleResponse toResponse(ReminderRule rule) {
        return new ReminderRuleResponse(
            rule.getId(),
            rule.getCategory(),
            rule.getDateColumn(),
            rule.getDirection(),
            rule.getOffsetValue(),
            rule.getOffsetUnit(),
            rule.isActive(),
            rule.getCreatedAt(),
            rule.getUpdatedAt()
        );
    }
}
