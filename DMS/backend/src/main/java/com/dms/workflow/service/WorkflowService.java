package com.dms.workflow.service;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Predicate;
import java.util.stream.Collectors;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.dms.audit.service.AuditService;
import com.dms.document.model.Document;
import com.dms.document.repository.DocumentRepository;
import com.dms.exception.ResourceNotFoundException;
import com.dms.security.Role;
import com.dms.user.model.AppUser;
import com.dms.user.repository.AppUserRepository;
import com.dms.workflow.dto.AutoActivityInfoResponse;
import com.dms.workflow.dto.WorkflowBindingRequest;
import com.dms.workflow.dto.WorkflowManualDecisionRequest;
import com.dms.workflow.dto.WorkflowTemplateUpsertRequest;
import com.dms.workflow.model.WorkflowActivity;
import com.dms.workflow.model.WorkflowActivityType;
import com.dms.workflow.model.WorkflowCategoryBinding;
import com.dms.workflow.model.WorkflowConnection;
import com.dms.workflow.model.WorkflowInstance;
import com.dms.workflow.model.WorkflowInstanceStatus;
import com.dms.workflow.model.WorkflowStepLog;
import com.dms.workflow.model.WorkflowStepStatus;
import com.dms.workflow.model.WorkflowTemplate;
import com.dms.workflow.model.WorkflowTemplateLifecycle;
import com.dms.workflow.repository.WorkflowRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class WorkflowService {

    private final WorkflowRepository workflowRepository;
    private final DocumentRepository documentRepository;
    private final AppUserRepository appUserRepository;
    private final List<AutoActivity> autoActivities;
    private final AuditService auditService;
    private final Clock clock;
    private final ObjectMapper objectMapper;

    public WorkflowService(
        WorkflowRepository workflowRepository,
        DocumentRepository documentRepository,
        AppUserRepository appUserRepository,
        List<AutoActivity> autoActivities,
        AuditService auditService,
        Clock clock,
        ObjectMapper objectMapper
    ) {
        this.workflowRepository = workflowRepository;
        this.documentRepository = documentRepository;
        this.appUserRepository = appUserRepository;
        this.autoActivities = autoActivities;
        this.auditService = auditService;
        this.clock = clock;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public List<WorkflowTemplate> listTemplates() {
        try {
            return workflowRepository.findAllTemplates().stream()
                .sorted(Comparator.comparing(WorkflowTemplate::getUpdatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
        } catch (IOException ex) {
            throw new RuntimeException("Failed to list workflow templates", ex);
        }
    }

    @Transactional(readOnly = true)
    public WorkflowTemplate getTemplate(String id) {
        try {
            return workflowRepository.findTemplateById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Workflow template not found"));
        } catch (IOException ex) {
            throw new RuntimeException("Failed to get workflow template", ex);
        }
    }

    @Transactional
    public WorkflowTemplate createTemplate(WorkflowTemplateUpsertRequest request, String actor) {
        validateTemplateRequest(request);
        Instant now = Instant.now(clock);
        WorkflowTemplate template = new WorkflowTemplate();
        template.setId(UUID.randomUUID().toString());
        template.setTemplateGroupId(template.getId());
        template.setName(request.name().trim());
        template.setDescription(trimOrNull(request.description()));
        template.setPublished(false);
        template.setLifecycleStatus(WorkflowTemplateLifecycle.DRAFT);
        template.setVersionNumber(0);
        template.setBasedOnTemplateId(null);
        template.setCreatedBy(actor);
        template.setCreatedAt(now);
        template.setUpdatedAt(now);
        template.setActivities(normalizeActivities(request.activities()));
        template.setConnections(normalizeConnections(request.connections()));
        ensureBoundaryActivities(template);
        validateTemplateStructureForDraft(template);
        return persistTemplate(template);
    }

    @Transactional
    public WorkflowTemplate updateTemplate(String templateId, WorkflowTemplateUpsertRequest request, String actor) {
        validateTemplateRequest(request);
        WorkflowTemplate current = getTemplate(templateId);
        if (current.getLifecycleStatus() == WorkflowTemplateLifecycle.PUBLISHED) {
            throw new IllegalArgumentException("Published workflow versions are immutable. Create a draft branch to edit.");
        }
        current.setName(request.name().trim());
        current.setDescription(trimOrNull(request.description()));
        current.setActivities(normalizeActivities(request.activities()));
        current.setConnections(normalizeConnections(request.connections()));
        current.setLifecycleStatus(WorkflowTemplateLifecycle.DRAFT);
        current.setPublished(false);
        current.setPublishedAt(null);
        current.setUpdatedAt(Instant.now(clock));
        ensureBoundaryActivities(current);
        validateTemplateStructureForDraft(current);
        auditService.record("WORKFLOW_TEMPLATE_UPDATE", templateId, actor, "updated workflow template");
        return persistTemplate(current);
    }

    @Transactional
    public WorkflowTemplate publishTemplate(String templateId, String actor) {
        WorkflowTemplate draft = getTemplate(templateId);
        if (draft.getLifecycleStatus() == WorkflowTemplateLifecycle.PUBLISHED) {
            throw new IllegalArgumentException("This template is already a published immutable version");
        }

        validateTemplateForPublish(draft);
        Instant now = Instant.now(clock);

        String groupId = StringUtils.hasText(draft.getTemplateGroupId()) ? draft.getTemplateGroupId() : draft.getId();
        int nextVersion = listTemplates().stream()
            .filter(template -> Objects.equals(groupId, template.getTemplateGroupId()))
            .filter(template -> template.getLifecycleStatus() == WorkflowTemplateLifecycle.PUBLISHED)
            .mapToInt(WorkflowTemplate::getVersionNumber)
            .max()
            .orElse(0) + 1;

        WorkflowTemplate published = deepCopyTemplate(draft);
        published.setId(UUID.randomUUID().toString());
        published.setTemplateGroupId(groupId);
        published.setVersionNumber(nextVersion);
        published.setLifecycleStatus(WorkflowTemplateLifecycle.PUBLISHED);
        published.setBasedOnTemplateId(draft.getId());
        published.setPublished(true);
        published.setPublishedAt(now);
        published.setCreatedBy(actorOrSystem(actor));
        published.setCreatedAt(now);
        published.setUpdatedAt(now);
        published.setActivities(normalizeActivities(published.getActivities()));
        published.setConnections(normalizeConnections(published.getConnections()));
        persistTemplate(published);

        draft.setTemplateGroupId(groupId);
        draft.setBasedOnTemplateId(published.getId());
        draft.setLifecycleStatus(WorkflowTemplateLifecycle.DRAFT);
        draft.setPublished(false);
        draft.setPublishedAt(null);
        draft.setUpdatedAt(now);
        persistTemplate(draft);

        auditService.record("WORKFLOW_TEMPLATE_PUBLISH", published.getId(), actor, "published workflow template version " + nextVersion);
        return published;
    }

    @Transactional
    public WorkflowTemplate branchTemplateFromPublished(String templateId, String actor) {
        WorkflowTemplate published = getTemplate(templateId);
        if (published.getLifecycleStatus() != WorkflowTemplateLifecycle.PUBLISHED) {
            throw new IllegalArgumentException("Branching is only supported from published workflow versions");
        }

        Instant now = Instant.now(clock);
        WorkflowTemplate draft = deepCopyTemplate(published);
        draft.setId(UUID.randomUUID().toString());
        draft.setPublished(false);
        draft.setPublishedAt(null);
        draft.setLifecycleStatus(WorkflowTemplateLifecycle.DRAFT);
        draft.setBasedOnTemplateId(published.getId());
        draft.setCreatedBy(actorOrSystem(actor));
        draft.setCreatedAt(now);
        draft.setUpdatedAt(now);
        draft.setActivities(normalizeActivities(draft.getActivities()));
        draft.setConnections(normalizeConnections(draft.getConnections()));

        WorkflowTemplate saved = persistTemplate(draft);
        auditService.record("WORKFLOW_TEMPLATE_BRANCH", saved.getId(), actor, "created draft branch from published template " + published.getId());
        return saved;
    }

    @Transactional(readOnly = true)
    public List<String> listDocumentCategories() {
        try {
            List<String> fromDocs = documentRepository.findAll().stream()
                .map(Document::getCategory)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .toList();
            List<String> fromBindings = workflowRepository.findAllBindings().stream()
                .map(WorkflowCategoryBinding::getCategory)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .toList();
            return java.util.stream.Stream.concat(fromDocs.stream(), fromBindings.stream())
                .distinct()
                .sorted(String.CASE_INSENSITIVE_ORDER)
                .toList();
        } catch (IOException ex) {
            throw new RuntimeException("Failed to list categories", ex);
        }
    }

    @Transactional(readOnly = true)
    public List<WorkflowCategoryBinding> listBindings() {
        try {
            return workflowRepository.findAllBindings();
        } catch (IOException ex) {
            throw new RuntimeException("Failed to list workflow bindings", ex);
        }
    }

    @Transactional
    public WorkflowCategoryBinding upsertBinding(WorkflowBindingRequest request, String actor) {
        if (request == null || !StringUtils.hasText(request.category()) || !StringUtils.hasText(request.templateId())) {
            throw new IllegalArgumentException("Category and template are required");
        }

        WorkflowTemplate template = getTemplate(request.templateId().trim());
        if (!template.isPublished()) {
            throw new IllegalArgumentException("Only published templates can be bound to categories");
        }

        try {
            List<WorkflowCategoryBinding> all = workflowRepository.findAllBindings();
            WorkflowCategoryBinding existing = all.stream()
                .filter(binding -> binding.getCategory() != null && binding.getCategory().equalsIgnoreCase(request.category().trim()))
                .findFirst()
                .orElse(null);

            WorkflowCategoryBinding binding = existing != null ? existing : new WorkflowCategoryBinding();
            Instant now = Instant.now(clock);
            if (binding.getCreatedAt() == null) {
                binding.setCreatedAt(now);
            }
            binding.setUpdatedAt(now);
            binding.setCategory(request.category().trim());
            binding.setTemplateId(template.getId());
            binding.setActive(request.active() == null ? true : request.active());

            WorkflowCategoryBinding saved = workflowRepository.saveBinding(binding);
            auditService.record("WORKFLOW_BINDING_UPSERT", null, actor,
                "bound category " + saved.getCategory() + " to template " + saved.getTemplateId());
            return saved;
        } catch (IOException ex) {
            throw new RuntimeException("Failed to save workflow binding", ex);
        }
    }

    @Transactional
    public void deleteBinding(String bindingId, String actor) {
        try {
            workflowRepository.deleteBinding(bindingId);
            auditService.record("WORKFLOW_BINDING_DELETE", null, actor, "deleted workflow binding " + bindingId);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to delete workflow binding", ex);
        }
    }

    @Transactional
    public void startWorkflowForDocument(Document document, String actor) {
        if (document == null || !StringUtils.hasText(document.getId()) || !StringUtils.hasText(document.getCategory())) {
            return;
        }

        try {
            Optional<WorkflowCategoryBinding> bindingOpt = workflowRepository.findActiveBindingByCategory(document.getCategory());
            if (bindingOpt.isEmpty()) {
                return;
            }
            WorkflowCategoryBinding binding = bindingOpt.get();
            WorkflowTemplate template = workflowRepository.findTemplateById(binding.getTemplateId())
                .orElse(null);
            if (template == null || !template.isPublished()) {
                return;
            }

            WorkflowInstance instance = new WorkflowInstance();
            instance.setId(UUID.randomUUID().toString());
            instance.setDocumentId(document.getId());
            instance.setTemplateId(template.getId());
            instance.setTemplateName(template.getName());
            instance.setStatus(WorkflowInstanceStatus.RUNNING);
            instance.setStartedAt(Instant.now(clock));
            instance.setSteps(new ArrayList<>());

            executeInstance(template, document, instance, findBeginActivity(template), actorOrSystem(actor));
            workflowRepository.saveInstance(instance);

            auditService.record("WORKFLOW_INSTANCE_CREATED", document.getId(), actorOrSystem(actor),
                "started workflow instance " + instance.getId() + " using template " + template.getName());
        } catch (IOException ex) {
            throw new RuntimeException("Failed to start workflow instance", ex);
        }
    }

    @Transactional(readOnly = true)
    public List<WorkflowInstance> listDocumentInstances(String documentId) {
        try {
            return workflowRepository.findInstancesByDocumentId(documentId);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to list workflow instances", ex);
        }
    }

    @Transactional
    public WorkflowInstance decideManualStep(String instanceId, WorkflowManualDecisionRequest request, String actor) {
        if (request == null || !StringUtils.hasText(request.decision())) {
            throw new IllegalArgumentException("Decision is required");
        }
        String normalizedDecision = request.decision().trim().toUpperCase(Locale.ROOT);
        if (!"APPROVE".equals(normalizedDecision) && !"REJECT".equals(normalizedDecision)) {
            throw new IllegalArgumentException("Decision must be APPROVE or REJECT");
        }

        try {
            WorkflowInstance instance = workflowRepository.findInstanceById(instanceId)
                .orElseThrow(() -> new ResourceNotFoundException("Workflow instance not found"));
            Document document = documentRepository.findById(instance.getDocumentId())
                .orElseThrow(() -> new ResourceNotFoundException("Document for workflow instance not found"));
            WorkflowTemplate template = workflowRepository.findTemplateById(instance.getTemplateId())
                .orElseThrow(() -> new ResourceNotFoundException("Workflow template not found"));

            if (instance.getStatus() != WorkflowInstanceStatus.RUNNING || !StringUtils.hasText(instance.getCurrentActivityId())) {
                throw new IllegalArgumentException("Workflow instance is not waiting for a manual decision");
            }

            WorkflowActivity current = findActivityById(template, instance.getCurrentActivityId())
                .orElseThrow(() -> new IllegalArgumentException("Current workflow activity no longer exists"));
            if (current.getType() != WorkflowActivityType.MANUAL) {
                throw new IllegalArgumentException("Current workflow activity is not a manual step");
            }

            AppUser actorUser = requireUser(actor);
            enforceManualAssignee(current, document, actorUser);

            WorkflowStepLog waitingStep = findLastStep(instance, step -> Objects.equals(step.getActivityId(), current.getId())
                && step.getStatus() == WorkflowStepStatus.WAITING_MANUAL)
                .orElseThrow(() -> new IllegalArgumentException("No pending manual step found"));

            Instant now = Instant.now(clock);
            waitingStep.setStatus(WorkflowStepStatus.COMPLETED);
            waitingStep.setFinishedAt(now);
            waitingStep.setActor(actorOrSystem(actor));
            waitingStep.setNote("Manual decision: " + normalizedDecision + appendNote(request.note()));

            boolean approved = "APPROVE".equals(normalizedDecision);
            String nextId = resolveNextActivityId(template, current, approved, null);

            if (!StringUtils.hasText(nextId)) {
                instance.setStatus(WorkflowInstanceStatus.COMPLETED);
                instance.setCurrentActivityId(null);
                instance.setEndedAt(now);
            } else {
                executeInstance(template, document, instance, findActivityById(template, nextId).orElse(null), actorOrSystem(actor));
            }

            workflowRepository.saveInstance(instance);
            auditService.record("WORKFLOW_MANUAL_DECISION", document.getId(), actorOrSystem(actor),
                "instance " + instanceId + " decision " + normalizedDecision);
            return instance;
        } catch (IOException ex) {
            throw new RuntimeException("Failed to process manual workflow decision", ex);
        }
    }

    @Transactional(readOnly = true)
    public List<AutoActivityInfoResponse> listAutoActivityClasses() {
        return autoActivities.stream()
            .map(activity -> new AutoActivityInfoResponse(activity.key(), activity.displayName(), activity.description()))
            .sorted(Comparator.comparing(AutoActivityInfoResponse::key, String.CASE_INSENSITIVE_ORDER))
            .toList();
    }

    @Transactional(readOnly = true)
    public AppUser requireWorkflowAdmin(String username) {
        AppUser user = requireUser(username);
        if (user.getRole() != Role.SYS_ADMIN && user.getRole() != Role.USER_ADMIN) {
            throw new AccessDeniedException("Workflow administration is restricted to system and user administrators");
        }
        return user;
    }

    @Transactional(readOnly = true)
    public AppUser requireSystemAdmin(String username) {
        AppUser user = requireUser(username);
        if (user.getRole() != Role.SYS_ADMIN) {
            throw new AccessDeniedException("Only system administrators can perform this action");
        }
        return user;
    }

    private void executeInstance(
        WorkflowTemplate template,
        Document document,
        WorkflowInstance instance,
        WorkflowActivity startActivity,
        String actor
    ) {
        if (startActivity == null) {
            instance.setStatus(WorkflowInstanceStatus.FAILED);
            instance.setEndedAt(Instant.now(clock));
            return;
        }

        Map<String, WorkflowActivity> activityById = template.getActivities().stream()
            .collect(Collectors.toMap(WorkflowActivity::getId, activity -> activity, (left, right) -> left, LinkedHashMap::new));

        WorkflowActivity current = startActivity;
        while (current != null) {
            Instant stepStart = Instant.now(clock);
            WorkflowStepLog step = new WorkflowStepLog();
            step.setId(UUID.randomUUID().toString());
            step.setActivityId(current.getId());
            step.setActivityName(current.getName());
            step.setActivityType(current.getType());
            step.setStartedAt(stepStart);
            step.setActor(actorOrSystem(actor));
            step.setStatus(WorkflowStepStatus.IN_PROGRESS);
            instance.getSteps().add(step);
            instance.setCurrentActivityId(current.getId());

            String nextId;
            switch (current.getType()) {
                case BEGIN -> {
                    step.setStatus(WorkflowStepStatus.COMPLETED);
                    step.setFinishedAt(Instant.now(clock));
                    step.setNote("Workflow started");
                    nextId = resolveNextActivityId(template, current, null, null);
                }
                case END -> {
                    step.setStatus(WorkflowStepStatus.COMPLETED);
                    step.setFinishedAt(Instant.now(clock));
                    step.setNote("Workflow completed");
                    instance.setStatus(WorkflowInstanceStatus.COMPLETED);
                    instance.setCurrentActivityId(null);
                    instance.setEndedAt(Instant.now(clock));
                    auditStep(document, step, actor);
                    return;
                }
                case CONDITION -> {
                    boolean matched = evaluateCondition(current, document);
                    step.setStatus(WorkflowStepStatus.COMPLETED);
                    step.setFinishedAt(Instant.now(clock));
                    step.setNote("Condition evaluated to " + matched);
                    nextId = resolveNextActivityId(template, current, matched, null);
                }
                case AUTO -> {
                    AutoActivityResult result = runAutoActivity(current, document, instance, actor);
                    if (result.success()) {
                        step.setStatus(WorkflowStepStatus.COMPLETED);
                        step.setNote(result.message());
                        step.setFinishedAt(Instant.now(clock));
                        nextId = resolveNextActivityId(template, current, null, null);
                    } else {
                        step.setStatus(WorkflowStepStatus.FAILED);
                        step.setNote(result.message());
                        step.setFinishedAt(Instant.now(clock));
                        instance.setStatus(WorkflowInstanceStatus.FAILED);
                        instance.setEndedAt(Instant.now(clock));
                        auditStep(document, step, actor);
                        return;
                    }
                }
                case MANUAL -> {
                    step.setStatus(WorkflowStepStatus.WAITING_MANUAL);
                    step.setFinishedAt(null);
                    step.setNote("Waiting for manual decision" + manualAssigneeDescription(current, document));
                    instance.setStatus(WorkflowInstanceStatus.RUNNING);
                    auditStep(document, step, actor);
                    return;
                }
                default -> {
                    step.setStatus(WorkflowStepStatus.FAILED);
                    step.setFinishedAt(Instant.now(clock));
                    step.setNote("Unsupported activity type");
                    instance.setStatus(WorkflowInstanceStatus.FAILED);
                    instance.setEndedAt(Instant.now(clock));
                    auditStep(document, step, actor);
                    return;
                }
            }

            auditStep(document, step, actor);
            if (!StringUtils.hasText(nextId)) {
                instance.setStatus(WorkflowInstanceStatus.COMPLETED);
                instance.setCurrentActivityId(null);
                instance.setEndedAt(Instant.now(clock));
                return;
            }
            current = activityById.get(nextId);
            if (current == null) {
                instance.setStatus(WorkflowInstanceStatus.FAILED);
                instance.setEndedAt(Instant.now(clock));
                return;
            }
        }
    }

    private void auditStep(Document document, WorkflowStepLog step, String actor) {
        String documentId = document != null ? document.getId() : null;
        String stepMessage = "step=" + step.getActivityName() + ", status=" + step.getStatus()
            + (StringUtils.hasText(step.getNote()) ? ", note=" + step.getNote() : "");
        auditService.record("WORKFLOW_STEP", documentId, actorOrSystem(actor), stepMessage);
    }

    private AutoActivityResult runAutoActivity(WorkflowActivity activity, Document document, WorkflowInstance instance, String actor) {
        String key = activity.getConfig() != null ? activity.getConfig().get("autoClass") : null;
        if (!StringUtils.hasText(key)) {
            return AutoActivityResult.failure("Auto activity requires config.autoClass");
        }

        Optional<AutoActivity> selected = autoActivities.stream()
            .filter(candidate -> key.equalsIgnoreCase(candidate.key()))
            .findFirst();
        if (selected.isEmpty()) {
            return AutoActivityResult.failure("Auto activity class not found: " + key);
        }

        try {
            return selected.get().execute(new AutoActivityContext(document, instance, activity, actorOrSystem(actor)));
        } catch (Exception ex) {
            return AutoActivityResult.failure("Auto activity failed: " + ex.getMessage());
        }
    }

    private String resolveNextActivityId(WorkflowTemplate template, WorkflowActivity current, Boolean boolResult, String textualResult) {
        List<WorkflowConnection> outgoing = template.getConnections().stream()
            .filter(connection -> Objects.equals(connection.getFromActivityId(), current.getId()))
            .toList();
        if (outgoing.isEmpty()) {
            return null;
        }

        if (current.getType() == WorkflowActivityType.CONDITION || current.getType() == WorkflowActivityType.MANUAL) {
            String expectedCase;
            if (boolResult != null) {
                expectedCase = boolResult ? "TRUE" : "FALSE";
            } else if (StringUtils.hasText(textualResult)) {
                expectedCase = textualResult.trim().toUpperCase(Locale.ROOT);
            } else {
                expectedCase = null;
            }

            if (expectedCase != null) {
                Optional<WorkflowConnection> match = outgoing.stream()
                    .filter(connection -> expectedCase.equalsIgnoreCase(trimOrNull(connection.getConditionCase())))
                    .findFirst();
                if (match.isPresent()) {
                    return match.get().getToActivityId();
                }
            }

            Optional<WorkflowConnection> fallback = outgoing.stream()
                .filter(connection -> "DEFAULT".equalsIgnoreCase(trimOrNull(connection.getConditionCase())))
                .findFirst();
            if (fallback.isPresent()) {
                return fallback.get().getToActivityId();
            }
        }

        return outgoing.get(0).getToActivityId();
    }

    private boolean evaluateCondition(WorkflowActivity activity, Document document) {
        Map<String, String> config = activity.getConfig();
        if (config == null || config.isEmpty() || document == null) {
            return false;
        }

        String groupedRulesJson = trimOrNull(config.get("rulesJson"));
        if (StringUtils.hasText(groupedRulesJson)) {
            List<ConditionGroup> groups = parseConditionGroups(groupedRulesJson);
            if (!groups.isEmpty()) {
                String groupLogic = trimOrNull(config.get("groupLogic"));
                return evaluateConditionGroups(groups, groupLogic, document);
            }
        }

        String operator = trimOrNull(config.get("operator"));
        String field = trimOrNull(config.get("field"));
        if (!StringUtils.hasText(operator) || !StringUtils.hasText(field)) {
            return false;
        }

        String left = extractMetadata(document, field);
        String rightField = trimOrNull(config.get("rightField"));
        String rightValue = trimOrNull(config.get("value"));

        ConditionRule simpleRule = new ConditionRule(field, operator, rightValue, rightField, false);
        return evaluateConditionRule(simpleRule, document);
    }

    private List<ConditionGroup> parseConditionGroups(String groupsJson) {
        try {
            return objectMapper.readValue(groupsJson, new TypeReference<List<ConditionGroup>>() {});
        } catch (Exception ex) {
            throw new IllegalArgumentException("Invalid condition group JSON in rulesJson");
        }
    }

    private boolean evaluateConditionGroups(List<ConditionGroup> groups, String groupLogic, Document document) {
        boolean anyOr = "OR".equalsIgnoreCase(groupLogic);
        boolean result = anyOr ? false : true;

        for (ConditionGroup group : groups) {
            boolean groupResult = evaluateConditionGroup(group, document);
            if (anyOr) {
                result = result || groupResult;
                if (result) {
                    return true;
                }
            } else {
                result = result && groupResult;
                if (!result) {
                    return false;
                }
            }
        }
        return result;
    }

    private boolean evaluateConditionGroup(ConditionGroup group, Document document) {
        List<ConditionRule> rules = group != null && group.rules() != null ? group.rules() : List.of();
        if (rules.isEmpty()) {
            return false;
        }

        boolean anyOr = group != null && "OR".equalsIgnoreCase(group.logic());
        boolean result = anyOr ? false : true;
        for (ConditionRule rule : rules) {
            boolean ruleResult = evaluateConditionRule(rule, document);
            if (anyOr) {
                result = result || ruleResult;
                if (result) {
                    return true;
                }
            } else {
                result = result && ruleResult;
                if (!result) {
                    return false;
                }
            }
        }
        return result;
    }

    private boolean evaluateConditionRule(ConditionRule rule, Document document) {
        if (rule == null || !StringUtils.hasText(rule.field()) || !StringUtils.hasText(rule.operator()) || document == null) {
            return false;
        }

        String left = extractMetadata(document, rule.field());
        String rightValue = trimOrNull(rule.value());
        String rightFieldValue = extractMetadata(document, trimOrNull(rule.rightField()));

        boolean matched = switch (rule.operator().trim().toUpperCase(Locale.ROOT)) {
            case "DATE_BEFORE_FIELD" -> compareDates(left, rightFieldValue, comparison -> comparison < 0);
            case "DATE_AFTER_FIELD" -> compareDates(left, rightFieldValue, comparison -> comparison > 0);
            case "DATE_BEFORE_VALUE" -> compareDates(left, rightValue, comparison -> comparison < 0);
            case "DATE_AFTER_VALUE" -> compareDates(left, rightValue, comparison -> comparison > 0);
            case "STRING_EQUALS" -> StringUtils.hasText(left) && StringUtils.hasText(rightValue)
                && left.trim().equalsIgnoreCase(rightValue.trim());
            case "STRING_CONTAINS" -> StringUtils.hasText(left) && StringUtils.hasText(rightValue)
                && left.toLowerCase(Locale.ROOT).contains(rightValue.toLowerCase(Locale.ROOT));
            case "NUMBER_GT" -> compareNumbers(left, rightValue, comparison -> comparison > 0);
            case "NUMBER_GTE" -> compareNumbers(left, rightValue, comparison -> comparison >= 0);
            case "NUMBER_LT" -> compareNumbers(left, rightValue, comparison -> comparison < 0);
            case "NUMBER_LTE" -> compareNumbers(left, rightValue, comparison -> comparison <= 0);
            default -> false;
        };

        return rule.negate() ? !matched : matched;
    }

    private boolean compareDates(String left, String right, Predicate<Integer> matcher) {
        if (!StringUtils.hasText(left) || !StringUtils.hasText(right)) {
            return false;
        }
        try {
            LocalDate leftDate = LocalDate.parse(left.trim());
            LocalDate rightDate = LocalDate.parse(right.trim());
            return matcher.test(leftDate.compareTo(rightDate));
        } catch (DateTimeParseException ex) {
            return false;
        }
    }

    private boolean compareNumbers(String left, String right, Predicate<Integer> matcher) {
        if (!StringUtils.hasText(left) || !StringUtils.hasText(right)) {
            return false;
        }
        try {
            BigDecimal leftNumber = new BigDecimal(left.trim());
            BigDecimal rightNumber = new BigDecimal(right.trim());
            return matcher.test(leftNumber.compareTo(rightNumber));
        } catch (NumberFormatException ex) {
            return false;
        }
    }

    private String extractMetadata(Document document, String key) {
        if (document == null || !StringUtils.hasText(key) || document.getMetadataValues() == null) {
            return null;
        }
        for (Map.Entry<String, String> entry : document.getMetadataValues().entrySet()) {
            if (entry.getKey() != null && entry.getKey().equalsIgnoreCase(key)) {
                return entry.getValue();
            }
        }
        return null;
    }

    private WorkflowTemplate persistTemplate(WorkflowTemplate template) {
        try {
            return workflowRepository.saveTemplate(template);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to save workflow template", ex);
        }
    }

    private Optional<WorkflowStepLog> findLastStep(WorkflowInstance instance, Predicate<WorkflowStepLog> matcher) {
        List<WorkflowStepLog> steps = instance.getSteps();
        if (steps == null || steps.isEmpty()) {
            return Optional.empty();
        }
        for (int index = steps.size() - 1; index >= 0; index--) {
            WorkflowStepLog step = steps.get(index);
            if (matcher.test(step)) {
                return Optional.of(step);
            }
        }
        return Optional.empty();
    }

    private Optional<WorkflowActivity> findActivityById(WorkflowTemplate template, String id) {
        if (template == null || template.getActivities() == null || !StringUtils.hasText(id)) {
            return Optional.empty();
        }
        return template.getActivities().stream()
            .filter(activity -> id.equals(activity.getId()))
            .findFirst();
    }

    private WorkflowActivity findBeginActivity(WorkflowTemplate template) {
        return template.getActivities().stream()
            .filter(activity -> activity.getType() == WorkflowActivityType.BEGIN)
            .findFirst()
            .orElse(null);
    }

    private void validateTemplateRequest(WorkflowTemplateUpsertRequest request) {
        if (request == null || !StringUtils.hasText(request.name())) {
            throw new IllegalArgumentException("Template name is required");
        }
    }

    private void validateTemplateForPublish(WorkflowTemplate template) {
        List<WorkflowActivity> activities = template.getActivities() != null ? template.getActivities() : List.of();
        List<WorkflowConnection> connections = template.getConnections() != null ? template.getConnections() : List.of();

        long beginCount = activities.stream().filter(activity -> activity.getType() == WorkflowActivityType.BEGIN).count();
        long endCount = activities.stream().filter(activity -> activity.getType() == WorkflowActivityType.END).count();

        if (beginCount != 1) {
            throw new IllegalArgumentException("Workflow template must contain exactly one Begin activity");
        }
        if (endCount != 1) {
            throw new IllegalArgumentException("Workflow template must contain exactly one End activity");
        }

        Map<String, WorkflowActivity> byId = activities.stream()
            .collect(Collectors.toMap(WorkflowActivity::getId, activity -> activity, (left, right) -> left));

        for (WorkflowConnection connection : connections) {
            if (!byId.containsKey(connection.getFromActivityId()) || !byId.containsKey(connection.getToActivityId())) {
                throw new IllegalArgumentException("Workflow connection refers to unknown activity");
            }
        }

        WorkflowActivity begin = activities.stream().filter(activity -> activity.getType() == WorkflowActivityType.BEGIN).findFirst().orElseThrow();
        if (connections.stream().noneMatch(connection -> Objects.equals(connection.getFromActivityId(), begin.getId()))) {
            throw new IllegalArgumentException("Begin activity must connect to the next activity");
        }

        for (WorkflowActivity activity : activities) {
            if (activity.getType() == WorkflowActivityType.CONDITION) {
                validateConditionConfiguration(activity);
            }
            if (activity.getType() == WorkflowActivityType.MANUAL) {
                validateManualAssigneeConfiguration(activity);
            }
        }
    }

    private void validateConditionConfiguration(WorkflowActivity activity) {
        Map<String, String> config = activity.getConfig() != null ? activity.getConfig() : Map.of();
        String rulesJson = trimOrNull(config.get("rulesJson"));
        if (StringUtils.hasText(rulesJson)) {
            List<ConditionGroup> groups = parseConditionGroups(rulesJson);
            if (groups.isEmpty()) {
                throw new IllegalArgumentException("Condition activity rulesJson cannot be empty");
            }
            for (ConditionGroup group : groups) {
                if (group == null || group.rules() == null || group.rules().isEmpty()) {
                    throw new IllegalArgumentException("Each condition group must contain at least one rule");
                }
                for (ConditionRule rule : group.rules()) {
                    if (rule == null || !StringUtils.hasText(rule.field()) || !StringUtils.hasText(rule.operator())) {
                        throw new IllegalArgumentException("Each condition rule requires field and operator");
                    }
                }
            }
            return;
        }

        String operator = trimOrNull(config.get("operator"));
        String field = trimOrNull(config.get("field"));
        if (!StringUtils.hasText(operator) || !StringUtils.hasText(field)) {
            throw new IllegalArgumentException("Condition activity requires either rulesJson or field/operator");
        }
    }

    private void validateManualAssigneeConfiguration(WorkflowActivity activity) {
        Map<String, String> config = activity.getConfig() != null ? activity.getConfig() : Map.of();
        String assigneeRole = trimOrNull(config.get("assigneeRole"));
        if (StringUtils.hasText(assigneeRole)) {
            parseRoleSet(assigneeRole);
        }
        String assigneeType = trimOrNull(config.get("assigneeType"));
        if (StringUtils.hasText(assigneeType)) {
            switch (assigneeType.toUpperCase(Locale.ROOT)) {
                case "DOCUMENT_APPROVER", "DOCUMENT_SUPERVISOR", "DOCUMENT_OWNER" -> {
                }
                default -> throw new IllegalArgumentException("Unsupported manual assignee type: " + assigneeType);
            }
        }
    }

    private void ensureBoundaryActivities(WorkflowTemplate template) {
        if (template.getActivities() == null) {
            template.setActivities(new ArrayList<>());
        }

        long beginCount = template.getActivities().stream()
            .filter(activity -> activity.getType() == WorkflowActivityType.BEGIN)
            .count();
        long endCount = template.getActivities().stream()
            .filter(activity -> activity.getType() == WorkflowActivityType.END)
            .count();

        if (beginCount == 0) {
            WorkflowActivity begin = new WorkflowActivity();
            begin.setId(UUID.randomUUID().toString());
            begin.setName("Begin");
            begin.setType(WorkflowActivityType.BEGIN);
            begin.setX(120);
            begin.setY(120);
            begin.setConfig(Map.of());
            template.getActivities().add(begin);
        } else if (beginCount > 1) {
            throw new IllegalArgumentException("Workflow template supports exactly one Begin activity");
        }

        if (endCount == 0) {
            WorkflowActivity end = new WorkflowActivity();
            end.setId(UUID.randomUUID().toString());
            end.setName("End");
            end.setType(WorkflowActivityType.END);
            end.setX(420);
            end.setY(120);
            end.setConfig(Map.of());
            template.getActivities().add(end);
        } else if (endCount > 1) {
            throw new IllegalArgumentException("Workflow template supports exactly one End activity");
        }
    }

    private void validateTemplateStructureForDraft(WorkflowTemplate template) {
        List<WorkflowActivity> activities = template.getActivities() != null ? template.getActivities() : List.of();
        long beginCount = activities.stream().filter(activity -> activity.getType() == WorkflowActivityType.BEGIN).count();
        long endCount = activities.stream().filter(activity -> activity.getType() == WorkflowActivityType.END).count();
        if (beginCount != 1) {
            throw new IllegalArgumentException("Workflow template must contain exactly one Begin activity");
        }
        if (endCount != 1) {
            throw new IllegalArgumentException("Workflow template must contain exactly one End activity");
        }
    }

    private List<WorkflowActivity> normalizeActivities(List<WorkflowActivity> activities) {
        if (activities == null || activities.isEmpty()) {
            return new ArrayList<>();
        }

        List<WorkflowActivity> normalized = new ArrayList<>();
        for (WorkflowActivity original : activities) {
            if (original == null) {
                continue;
            }
            WorkflowActivity activity = new WorkflowActivity();
            activity.setId(StringUtils.hasText(original.getId()) ? original.getId().trim() : UUID.randomUUID().toString());
            activity.setName(StringUtils.hasText(original.getName()) ? original.getName().trim() : defaultActivityName(original.getType()));
            activity.setType(original.getType() == null ? WorkflowActivityType.MANUAL : original.getType());
            activity.setX(original.getX());
            activity.setY(original.getY());
            activity.setConfig(normalizeActivityConfig(original.getConfig()));
            normalized.add(activity);
        }
        return normalized;
    }

    private Map<String, String> normalizeActivityConfig(Map<String, String> config) {
        Map<String, String> normalized = new LinkedHashMap<>();
        if (config == null || config.isEmpty()) {
            return normalized;
        }
        for (Map.Entry<String, String> entry : config.entrySet()) {
            String key = trimOrNull(entry.getKey());
            String value = trimOrNull(entry.getValue());
            if (key != null && value != null) {
                normalized.put(key, value);
            }
        }
        return normalized;
    }

    private WorkflowTemplate deepCopyTemplate(WorkflowTemplate source) {
        WorkflowTemplate copy = new WorkflowTemplate();
        copy.setId(source.getId());
        copy.setTemplateGroupId(source.getTemplateGroupId());
        copy.setName(source.getName());
        copy.setDescription(source.getDescription());
        copy.setPublished(source.isPublished());
        copy.setVersionNumber(source.getVersionNumber());
        copy.setLifecycleStatus(source.getLifecycleStatus());
        copy.setBasedOnTemplateId(source.getBasedOnTemplateId());
        copy.setCreatedBy(source.getCreatedBy());
        copy.setCreatedAt(source.getCreatedAt());
        copy.setUpdatedAt(source.getUpdatedAt());
        copy.setPublishedAt(source.getPublishedAt());
        copy.setActivities(normalizeActivities(source.getActivities()));
        copy.setConnections(normalizeConnections(source.getConnections()));
        return copy;
    }

    private void enforceManualAssignee(WorkflowActivity activity, Document document, AppUser actorUser) {
        Map<String, String> config = activity.getConfig() != null ? activity.getConfig() : Map.of();

        String username = trimOrNull(config.get("assigneeUsername"));
        if (StringUtils.hasText(username) && !username.equalsIgnoreCase(actorUser.getUsername())) {
            throw new AccessDeniedException("This manual step is assigned to another user");
        }

        String assigneeRole = trimOrNull(config.get("assigneeRole"));
        if (StringUtils.hasText(assigneeRole)) {
            EnumSet<Role> roleSet = parseRoleSet(assigneeRole);
            if (!roleSet.contains(actorUser.getRole())) {
                throw new AccessDeniedException("Your role is not allowed to decide this manual step");
            }
        }

        String assigneeType = trimOrNull(config.get("assigneeType"));
        if (!StringUtils.hasText(assigneeType)) {
            return;
        }
        switch (assigneeType.toUpperCase(Locale.ROOT)) {
            case "DOCUMENT_APPROVER" -> {
                if (!StringUtils.hasText(document.getApproverId()) || !document.getApproverId().equals(actorUser.getId())) {
                    throw new AccessDeniedException("Only the document approver can decide this step");
                }
            }
            case "DOCUMENT_SUPERVISOR" -> {
                if (!StringUtils.hasText(document.getSupervisorId()) || !document.getSupervisorId().equals(actorUser.getId())) {
                    throw new AccessDeniedException("Only the document supervisor can decide this step");
                }
            }
            case "DOCUMENT_OWNER" -> {
                if (!StringUtils.hasText(document.getOwner()) || !document.getOwner().equalsIgnoreCase(actorUser.getUsername())) {
                    throw new AccessDeniedException("Only the document owner can decide this step");
                }
            }
            default -> throw new AccessDeniedException("Unsupported manual assignee type");
        }
    }

    private EnumSet<Role> parseRoleSet(String value) {
        EnumSet<Role> roles = EnumSet.noneOf(Role.class);
        for (String token : Arrays.stream(value.split(",")).map(String::trim).filter(StringUtils::hasText).toList()) {
            try {
                roles.add(Role.valueOf(token.toUpperCase(Locale.ROOT)));
            } catch (IllegalArgumentException ex) {
                throw new IllegalArgumentException("Unknown role in assigneeRole: " + token);
            }
        }
        if (roles.isEmpty()) {
            throw new IllegalArgumentException("assigneeRole must contain at least one role");
        }
        return roles;
    }

    private String manualAssigneeDescription(WorkflowActivity activity, Document document) {
        Map<String, String> config = activity.getConfig() != null ? activity.getConfig() : Map.of();
        List<String> details = new ArrayList<>();
        String role = trimOrNull(config.get("assigneeRole"));
        String username = trimOrNull(config.get("assigneeUsername"));
        String type = trimOrNull(config.get("assigneeType"));

        if (StringUtils.hasText(role)) {
            details.add("role=" + role);
        }
        if (StringUtils.hasText(username)) {
            details.add("user=" + username);
        }
        if (StringUtils.hasText(type)) {
            details.add("type=" + type);
            if ("DOCUMENT_OWNER".equalsIgnoreCase(type) && StringUtils.hasText(document.getOwner())) {
                details.add("owner=" + document.getOwner());
            }
        }

        if (details.isEmpty()) {
            return "";
        }
        return " (" + String.join(", ", details) + ")";
    }

    private List<WorkflowConnection> normalizeConnections(List<WorkflowConnection> connections) {
        if (connections == null || connections.isEmpty()) {
            return new ArrayList<>();
        }

        List<WorkflowConnection> normalized = new ArrayList<>();
        for (WorkflowConnection original : connections) {
            if (original == null || !StringUtils.hasText(original.getFromActivityId()) || !StringUtils.hasText(original.getToActivityId())) {
                continue;
            }
            WorkflowConnection connection = new WorkflowConnection();
            connection.setId(StringUtils.hasText(original.getId()) ? original.getId().trim() : UUID.randomUUID().toString());
            connection.setFromActivityId(original.getFromActivityId().trim());
            connection.setToActivityId(original.getToActivityId().trim());
            connection.setConditionCase(trimOrNull(original.getConditionCase()));
            connection.setLabel(trimOrNull(original.getLabel()));
            normalized.add(connection);
        }
        return normalized;
    }

    private String defaultActivityName(WorkflowActivityType type) {
        if (type == null) {
            return "Activity";
        }
        return switch (type) {
            case BEGIN -> "Begin";
            case END -> "End";
            case CONDITION -> "Condition";
            case MANUAL -> "Manual";
            case AUTO -> "Auto";
        };
    }

    private AppUser requireUser(String username) {
        if (!StringUtils.hasText(username)) {
            throw new AccessDeniedException("Authentication required");
        }
        try {
            return appUserRepository.findByUsernameIgnoreCase(username.trim())
                .orElseThrow(() -> new AccessDeniedException("Authenticated user not found"));
        } catch (IOException ex) {
            throw new RuntimeException("Failed to resolve authenticated user", ex);
        }
    }

    private String actorOrSystem(String actor) {
        return StringUtils.hasText(actor) ? actor.trim() : "system";
    }

    private String appendNote(String note) {
        if (!StringUtils.hasText(note)) {
            return "";
        }
        return ". Note: " + note.trim();
    }

    private String trimOrNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private record ConditionGroup(String logic, List<ConditionRule> rules) {
    }

    private record ConditionRule(String field, String operator, String value, String rightField, boolean negate) {
    }
}
