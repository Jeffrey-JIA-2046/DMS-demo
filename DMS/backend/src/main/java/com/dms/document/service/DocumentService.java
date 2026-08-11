package com.dms.document.service;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.HashSet;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import com.dms.document.dto.ApproverOptionResponse;
import com.dms.document.dto.DocumentApprovalDecisionRequest;
import com.dms.document.dto.DocumentApprovalInfo;
import com.dms.document.dto.DocumentApprovalNoteResponse;
import com.dms.document.dto.DocumentDetailsResponse;
import com.dms.document.dto.DocumentFilter;
import com.dms.document.dto.DocumentFolderInfo;
import com.dms.document.dto.DocumentSummaryResponse;
import com.dms.document.dto.DocumentUpdateRequest;
import com.dms.document.dto.DocumentUploadRequest;
import com.dms.document.dto.DocumentVersionResponse;
import com.dms.document.dto.FolderMetadataFieldDto;
import com.dms.document.dto.PageResponse;
import com.dms.document.model.Document;
import com.dms.document.model.DocumentApprovalNote;
import com.dms.document.model.DocumentFolder;
import com.dms.document.model.DocumentStatus;
import com.dms.document.model.DocumentVersion;
import com.dms.document.model.FolderMetadataField;
import com.dms.document.repository.DocumentFolderRepository;
import com.dms.document.repository.DocumentRepository;
import com.dms.document.repository.DocumentVersionRepository;
import com.dms.eform.service.EformDefinitionService;
import com.dms.exception.InvalidDocumentException;
import com.dms.exception.ResourceNotFoundException;
import com.dms.ocr.service.DocumentOcrProcessingService;
import com.dms.ocr.service.DocumentOcrResultService;
import com.dms.security.Role;
import com.dms.task.model.TaskPriority;
import com.dms.task.model.TaskStatus;
import com.dms.task.model.TaskType;
import com.dms.task.model.UserTask;
import com.dms.task.repository.UserTaskRepository;
import com.dms.user.dto.GroupSummary;
import com.dms.user.model.AppUser;
import com.dms.user.model.UserGroup;
import com.dms.user.repository.AppUserRepository;
import com.dms.chatbot.service.ChatbotDocumentIndexService;
import com.dms.codetable.model.CodeTableItem;
import com.dms.codetable.repository.CodeTableRepository;
import com.dms.workflow.service.WorkflowService;
import com.dms.workflow.model.WorkflowInstance;

@Service
public class DocumentService {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(DocumentService.class);
    private static final String SEARCH_COLUMN_TITLE = "title";
    private static final String SEARCH_COLUMN_DESCRIPTION = "description";
    private static final String SEARCH_COLUMN_OWNER = "owner";
    private static final String SEARCH_COLUMN_CATEGORY = "category";
    private static final String SEARCH_COLUMN_TAGS = "tags";
    private static final String SEARCH_COLUMN_DOCUMENT_METADATA = "documentmetadata";
    private static final String SEARCH_COLUMN_FOLDER_NAME = "foldername";
    private static final String SEARCH_COLUMN_FOLDER_METADATA = "foldermetadata";
    private static final String SEARCH_COLUMN_CREATED_DATE = "createddate";
    private static final String SEARCH_COLUMN_MODIFIED_DATE = "modifieddate";
    private static final String SEARCH_COLUMN_DOC_META_PREFIX = "docmeta:";
    private static final String SEARCH_COLUMN_FOLDER_META_PREFIX = "foldermeta:";
    private static final Set<String> DEFAULT_SEARCH_COLUMNS = Set.of(SEARCH_COLUMN_TITLE, SEARCH_COLUMN_DESCRIPTION);
    private static final String META_DOCUMENT_DATE = "documentDate";
    private static final String META_APPROVAL_DATE = "approvalDate";
    private static final String META_EXPIRY_DATE = "expiryDate";
    private static final String META_ARCHIVE_DATE = "archiveDate";
    private static final String META_REMINDER_DATE = "reminderDate";

    private final DocumentRepository documentRepository;
    private final DocumentVersionRepository documentVersionRepository;
    private final DocumentFolderRepository documentFolderRepository;
    private final AppUserRepository appUserRepository;
    private final UserTaskRepository userTaskRepository;
    private final FolderPermissionEvaluator folderPermissionEvaluator;
    private final DocumentAttachmentIndexingService documentAttachmentIndexingService;
    private final DocumentOcrProcessingService documentOcrProcessingService;
    private final DocumentOcrResultService documentOcrResultService;
    private final WorkflowService workflowService;
    private final Clock clock;
    private final CodeTableRepository codeTableRepository;
    private final ChatbotDocumentIndexService chatbotDocumentIndexService;
    private final EformDefinitionService eformDefinitionService;

    @Value("${app.documents.max-upload-bytes:104857600}")
    private long maxUploadBytes;

    public DocumentService(
        DocumentRepository documentRepository,
        DocumentVersionRepository documentVersionRepository,
        DocumentFolderRepository documentFolderRepository,
        AppUserRepository appUserRepository,
        UserTaskRepository userTaskRepository,
        FolderPermissionEvaluator folderPermissionEvaluator,
        DocumentAttachmentIndexingService documentAttachmentIndexingService,
        DocumentOcrProcessingService documentOcrProcessingService,
        DocumentOcrResultService documentOcrResultService,
        WorkflowService workflowService,
        Clock clock,
        CodeTableRepository codeTableRepository,
        ChatbotDocumentIndexService chatbotDocumentIndexService,
        EformDefinitionService eformDefinitionService
    ) {
        this.documentRepository = documentRepository;
        this.documentVersionRepository = documentVersionRepository;
        this.documentFolderRepository = documentFolderRepository;
        this.appUserRepository = appUserRepository;
        this.userTaskRepository = userTaskRepository;
        this.folderPermissionEvaluator = folderPermissionEvaluator;
        this.documentAttachmentIndexingService = documentAttachmentIndexingService;
        this.documentOcrProcessingService = documentOcrProcessingService;
        this.documentOcrResultService = documentOcrResultService;
        this.workflowService = workflowService;
        this.clock = clock;
        this.codeTableRepository = codeTableRepository;
        this.chatbotDocumentIndexService = chatbotDocumentIndexService;
        this.eformDefinitionService = eformDefinitionService;
    }

    @Transactional(readOnly = true)
    public PageResponse<DocumentSummaryResponse> findDocuments(DocumentFilter filter, Pageable pageable, String username) {
        try {
            AppUser user = requireUser(username);

            List<Document> allDocuments = documentRepository.findAll();
            List<DocumentFolder> allFolders = documentFolderRepository.findAll();
            Map<String, DocumentFolder> folderById = allFolders.stream()
                .filter(folder -> StringUtils.hasText(folder.getId()))
                .collect(Collectors.toMap(DocumentFolder::getId, folder -> folder, (left, right) -> left));
            Set<String> readableFolderIds = resolveReadableFolderIds(user);
            Set<String> requestedFolderScope = StringUtils.hasText(filter.folderId())
                ? resolveFolderScope(filter.folderId())
                : null;

            List<Document> filtered = allDocuments.stream()
                .filter(document -> {
                    String folderId = extractDocumentFolderId(document);
                    if (folderId == null) {
                        return false;
                    }
                    if (!readableFolderIds.contains(folderId)) {
                        return false;
                    }
                    if (requestedFolderScope != null && !requestedFolderScope.contains(folderId)) {
                        return false;
                    }
                    return true;
                })
                .filter(document -> {
                    String folderId = extractDocumentFolderId(document);
                    DocumentFolder folder = folderId != null ? folderById.get(folderId) : null;
                    return matchesSelectedQueryColumns(document, folder, filter)
                        && matchesConditionRows(document, folder, filter);
                })
                .filter(document -> !StringUtils.hasText(filter.owner())
                    || containsIgnoreCase(document.getOwner(), filter.owner()))
                .filter(document -> !StringUtils.hasText(filter.category())
                    || containsIgnoreCase(document.getCategory(), filter.category()))
                .filter(document -> filter.status() == null || filter.status() == document.getStatus())
                .filter(document -> filter.tags() == null || filter.tags().isEmpty() ||
                    document.getTags().stream().map(tag -> tag.toLowerCase(Locale.ROOT)).collect(Collectors.toSet())
                        .containsAll(filter.tags().stream().map(tag -> tag.toLowerCase(Locale.ROOT)).collect(Collectors.toSet())))
                .collect(Collectors.toCollection(ArrayList::new));

            applySort(filtered, pageable.getSort());

            int from = pageable.getPageNumber() * pageable.getPageSize();
            int to = Math.min(from + pageable.getPageSize(), filtered.size());
            List<Document> pageSlice = from >= filtered.size() ? List.of() : filtered.subList(from, to);

            var content = pageSlice.stream()
                .map(this::toSummary)
                .toList();

            int totalPages = filtered.isEmpty() ? 0 : (int) Math.ceil((double) filtered.size() / pageable.getPageSize());
            boolean isLast = filtered.isEmpty() || pageable.getPageNumber() >= totalPages - 1;

            return new PageResponse<>(content, pageable.getPageNumber(), pageable.getPageSize(), filtered.size(), totalPages, isLast);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to search documents", ex);
        }
    }

    private boolean containsIgnoreCase(String source, String query) {
        return source != null && query != null && source.toLowerCase(Locale.ROOT).contains(query.toLowerCase(Locale.ROOT));
    }

    private boolean matchesSelectedQueryColumns(Document document, DocumentFolder folder, DocumentFilter filter) {
        if (filter == null || !StringUtils.hasText(filter.query())) {
            return true;
        }

        Set<String> selectedColumns = resolveSelectedSearchColumns(filter.searchColumns());
        boolean useAnd = "AND".equalsIgnoreCase(filter.searchOperator());

        if (useAnd) {
            return selectedColumns.stream().allMatch(column -> matchesQueryColumn(document, folder, filter.query(), column));
        }
        return selectedColumns.stream().anyMatch(column -> matchesQueryColumn(document, folder, filter.query(), column));
    }

    private boolean matchesConditionRows(Document document, DocumentFolder folder, DocumentFilter filter) {
        if (filter == null || filter.conditionValues() == null || filter.conditionValues().isEmpty()) {
            return true;
        }

        List<String> fields = filter.conditionFields() != null ? filter.conditionFields() : List.of();
        List<String> values = filter.conditionValues();
        List<String> operators = filter.conditionOperators() != null ? filter.conditionOperators() : List.of();
        List<Integer> groups = filter.conditionGroups() != null ? filter.conditionGroups() : List.of();
        List<String> joins = filter.conditionJoins() != null ? filter.conditionJoins() : List.of();
        Map<Integer, List<Boolean>> groupRowMatches = new LinkedHashMap<>();
        Map<Integer, List<String>> groupRowJoins = new LinkedHashMap<>();

        for (int i = 0; i < values.size(); i++) {
            String value = values.get(i);
            if (!StringUtils.hasText(value)) {
                continue;
            }
            String field = i < fields.size() ? fields.get(i) : SEARCH_COLUMN_TITLE;
            String operator = i < operators.size() ? operators.get(i) : "contains";
            Integer groupIndex = i < groups.size() && groups.get(i) != null ? groups.get(i) : 0;

            groupRowMatches.computeIfAbsent(groupIndex, ignored -> new ArrayList<>())
                .add(matchesConditionWithOperator(document, folder, value, normalizeSearchColumn(field), operator));
            groupRowJoins.computeIfAbsent(groupIndex, ignored -> new ArrayList<>())
                .add(i < joins.size() ? joins.get(i) : null);
        }

        if (groupRowMatches.isEmpty()) {
            return true;
        }

        String fallbackJoin = "OR".equalsIgnoreCase(filter.conditionOperator()) ? "OR" : "AND";
        List<Integer> orderedGroups = groupRowMatches.keySet().stream().sorted().toList();
        Map<Integer, String> connectorToNextByGroup = new HashMap<>();
        for (Integer groupIndex : orderedGroups) {
            List<String> rowJoins = groupRowJoins.getOrDefault(groupIndex, List.of());
            String connector = rowJoins.isEmpty()
                ? fallbackJoin
                : normalizeJoinOperator(rowJoins.get(rowJoins.size() - 1), fallbackJoin);
            connectorToNextByGroup.put(groupIndex, connector);
        }

        boolean overall = false;
        boolean overallInitialized = false;
        for (int groupPos = 0; groupPos < orderedGroups.size(); groupPos++) {
            Integer groupIndex = orderedGroups.get(groupPos);
            List<Boolean> rowMatches = groupRowMatches.getOrDefault(groupIndex, List.of());
            List<String> rowJoins = groupRowJoins.getOrDefault(groupIndex, List.of());
            if (rowMatches.isEmpty()) {
                continue;
            }

            boolean groupResult = rowMatches.get(0);
            for (int i = 1; i < rowMatches.size(); i++) {
                String join = normalizeJoinOperator(i - 1 < rowJoins.size() ? rowJoins.get(i - 1) : null, fallbackJoin);
                if ("AND".equals(join)) {
                    groupResult = groupResult && rowMatches.get(i);
                } else {
                    groupResult = groupResult || rowMatches.get(i);
                }
            }

            if (!overallInitialized) {
                overall = groupResult;
                overallInitialized = true;
                continue;
            }

            Integer previousGroupIndex = orderedGroups.get(groupPos - 1);
            String connector = connectorToNextByGroup.getOrDefault(previousGroupIndex, fallbackJoin);
            if ("OR".equals(connector)) {
                overall = overall || groupResult;
            } else {
                overall = overall && groupResult;
            }
        }

        return overallInitialized ? overall : true;
    }

    private boolean matchesConditionWithOperator(Document document, DocumentFolder folder, String query, String normalizedColumn, String operatorRaw) {
        String operator = normalizeConditionOperator(operatorRaw);

        if ("contains".equals(operator)) {
            return matchesQueryColumn(document, folder, query, normalizedColumn);
        }
        if ("not_contains".equals(operator)) {
            return !matchesQueryColumn(document, folder, query, normalizedColumn);
        }

        List<String> candidates = resolveConditionCandidates(document, folder, normalizedColumn);
        if (candidates.isEmpty()) {
            return "is_not".equals(operator);
        }

        if ("is_not".equals(operator)) {
            return candidates.stream().noneMatch(candidate -> compareByOperator(candidate, query, "is"));
        }

        return candidates.stream().anyMatch(candidate -> compareByOperator(candidate, query, operator));
    }

    private String normalizeConditionOperator(String operatorRaw) {
        if (!StringUtils.hasText(operatorRaw)) {
            return "contains";
        }
        String op = operatorRaw.trim().toLowerCase(Locale.ROOT).replace(' ', '_');
        return switch (op) {
            case "contains", "not_contains", "is", "is_not", "starts_with", "ends_with", "before", "after" -> op;
            default -> "contains";
        };
    }

    private List<String> resolveConditionCandidates(Document document, DocumentFolder folder, String normalizedColumn) {
        if (normalizedColumn != null && normalizedColumn.startsWith(SEARCH_COLUMN_DOC_META_PREFIX)) {
            String key = normalizedColumn.substring(SEARCH_COLUMN_DOC_META_PREFIX.length());
            String value = getMetadataValueIgnoreCase(document.getMetadataValues(), key);
            return StringUtils.hasText(value) ? List.of(value) : List.of();
        }

        if (normalizedColumn != null && normalizedColumn.startsWith(SEARCH_COLUMN_FOLDER_META_PREFIX)) {
            String key = normalizedColumn.substring(SEARCH_COLUMN_FOLDER_META_PREFIX.length());
            if (!folderHasMetadataField(folder, key)) {
                return List.of();
            }
            String value = getMetadataValueIgnoreCase(document.getMetadataValues(), key);
            return StringUtils.hasText(value) ? List.of(value) : List.of();
        }

        return switch (normalizedColumn) {
            case SEARCH_COLUMN_TITLE -> nonBlankList(document.getTitle());
            case SEARCH_COLUMN_DESCRIPTION -> nonBlankList(document.getDescription());
            case SEARCH_COLUMN_OWNER -> nonBlankList(document.getOwner());
            case SEARCH_COLUMN_CATEGORY -> nonBlankList(document.getCategory());
            case SEARCH_COLUMN_TAGS -> document.getTags() == null ? List.of() : document.getTags().stream().filter(StringUtils::hasText).toList();
            case SEARCH_COLUMN_CREATED_DATE -> nonBlankList(searchableInstantValue(document.getCreatedAt()));
            case SEARCH_COLUMN_MODIFIED_DATE -> nonBlankList(searchableInstantValue(document.getUpdatedAt()));
            case SEARCH_COLUMN_DOCUMENT_METADATA -> {
                if (document.getMetadataValues() == null || document.getMetadataValues().isEmpty()) {
                    yield List.of();
                }
                yield document.getMetadataValues().values().stream().filter(StringUtils::hasText).toList();
            }
            case SEARCH_COLUMN_FOLDER_NAME -> folder == null ? List.of() : nonBlankList(folder.getName());
            case SEARCH_COLUMN_FOLDER_METADATA -> {
                if (folder == null || folder.getMetadataTemplate() == null || folder.getMetadataTemplate().isEmpty()) {
                    yield List.of();
                }
                List<String> keys = folder.getMetadataTemplate().stream()
                    .map(FolderMetadataField::getKey)
                    .filter(StringUtils::hasText)
                    .toList();
                List<String> values = new ArrayList<>();
                for (String key : keys) {
                    String value = getMetadataValueIgnoreCase(document.getMetadataValues(), key);
                    if (StringUtils.hasText(value)) {
                        values.add(value);
                    }
                }
                yield values;
            }
            default -> List.of();
        };
    }

    private List<String> nonBlankList(String value) {
        return StringUtils.hasText(value) ? List.of(value) : List.of();
    }

    private boolean compareByOperator(String candidate, String query, String operator) {
        if (!StringUtils.hasText(candidate) || !StringUtils.hasText(query)) {
            return false;
        }

        String left = candidate.trim();
        String right = query.trim();
        String leftLower = left.toLowerCase(Locale.ROOT);
        String rightLower = right.toLowerCase(Locale.ROOT);
        LocalDate leftDate = parseDateValue(left);
        LocalDate rightDate = parseDateValue(right);

        return switch (operator) {
            case "is" -> leftDate != null && rightDate != null ? leftDate.isEqual(rightDate) : leftLower.equals(rightLower);
            case "starts_with" -> leftLower.startsWith(rightLower);
            case "ends_with" -> leftLower.endsWith(rightLower);
            case "before" -> compareTemporalOrLexical(left, right) < 0;
            case "after" -> compareTemporalOrLexical(left, right) > 0;
            default -> leftLower.contains(rightLower);
        };
    }

    private int compareTemporalOrLexical(String left, String right) {
        LocalDate leftDate = parseDateValue(left);
        LocalDate rightDate = parseDateValue(right);
        if (leftDate != null && rightDate != null) {
            return leftDate.compareTo(rightDate);
        }
        return left.compareToIgnoreCase(right);
    }

    private LocalDate parseDateValue(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String trimmed = value.trim();
        try {
            return LocalDate.parse(trimmed);
        } catch (DateTimeParseException ignored) {
            // Try other timestamp/date formats.
        }
        try {
            return Instant.parse(trimmed).atZone(ZoneOffset.UTC).toLocalDate();
        } catch (DateTimeParseException ignored) {
            // Try other timestamp/date formats.
        }
        try {
            return OffsetDateTime.parse(trimmed).toLocalDate();
        } catch (DateTimeParseException ignored) {
            // Try other timestamp/date formats.
        }
        try {
            return LocalDateTime.parse(trimmed).toLocalDate();
        } catch (DateTimeParseException ignored) {
            // Try loose US date parsing below.
        }

        String datePart = trimmed.split("[ T]", 2)[0].trim();
        String[] slashParts = datePart.split("/");
        if (slashParts.length == 3) {
            try {
                int month = Integer.parseInt(slashParts[0]);
                int day = Integer.parseInt(slashParts[1]);
                int year = Integer.parseInt(slashParts[2]);
                return LocalDate.of(year, month, day);
            } catch (RuntimeException ignored) {
                return null;
            }
        }
        return null;
    }

    private String searchableInstantValue(Instant instant) {
        if (instant == null) {
            return null;
        }
        LocalDate date = instant.atZone(ZoneOffset.UTC).toLocalDate();
        return instant + " " + date;
    }

    private String normalizeJoinOperator(String join, String fallbackJoin) {
        if (!StringUtils.hasText(join)) {
            return fallbackJoin;
        }
        return "AND".equalsIgnoreCase(join) ? "AND" : "OR";
    }

    private Set<String> resolveSelectedSearchColumns(Set<String> selectedColumns) {
        if (selectedColumns == null || selectedColumns.isEmpty()) {
            return DEFAULT_SEARCH_COLUMNS;
        }
        Set<String> normalized = selectedColumns.stream()
            .filter(StringUtils::hasText)
            .map(this::normalizeSearchColumn)
            .collect(Collectors.toCollection(LinkedHashSet::new));
        if (normalized.isEmpty()) {
            return DEFAULT_SEARCH_COLUMNS;
        }
        if (normalized.contains("all")) {
            return Set.of(
                SEARCH_COLUMN_TITLE,
                SEARCH_COLUMN_DESCRIPTION,
                SEARCH_COLUMN_OWNER,
                SEARCH_COLUMN_CATEGORY,
                SEARCH_COLUMN_TAGS,
                SEARCH_COLUMN_CREATED_DATE,
                SEARCH_COLUMN_MODIFIED_DATE,
                SEARCH_COLUMN_DOCUMENT_METADATA,
                SEARCH_COLUMN_FOLDER_NAME,
                SEARCH_COLUMN_FOLDER_METADATA
            );
        }
        return normalized;
    }

    private boolean matchesQueryColumn(Document document, DocumentFolder folder, String query, String normalizedColumn) {
        if (normalizedColumn != null && normalizedColumn.startsWith(SEARCH_COLUMN_DOC_META_PREFIX)) {
            String key = normalizedColumn.substring(SEARCH_COLUMN_DOC_META_PREFIX.length());
            String value = getMetadataValueIgnoreCase(document.getMetadataValues(), key);
            return containsIgnoreCase(value, query);
        }

        if (normalizedColumn != null && normalizedColumn.startsWith(SEARCH_COLUMN_FOLDER_META_PREFIX)) {
            String key = normalizedColumn.substring(SEARCH_COLUMN_FOLDER_META_PREFIX.length());
            if (!folderHasMetadataField(folder, key)) {
                return false;
            }
            String value = getMetadataValueIgnoreCase(document.getMetadataValues(), key);
            return containsIgnoreCase(value, query);
        }

        return switch (normalizedColumn) {
            case SEARCH_COLUMN_TITLE -> containsIgnoreCase(document.getTitle(), query);
            case SEARCH_COLUMN_DESCRIPTION -> containsIgnoreCase(document.getDescription(), query);
            case SEARCH_COLUMN_OWNER -> containsIgnoreCase(document.getOwner(), query);
            case SEARCH_COLUMN_CATEGORY -> containsIgnoreCase(document.getCategory(), query);
            case SEARCH_COLUMN_TAGS -> document.getTags() != null && document.getTags().stream().anyMatch(tag -> containsIgnoreCase(tag, query));
            case SEARCH_COLUMN_CREATED_DATE -> containsIgnoreCase(searchableInstantValue(document.getCreatedAt()), query);
            case SEARCH_COLUMN_MODIFIED_DATE -> containsIgnoreCase(searchableInstantValue(document.getUpdatedAt()), query);
            case SEARCH_COLUMN_DOCUMENT_METADATA -> document.getMetadataValues() != null && document.getMetadataValues().entrySet().stream()
                .anyMatch(entry -> containsIgnoreCase(entry.getKey(), query) || containsIgnoreCase(entry.getValue(), query));
            case SEARCH_COLUMN_FOLDER_NAME -> folder != null && containsIgnoreCase(folder.getName(), query);
            case SEARCH_COLUMN_FOLDER_METADATA -> folder != null && folder.getMetadataTemplate() != null && folder.getMetadataTemplate().stream()
                .anyMatch(field -> containsIgnoreCase(field.getKey(), query)
                    || containsIgnoreCase(field.getLabel(), query)
                    || containsIgnoreCase(field.getHint(), query));
            default -> false;
        };
    }

    private String getMetadataValueIgnoreCase(Map<String, String> metadataValues, String key) {
        if (metadataValues == null || metadataValues.isEmpty() || !StringUtils.hasText(key)) {
            return null;
        }
        for (Map.Entry<String, String> entry : metadataValues.entrySet()) {
            if (entry.getKey() != null && entry.getKey().equalsIgnoreCase(key)) {
                return entry.getValue();
            }
        }
        return null;
    }

    private boolean folderHasMetadataField(DocumentFolder folder, String key) {
        if (folder == null || !StringUtils.hasText(key)) {
            return false;
        }
        if (folder.getMetadataTemplate() == null || folder.getMetadataTemplate().isEmpty()) {
            return false;
        }
        return folder.getMetadataTemplate().stream()
            .map(FolderMetadataField::getKey)
            .filter(StringUtils::hasText)
            .anyMatch(fieldKey -> fieldKey.equalsIgnoreCase(key));
    }

    private String normalizeSearchColumn(String value) {
        if (!StringUtils.hasText(value)) {
            return "";
        }
        return value.trim().toLowerCase(Locale.ROOT);
    }

    private void applySort(List<Document> documents, Sort sort) {
        if (documents == null || documents.isEmpty()) {
            return;
        }
        Comparator<Document> comparator = buildSortComparator(sort);
        if (comparator != null) {
            documents.sort(comparator);
        }
    }

    private Comparator<Document> buildSortComparator(Sort sort) {
        Comparator<Document> comparator = null;
        if (sort != null && sort.isSorted()) {
            for (Sort.Order order : sort) {
                Comparator<Document> fieldComparator = comparatorForProperty(order.getProperty());
                if (fieldComparator == null) {
                    continue;
                }
                if (order.isDescending()) {
                    fieldComparator = fieldComparator.reversed();
                }
                comparator = comparator == null ? fieldComparator : comparator.thenComparing(fieldComparator);
            }
        }

        if (comparator == null) {
            comparator = comparatorForProperty("createdAt").reversed();
        }

        return comparator
            .thenComparing(document -> normalizeSortText(document.getTitle()), Comparator.nullsLast(String::compareTo))
            .thenComparing(Document::getId, Comparator.nullsLast(String::compareTo));
    }

    private Comparator<Document> comparatorForProperty(String property) {
        if (!StringUtils.hasText(property)) {
            return null;
        }

        return switch (property) {
            case "createdAt" -> Comparator.comparing(Document::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder()));
            case "updatedAt" -> Comparator.comparing(Document::getUpdatedAt, Comparator.nullsLast(Comparator.naturalOrder()));
            case "title" -> Comparator.comparing(document -> normalizeSortText(document.getTitle()), Comparator.nullsLast(String::compareTo));
            case "status" -> Comparator.comparing(document -> document.getStatus() == null ? "" : document.getStatus().name(), Comparator.nullsLast(String::compareTo));
            case "latestSizeBytes" -> Comparator.comparingLong(this::latestSizeBytes);
            default -> null;
        };
    }

    private String normalizeSortText(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.toLowerCase(Locale.ROOT);
    }

    private long latestSizeBytes(Document document) {
        if (document == null || document.getVersions() == null || document.getVersions().isEmpty()) {
            return 0L;
        }
        return document.getVersions().stream()
            .max(Comparator.comparingInt(DocumentVersion::getVersionNumber))
            .map(DocumentVersion::getSizeBytes)
            .orElse(0L);
    }

    private String extractDocumentFolderId(Document document) {
        if (document == null) {
            return null;
        }
        if (StringUtils.hasText(document.getFolderId())) {
            return document.getFolderId();
        }
        if (document.getFolder() != null && StringUtils.hasText(document.getFolder().getId())) {
            return document.getFolder().getId();
        }
        return null;
    }

    private Set<String> resolveFolderScope(String rootFolderId) {
        try {
            List<DocumentFolder> allFolders = documentFolderRepository.findAll();
            Map<String, List<String>> childrenByParent = new HashMap<>();

            for (DocumentFolder folder : allFolders) {
                String parentId = folder.getParentId();
                if (!StringUtils.hasText(parentId) && folder.getParent() != null) {
                    parentId = folder.getParent().getId();
                }
                if (StringUtils.hasText(parentId)) {
                    childrenByParent.computeIfAbsent(parentId, key -> new ArrayList<>()).add(folder.getId());
                }
            }

            Set<String> scope = new HashSet<>();
            List<String> queue = new ArrayList<>();
            queue.add(rootFolderId);

            while (!queue.isEmpty()) {
                String current = queue.remove(0);
                if (!scope.add(current)) {
                    continue;
                }
                List<String> children = childrenByParent.getOrDefault(current, List.of());
                queue.addAll(children);
            }

            return scope;
        } catch (IOException ex) {
            throw new RuntimeException("Failed to resolve folder scope", ex);
        }
    }

    private PageResponse<DocumentSummaryResponse> emptyPage(Pageable pageable) {
        return new PageResponse<>(List.of(), pageable.getPageNumber(), pageable.getPageSize(), 0, 0, true);
    }

    @Transactional(readOnly = true)
    public DocumentDetailsResponse getDocument(String id, String username) {
        AppUser user = requireUser(username);
        Document document = findDocument(id);
        assertCanRead(resolveFolderForAccess(document), user);
        return toDetails(document);
    }

    @Transactional
    public DocumentDetailsResponse createDocument(DocumentUploadRequest request, MultipartFile file, String username) {
        try {
            AppUser user = requireUser(username);
            MultipartFile safeFile = requireFile(file);
            Document document = new Document();
            document.setId(UUID.randomUUID().toString());
            document.setTitle(request.title());
            document.setDescription(request.description());
            document.setOwner(request.owner());
            document.setCategory(request.category());
            if (StringUtils.hasText(request.categoryCode())) {
                document.setCategoryCode(request.categoryCode());
                document.setCategoryLabel(resolveCategoryLabel(request.categoryCode()));
            }
            document.setTags(normalizeTags(request.tags()));
            DocumentFolder folder = findFolder(request.folderId());
            assertCanWrite(folder, user);
            document.setFolder(folder);
            document.setFolderId(folder.getId());
            Set<String> eformMetadataKeys = eformDefinitionService.resolveMetadataKeysForCategory(document.getCategoryCode());
            Map<String, String> resolvedMetadata = resolveMetadataValues(folder, request.metadata(), eformMetadataKeys);
            AppUser reviewer = requireApprover(request.reviewerId());
            assertApproverEligible(user, reviewer);
            document.setReviewer(reviewer);
            document.setReviewerId(reviewer.getId());
            AppUser approver = requireApprover(request.approverId());
            assertApproverEligible(user, approver);
            document.setApprover(approver);
            document.setApproverId(approver.getId());
            AppUser supervisor = requireSupervisor(request.supervisorId());
            assertSupervisorEligible(user, supervisor);
            document.setSupervisor(supervisor);
            document.setSupervisorId(supervisor.getId());
            document.setStatus(DocumentStatus.DRAFT);

            Instant now = Instant.now(clock);
            document.setCreatedAt(now);
            document.setUpdatedAt(now);
            document.setApprovalRequestedAt(now);
            document.setApprovalDecidedAt(null);
            document.setIsOcr(false);
            document.setOcrStatus("NOT_STARTED");
            document.setOcrStatusMessage(null);
            document.setOcrStatusUpdatedAt(now);
            document.setMetadataValues(applySystemDateMetadata(
                resolvedMetadata,
                request.documentDate(),
                request.expiryDate(),
                null,
                null
            ));

            document.addVersion(buildVersion(document, safeFile, now, 1));

            Document saved = documentRepository.save(document);
            persistDocumentVersions(saved);
            indexLatestAttachment(saved);
            boolean workflowStarted = workflowService.startWorkflowForDocument(saved, username, reviewer.getId());
            if (!workflowStarted) {
                createApprovalTask(saved, reviewer, now);
            }
            return toDetails(saved);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to create document", ex);
        }
    }

    @Transactional
    public DocumentDetailsResponse addVersion(String documentId, MultipartFile file, String username) {
        try {
            AppUser user = requireUser(username);
            MultipartFile safeFile = requireFile(file);
            Document document = findDocument(documentId);
            assertCanWrite(resolveFolderForAccess(document), user);
            Instant now = Instant.now(clock);
            int nextVersion = document.getVersions().stream()
                .map(DocumentVersion::getVersionNumber)
                .max(Comparator.naturalOrder())
                .orElse(0) + 1;

            document.addVersion(buildVersion(document, safeFile, now, nextVersion));
            document.setIsOcr(false);
            document.setOcrStatus("NOT_STARTED");
            document.setOcrStatusMessage(null);
            document.setOcrStatusUpdatedAt(now);
            document.setUpdatedAt(now);
            Document saved = documentRepository.save(document);
            persistDocumentVersions(saved);
            indexLatestAttachment(saved);
            documentOcrProcessingService.markDocumentOcrUnavailable(saved.getId());
            return toDetails(saved);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to add document version", ex);
        }
    }

    @Transactional
    public DocumentDetailsResponse updateDocument(String documentId, DocumentUpdateRequest request, String username) {
        try {
            AppUser user = requireUser(username);
            Document document = findDocument(documentId);
            assertCanWrite(resolveFolderForAccess(document), user);
            boolean changed = false;
            boolean titleChanged = false;

            DocumentFolder currentFolder = document.getFolder();
            String currentFolderId = currentFolder != null ? currentFolder.getId() : null;
            DocumentFolder targetFolder = currentFolder;
            boolean folderChanged = false;

            if (StringUtils.hasText(request.title())) {
                document.setTitle(request.title());
                changed = true;
                titleChanged = true;
            }
            if (request.description() != null) {
                document.setDescription(request.description());
                changed = true;
            }
            if (StringUtils.hasText(request.category())) {
                document.setCategory(request.category());
                changed = true;
            }
            if (StringUtils.hasText(request.categoryCode())) {
                document.setCategoryCode(request.categoryCode());
                document.setCategoryLabel(resolveCategoryLabel(request.categoryCode()));
                changed = true;
            }
            if (request.tags() != null) {
                document.setTags(normalizeTags(request.tags()));
                changed = true;
            }
            if (request.folderId() != null) {
                if (!Objects.equals(currentFolderId, request.folderId())) {
                    targetFolder = findFolder(request.folderId());
                    assertCanWrite(targetFolder, user);
                    document.setFolder(targetFolder);
                    document.setFolderId(targetFolder.getId());
                    folderChanged = true;
                    changed = true;
                }
            }

            Map<String, String> incomingMetadata = request.metadata();
            if (incomingMetadata != null || folderChanged) {
                DocumentFolder folderForValidation = targetFolder != null ? targetFolder : document.getFolder();
                Set<String> eformMetadataKeys = eformDefinitionService.resolveMetadataKeysForCategory(document.getCategoryCode());
                Map<String, String> sourceValues = incomingMetadata != null
                    ? mergeSystemDateMetadata(incomingMetadata, document.getMetadataValues())
                    : document.getMetadataValues();
                document.setMetadataValues(resolveMetadataValues(folderForValidation, sourceValues, eformMetadataKeys));
                changed = true;
            }

            if (changed) {
                document.setUpdatedAt(Instant.now(clock));
            }

            Document saved = documentRepository.save(document);
            if (titleChanged) {
                syncApprovalTaskMetadata(saved);
            }
            return toDetails(saved);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to update document", ex);
        }
    }

    @Transactional
    public DocumentDetailsResponse applyExtractedMetadata(String documentId, Map<String, String> extractedMetadata) {
        try {
            Document document = findDocument(documentId);
            DocumentFolder folder = document.getFolder();

            Map<String, String> mergedMetadata = new LinkedHashMap<>();
            if (document.getMetadataValues() != null) {
                mergedMetadata.putAll(document.getMetadataValues());
            }
            if (extractedMetadata != null) {
                extractedMetadata.forEach((key, value) -> {
                    if (StringUtils.hasText(key) && StringUtils.hasText(value)) {
                        mergedMetadata.put(key.trim(), value.trim());
                    }
                });
            }

            Set<String> eformMetadataKeys = eformDefinitionService.resolveMetadataKeysForCategory(document.getCategoryCode());
            document.setMetadataValues(resolveMetadataValues(folder, mergedMetadata, eformMetadataKeys));
            document.setUpdatedAt(Instant.now(clock));
            Document saved = documentRepository.save(document);
            return toDetails(saved);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to apply extracted metadata", ex);
        }
    }

    @Transactional
    public void archiveDocument(String documentId, String username) {
        try {
            AppUser user = requireUser(username);
            Document document = findDocument(documentId);
            assertCanWrite(resolveFolderForAccess(document), user);
            Instant now = Instant.now(clock);
            document.setStatus(DocumentStatus.ARCHIVED);
            document.setUpdatedAt(now);
            documentRepository.save(document);
            cancelLinkedTasks(document, "Archived", now);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to archive document", ex);
        }
    }

    @Transactional
    public void deleteDocument(String documentId, String username) {
        try {
            AppUser user = requireUser(username);
            Document document = findDocument(documentId);
            assertCanDelete(resolveFolderForAccess(document), user);
            cancelLinkedTasks(document, "Deleted", Instant.now(clock));
            documentOcrResultService.invalidateDocumentCache(document.getId());
            chatbotDocumentIndexService.deleteDocument(document.getId());
            removeIndexedAttachments(document);
            documentRepository.deleteById(String.valueOf(documentId));
        } catch (IOException ex) {
            throw new RuntimeException("Failed to delete document", ex);
        }
    }

    @Transactional
    public void disposeDocumentByRetention(String documentId, java.time.LocalDate disposalDate, String retentionRuleId) {
        try {
            Document document = findDocument(documentId);
            Instant now = Instant.now(clock);
            cancelLinkedTasks(document, "Disposed by retention policy", now);
            documentOcrResultService.invalidateDocumentCache(document.getId());
            chatbotDocumentIndexService.deleteDocument(document.getId());
            removeIndexedAttachments(document);
            documentRepository.deleteById(String.valueOf(documentId));
            log.info("Disposed document {} by retention rule {} on {}", documentId, retentionRuleId, disposalDate);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to dispose document by retention", ex);
        }
    }

    @Transactional(readOnly = true)
    public DocumentVersion getVersion(String documentId, String versionId, String username) {
        AppUser user = requireUser(username);
        Document document = findDocument(documentId);
        assertCanRead(resolveFolderForAccess(document), user);

        // Legacy records may have null version IDs. Treat null/"null" as latest.
        if (!StringUtils.hasText(versionId) || "null".equalsIgnoreCase(versionId.trim())) {
            DocumentVersion latest = document.getVersions().stream()
                .max(Comparator.comparingInt(DocumentVersion::getVersionNumber))
                .orElseThrow(() -> new ResourceNotFoundException("No versions found for document"));
            return loadVersionContent(document.getId(), latest.getId());
        }

        DocumentVersion selected = document.getVersions().stream()
            .filter(version -> versionId.equals(version.getId()))
            .findFirst()
            .orElseThrow(() -> new ResourceNotFoundException("Version not found"));
        return loadVersionContent(document.getId(), selected.getId());
    }

    @Transactional(readOnly = true)
    public boolean existsDocument(String documentId) {
        if (!StringUtils.hasText(documentId)) {
            return false;
        }
        try {
            return documentRepository.findById(documentId).isPresent();
        } catch (IOException ex) {
            throw new RuntimeException("Failed to check document existence", ex);
        }
    }

    @Transactional(readOnly = true)
    public DocumentVersionRepository.VersionStorageHealth getVersionStorageHealth() {
        try {
            return documentVersionRepository.getStorageHealth();
        } catch (IOException ex) {
            throw new RuntimeException("Failed to read version storage health", ex);
        }
    }

    @Transactional
    public VersionHousekeepingResult runVersionHousekeeping(boolean dryRun) {
        try {
            DocumentVersionRepository.VersionStorageHealth before = documentVersionRepository.getStorageHealth();
            List<String> scannedIds = documentVersionRepository.findDistinctOsDocumentIds();
            List<String> orphanIds = new ArrayList<>();
            int deletedRows = 0;

            for (String documentId : scannedIds) {
                if (!documentRepository.findById(documentId).isPresent()) {
                    orphanIds.add(documentId);
                    if (!dryRun) {
                        deletedRows += documentVersionRepository.deleteByOsDocumentId(documentId);
                    }
                }
            }

            DocumentVersionRepository.VersionStorageHealth after = documentVersionRepository.getStorageHealth();
            return new VersionHousekeepingResult(
                scannedIds.size(),
                orphanIds.size(),
                deletedRows,
                orphanIds,
                dryRun,
                before,
                after
            );
        } catch (IOException ex) {
            throw new RuntimeException("Failed to run version housekeeping", ex);
        }
    }

    @Transactional(readOnly = true)
    public DocumentVersion getLatestVersion(String documentId, String username) {
        AppUser user = requireUser(username);
        Document document = findDocument(documentId);
        assertCanRead(resolveFolderForAccess(document), user);
        DocumentVersion latest = document.getVersions().stream()
            .max(Comparator.comparingInt(DocumentVersion::getVersionNumber))
            .orElseThrow(() -> new ResourceNotFoundException("No versions found for document"));
        return loadVersionContent(document.getId(), latest.getId());
    }

    private void persistDocumentVersions(Document document) throws IOException {
        if (document == null || document.getVersions() == null || document.getVersions().isEmpty()) {
            return;
        }
        for (DocumentVersion version : document.getVersions()) {
            if (version == null) {
                continue;
            }
            if (!StringUtils.hasText(version.getDocumentId())) {
                version.setDocumentId(document.getId());
            }
            documentVersionRepository.save(version);
        }
    }

    private DocumentVersion loadVersionContent(String documentId, String versionId) {
        if (!StringUtils.hasText(documentId) || !StringUtils.hasText(versionId)) {
            throw new ResourceNotFoundException("Version not found");
        }
        try {
            return documentVersionRepository.findByIdAndDocumentId(versionId, documentId)
                .orElseThrow(() -> new ResourceNotFoundException("Version not found"));
        } catch (IOException ex) {
            throw new RuntimeException("Failed to load document version", ex);
        }
    }

    @Transactional(readOnly = true)
    public List<ApproverOptionResponse> listEligibleApprovers(String username) {
        AppUser requester = requireUser(username);
        Set<UserGroup> groups = requester.getGroups();
        if (groups == null || groups.isEmpty()) {
            return listAllApproverCandidates(requester);
        }
        Set<String> groupIds = groups.stream()
            .map(UserGroup::getId)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
        if (groupIds.isEmpty()) {
            return listAllApproverCandidates(requester);
        }
        try {
            List<ApproverOptionResponse> sharedGroupCandidates = appUserRepository.findDistinctByGroupIds(groupIds).stream()
                .filter(Objects::nonNull)
                .filter(candidate -> !Objects.equals(candidate.getId(), requester.getId()))
                .sorted(Comparator.comparing(this::userSortKey, String.CASE_INSENSITIVE_ORDER))
                .map(this::toApproverOption)
                .toList();
            if (!sharedGroupCandidates.isEmpty()) {
                return sharedGroupCandidates;
            }
            return listAllApproverCandidates(requester);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to list eligible approvers", ex);
        }
    }

    @Transactional(readOnly = true)
    public List<ApproverOptionResponse> listEligibleSupervisors(String username) {
        requireUser(username);
        try {
            return appUserRepository.findAll().stream()
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(this::userSortKey, String.CASE_INSENSITIVE_ORDER))
                .map(this::toApproverOption)
                .toList();
        } catch (IOException ex) {
            throw new RuntimeException("Failed to list eligible supervisors", ex);
        }
    }

    @Transactional
    public DocumentDetailsResponse addApprovalNote(String documentId, DocumentApprovalDecisionRequest request, String username) {
        try {
            AppUser actor = requireUser(username);
            Document document = findDocument(documentId);
            assertCanManageApproval(document, actor);
            if (request == null || !StringUtils.hasText(request.note())) {
                throw new InvalidDocumentException("A note is required");
            }
            if (!isAwaitingApproval(document)) {
                throw new InvalidDocumentException("Document is not awaiting approval");
            }
            Instant now = Instant.now(clock);
            appendApprovalNote(document, actor, request.note(), now);
            document.setUpdatedAt(now);
            Document saved = documentRepository.save(document);
            return toDetails(saved);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to add approval note", ex);
        }
    }

    @Transactional
    public DocumentDetailsResponse approveDocument(String documentId, DocumentApprovalDecisionRequest request, String username) {
        try {
            AppUser actor = requireUser(username);
            Document document = findDocument(documentId);
            assertCanManageApproval(document, actor);
            if (!isAwaitingApproval(document)) {
                throw new InvalidDocumentException("Document is not awaiting approval");
            }
            Instant now = Instant.now(clock);
            if (request != null && StringUtils.hasText(request.note())) {
                appendApprovalNote(document, actor, request.note(), now);
            }

            if (isReviewerStageApproval(document, actor)) {
                AppUser approver = document.getApprover();
                document.setStatus(DocumentStatus.REVIEWED);
                document.setApprovalRequestedAt(now);
                document.setApprovalDecidedAt(null);
                document.setUpdatedAt(now);
                Document saved = documentRepository.save(document);
                closeActorReviewTasks(saved, actor, "Reviewed", now);
                reassignApprovalTask(saved, approver, now);
                return toDetails(saved);
            }

            document.setStatus(DocumentStatus.ACTIVE);
            document.setApprovalDecidedAt(now);
            document.setMetadataValues(applySystemDateMetadata(
                document.getMetadataValues(),
                null,
                null,
                now,
                document.getMetadataValues() != null ? document.getMetadataValues().get(META_REMINDER_DATE) : null
            ));
            document.setUpdatedAt(now);
            Document saved = documentRepository.save(document);
            completeReviewTasks(saved, TaskStatus.COMPLETED, "Approved", now);
            return toDetails(saved);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to approve document", ex);
        }
    }

    @Transactional
    public DocumentDetailsResponse rejectDocument(String documentId, DocumentApprovalDecisionRequest request, String username) {
        try {
            AppUser actor = requireUser(username);
            Document document = findDocument(documentId);
            assertCanManageApproval(document, actor);
            if (!isAwaitingApproval(document)) {
                throw new InvalidDocumentException("Document is not awaiting approval");
            }
            Instant now = Instant.now(clock);
            if (request != null && StringUtils.hasText(request.note())) {
                appendApprovalNote(document, actor, request.note(), now);
            }
            document.setStatus(DocumentStatus.REJECTED);
            document.setApprovalDecidedAt(now);
            document.setUpdatedAt(now);
            Document saved = documentRepository.save(document);
            completeReviewTasks(saved, TaskStatus.COMPLETED, "Rejected", now);
            createOrUpdateSupervisorRejectionTask(saved, actor, request != null ? request.note() : null, now);
            return toDetails(saved);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to reject document", ex);
        }
    }

    @Transactional
    public DocumentDetailsResponse delegateApproval(String documentId, DocumentApprovalDecisionRequest request, String username) {
        try {
            AppUser actor = requireUser(username);
            Document document = findDocument(documentId);
            assertCanManageApproval(document, actor);
            if (!isAwaitingApproval(document)) {
                throw new InvalidDocumentException("Document is not awaiting approval");
            }
            if (request == null || !StringUtils.hasText(request.approverId())) {
                throw new InvalidDocumentException("A delegate approver is required");
            }
            AppUser delegate = requireApprover(request.approverId().trim());
            assertApproverEligible(actor, delegate);

            Instant now = Instant.now(clock);
            appendApprovalNote(document, actor, buildDelegationNote(delegate, request.note()), now);
            document.setApprover(delegate);
            document.setApprovalRequestedAt(now);
            document.setApprovalDecidedAt(null);
            document.setUpdatedAt(now);

            Document saved = documentRepository.save(document);
            closeActorReviewTasks(saved, actor, "Delegated", now);
            reassignApprovalTask(saved, delegate, now);
            return toDetails(saved);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to delegate approval", ex);
        }
    }

    @Transactional
    public DocumentDetailsResponse resubmitRejectedApproval(String documentId, DocumentApprovalDecisionRequest request, String username) {
        try {
            AppUser actor = requireUser(username);
            Document document = findDocument(documentId);
            assertCanResubmitApproval(document, actor);

            if (request == null || !StringUtils.hasText(request.reviewerId()) || !StringUtils.hasText(request.approverId())) {
                throw new InvalidDocumentException("Reviewer and approver are required to resubmit approval");
            }

            AppUser reviewer = requireApprover(request.reviewerId().trim());
            assertApproverEligible(actor, reviewer);
            AppUser approver = requireApprover(request.approverId().trim());
            assertApproverEligible(actor, approver);

            Instant now = Instant.now(clock);
            if (StringUtils.hasText(request.note())) {
                appendApprovalNote(document, actor, "Resubmitted for approval. " + request.note().trim(), now);
            }

            document.setReviewer(reviewer);
            document.setReviewerId(reviewer.getId());
            document.setApprover(approver);
            document.setApproverId(approver.getId());
            document.setStatus(DocumentStatus.DRAFT);
            document.setApprovalRequestedAt(now);
            document.setApprovalDecidedAt(null);
            document.setUpdatedAt(now);

            Document saved = documentRepository.save(document);

            cancelLinkedTasks(saved, "Resubmitted for approval", now);
            boolean workflowStarted = workflowService.startWorkflowForDocument(saved, username, reviewer.getId());
            if (!workflowStarted) {
                createApprovalTask(saved, reviewer, now);
            }
            return toDetails(saved);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to resubmit approval", ex);
        }
    }

    private void createOrUpdateSupervisorRejectionTask(Document document, AppUser approver, String rejectionNote, Instant now) {
        try {
            if (document == null || !StringUtils.hasText(document.getId())) {
                return;
            }
            AppUser supervisor = document.getSupervisor();
            if (supervisor == null && StringUtils.hasText(document.getSupervisorId())) {
                supervisor = appUserRepository.findById(document.getSupervisorId()).orElse(null);
            }
            if (supervisor == null) {
                return;
            }

            String note = StringUtils.hasText(rejectionNote)
                ? rejectionNote.trim()
                : "No note provided.";
            String approverName = approver != null && StringUtils.hasText(approver.getDisplayName())
                ? approver.getDisplayName()
                : approver != null ? approver.getUsername() : "Approver";

            UserTask task = resolveRejectionTask(document).orElseGet(UserTask::new);
            task.setTitle("Revise rejected document: \"" + document.getTitle() + "\"");
            task.setDescription("Document rejected by " + approverName + ". Update metadata/content and resubmit. Note: " + note);
            task.setStatus(TaskStatus.PENDING);
            task.setPriority(TaskPriority.HIGH);
            task.setTaskType(TaskType.REJECTION);
            task.setWorkflowStep("Rejected - supervisor follow-up");
            task.setDocumentId(document.getId());
            task.setDocumentTitle(document.getTitle());
            task.setDueDate(LocalDate.now(clock).plusDays(2));
            task.setAssignee(supervisor);
            if (task.getCreatedAt() == null) {
                task.setCreatedAt(now);
            }
            task.setUpdatedAt(now);
            userTaskRepository.save(task);
        } catch (IOException ex) {
            log.warn("Failed to create supervisor rejection task", ex);
        }
    }

    private Document findDocument(String id) {
        try {
            if (id == null) {
                throw new ResourceNotFoundException("Document not found");
            }
            Document document = documentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
            if (repairDocumentIdentifiers(document)) {
                return documentRepository.save(document);
            }
            return document;
        } catch (IOException ex) {
            throw new RuntimeException("Failed to retrieve document", ex);
        }
    }

    private AppUser requireApprover(String approverId) {
        try {
            if (approverId == null) {
                throw new InvalidDocumentException("Approver selection is required");
            }
            return appUserRepository.findById(approverId)
                .orElseThrow(() -> new InvalidDocumentException("Approver not found"));
        } catch (IOException ex) {
            throw new RuntimeException("Failed to retrieve approver", ex);
        }
    }

    private AppUser requireSupervisor(String supervisorId) {
        try {
            if (!StringUtils.hasText(supervisorId)) {
                throw new InvalidDocumentException("Supervisor selection is required");
            }
            return appUserRepository.findById(supervisorId)
                .orElseThrow(() -> new InvalidDocumentException("Supervisor not found"));
        } catch (IOException ex) {
            throw new RuntimeException("Failed to retrieve supervisor", ex);
        }
    }

    private void assertApproverEligible(AppUser requester, AppUser approver) {
        if (requester == null || approver == null) {
            throw new InvalidDocumentException("Approver selection is required");
        }
        if (Objects.equals(requester.getId(), approver.getId())) {
            throw new InvalidDocumentException("You cannot approve your own upload");
        }
        if (requester.getRole() == Role.SYS_ADMIN) {
            return;
        }
        Set<UserGroup> requesterGroups = requester.getGroups();
        if (requesterGroups == null || requesterGroups.isEmpty()) {
            // Backward-compatible mode for setups without user-group assignments.
            return;
        }
        if (!sharesGroup(requester, approver)) {
            throw new InvalidDocumentException("Approver must belong to one of your groups");
        }
    }

    private List<ApproverOptionResponse> listAllApproverCandidates(AppUser requester) {
        try {
            return appUserRepository.findAll().stream()
                .filter(candidate -> candidate != null && !Objects.equals(candidate.getId(), requester.getId()))
                .sorted(Comparator.comparing(this::userSortKey, String.CASE_INSENSITIVE_ORDER))
                .map(this::toApproverOption)
                .toList();
        } catch (IOException ex) {
            throw new RuntimeException("Failed to list eligible approvers", ex);
        }
    }

    private void assertSupervisorEligible(AppUser requester, AppUser supervisor) {
        if (requester == null || supervisor == null) {
            throw new InvalidDocumentException("Supervisor selection is required");
        }
        // Supervisors can be selected across groups.
    }

    private boolean sharesGroup(AppUser first, AppUser second) {
        if (first == null || second == null) {
            return false;
        }
        Set<UserGroup> firstGroups = first.getGroups();
        if (firstGroups == null || firstGroups.isEmpty()) {
            return false;
        }
        Set<String> groupIds = firstGroups.stream()
            .map(UserGroup::getId)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
        if (groupIds.isEmpty()) {
            return false;
        }
        return second.getGroups() != null && second.getGroups().stream()
            .map(UserGroup::getId)
            .filter(Objects::nonNull)
            .anyMatch(groupIds::contains);
    }

    private void assertCanManageApproval(Document document, AppUser actor) {
        AppUser approver = document.getApprover();
        if (approver == null) {
            throw new InvalidDocumentException("Document does not have an assigned approver");
        }
        if (actor.getRole() == Role.SYS_ADMIN) {
            return;
        }
        if (!Objects.equals(approver.getId(), actor.getId())) {
            boolean reviewerStagePending = isReviewerStagePending(document, actor);
            boolean reviewerNoTaskFallback = isReviewerWithoutTaskFallback(document, actor);
            if (!reviewerStagePending && !reviewerNoTaskFallback) {
                log.warn(
                    "Approval authorization denied. docId={}, actorId={}, actorUsername={}, actorRole={}, approverId={}, approverUsername={}, reviewerId={}, reviewerUsername={}, tasks={}",
                    document.getId(),
                    actor.getId(),
                    actor.getUsername(),
                    actor.getRole(),
                    approver.getId(),
                    approver.getUsername(),
                    document.getReviewerId(),
                    document.getReviewer() != null ? document.getReviewer().getUsername() : null,
                    summarizeDocumentTasks(document)
                );
                throw new AccessDeniedException("Only the current assigned reviewer/approver may perform this action");
            }
        }
    }

    private void assertCanResubmitApproval(Document document, AppUser actor) {
        if (document == null || actor == null) {
            throw new AccessDeniedException("Only the uploader may resubmit this document");
        }
        if (document.getStatus() != DocumentStatus.REJECTED) {
            throw new InvalidDocumentException("Only rejected documents can be resubmitted");
        }
        String owner = StringUtils.hasText(document.getOwner()) ? document.getOwner().trim() : null;
        String username = StringUtils.hasText(actor.getUsername()) ? actor.getUsername().trim() : null;
        if (!StringUtils.hasText(owner) || !StringUtils.hasText(username) || !owner.equalsIgnoreCase(username)) {
            throw new AccessDeniedException("Only the uploader may resubmit this document");
        }
    }

    private boolean isReviewerStageApproval(Document document, AppUser actor) {
        if (document == null || actor == null) {
            return false;
        }
        AppUser approver = document.getApprover();
        return (approver == null || !Objects.equals(approver.getId(), actor.getId()))
            && (isReviewerStagePending(document, actor) || isReviewerWithoutTaskFallback(document, actor));
    }

    private boolean isReviewerStagePending(Document document, AppUser actor) {
        if (document == null || actor == null || !StringUtils.hasText(document.getId())) {
            return false;
        }
        try {
            List<UserTask> linkedTasks = userTaskRepository.findByDocumentId(document.getId());
            boolean hasAssignedActiveReviewTask = linkedTasks.stream()
                .filter(Objects::nonNull)
                .filter(task -> task.getTaskType() == TaskType.APPROVAL || task.getTaskType() == TaskType.WORKFLOW)
                .anyMatch(task -> isActiveApprovalTask(task) && isTaskAssignedToActor(task, actor));
            if (hasAssignedActiveReviewTask) {
                return true;
            }

            Optional<UserTask> taskOpt = resolveApprovalTask(document);
            if (taskOpt.isPresent()) {
                UserTask task = taskOpt.get();
                if (isActiveApprovalTask(task) && isTaskAssignedToActor(task, actor)) {
                    return true;
                }
            }

            // Compatibility fallback: for workflow-driven reviewer steps, the pending task may be WORKFLOW.
            Optional<UserTask> workflowTaskOpt = resolveWorkflowTask(document);
            if (workflowTaskOpt.isPresent()) {
                UserTask workflowTask = workflowTaskOpt.get();
                return isActiveApprovalTask(workflowTask) && isTaskAssignedToActor(workflowTask, actor);
            }
            return false;
        } catch (IOException ex) {
            log.warn("Failed to resolve reviewer-stage approval task for document {}", document.getId(), ex);
            return false;
        }
    }

    private String summarizeDocumentTasks(Document document) {
        if (document == null || !StringUtils.hasText(document.getId())) {
            return "[]";
        }
        try {
            return userTaskRepository.findByDocumentId(document.getId()).stream()
                .map(this::formatTaskForLog)
                .collect(Collectors.joining(", ", "[", "]"));
        } catch (IOException ex) {
            return "[error=" + ex.getMessage() + "]";
        }
    }

    private String formatTaskForLog(UserTask task) {
        if (task == null) {
            return "null";
        }
        return "{id=" + task.getId()
            + ",type=" + task.getTaskType()
            + ",status=" + task.getStatus()
            + ",assigneeId=" + task.getAssigneeId()
            + ",assigneeUsername=" + task.getAssigneeUsername()
            + "}";
    }

    private boolean isTaskAssignedToActor(UserTask task, AppUser actor) {
        if (task == null || actor == null) {
            return false;
        }
        if (StringUtils.hasText(task.getAssigneeId()) && task.getAssigneeId().trim().equals(actor.getId())) {
            return true;
        }
        String actorUsername = StringUtils.hasText(actor.getUsername()) ? actor.getUsername().trim() : null;
        String assigneeUsername = StringUtils.hasText(task.getAssigneeUsername()) ? task.getAssigneeUsername().trim() : null;
        return StringUtils.hasText(actorUsername)
            && StringUtils.hasText(assigneeUsername)
            && assigneeUsername.equalsIgnoreCase(actorUsername);
    }

    private boolean isActiveApprovalTask(UserTask task) {
        if (task == null || task.getStatus() == null) {
            return false;
        }
        return task.getStatus() == TaskStatus.PENDING
            || task.getStatus() == TaskStatus.IN_PROGRESS
            || task.getStatus() == TaskStatus.BLOCKED;
    }

    private boolean isReviewerWithoutTaskFallback(Document document, AppUser actor) {
        if (document == null || actor == null || document.getStatus() != DocumentStatus.DRAFT) {
            return false;
        }
        if (!isDocumentReviewer(document, actor)) {
            return false;
        }
        try {
            return userTaskRepository.findByDocumentId(document.getId()).stream()
                .filter(Objects::nonNull)
                .noneMatch(task -> task.getTaskType() == TaskType.APPROVAL || task.getTaskType() == TaskType.WORKFLOW);
        } catch (IOException ex) {
            return false;
        }
    }

    private boolean isDocumentReviewer(Document document, AppUser actor) {
        if (document == null || actor == null) {
            return false;
        }
        if (StringUtils.hasText(document.getReviewerId()) && document.getReviewerId().trim().equals(actor.getId())) {
            return true;
        }
        String actorUsername = StringUtils.hasText(actor.getUsername()) ? actor.getUsername().trim() : null;
        if (!StringUtils.hasText(actorUsername)) {
            return false;
        }
        if (document.getReviewer() != null && StringUtils.hasText(document.getReviewer().getUsername())
            && document.getReviewer().getUsername().trim().equalsIgnoreCase(actorUsername)) {
            return true;
        }
        return false;
    }

    private boolean isAwaitingApproval(Document document) {
        if (document == null || document.getStatus() == null) {
            return false;
        }
        return document.getStatus() == DocumentStatus.DRAFT || document.getStatus() == DocumentStatus.REVIEWED;
    }

    private void appendApprovalNote(Document document, AppUser author, String rawNote, Instant createdAt) {
        if (!StringUtils.hasText(rawNote)) {
            return;
        }
        DocumentApprovalNote note = new DocumentApprovalNote();
        note.setAuthor(author);
        note.setNote(rawNote.trim());
        note.setCreatedAt(createdAt);
        document.addApprovalNote(note);
    }

    private void createApprovalTask(Document document, AppUser approver, Instant now) {
        try {
            if (document.getId() == null || approver == null) {
                return;
            }
            if (resolveApprovalTask(document).isPresent()) {
                return;
            }
            UserTask task = new UserTask();
            task.setTitle("Approve \"" + document.getTitle() + "\"");
            task.setDescription("Review the document details, add notes, and record a decision.");
            task.setStatus(TaskStatus.PENDING);
            task.setPriority(TaskPriority.NORMAL);
            task.setTaskType(TaskType.APPROVAL);
            task.setWorkflowStep("Awaiting approval");
            task.setDocumentId(document.getId());
            task.setDocumentTitle(document.getTitle());
            task.setDueDate(LocalDate.now(clock).plusDays(2));
            task.setAssignee(approver);
            task.setAssigneeId(approver.getId());
            task.setAssigneeUsername(approver.getUsername());
            task.setCreatedAt(now);
            task.setUpdatedAt(now);
            userTaskRepository.save(task);
        } catch (IOException ex) {
            log.warn("Failed to create approval task", ex);
        }
    }

    private void reassignApprovalTask(Document document, AppUser delegate, Instant timestamp) {
        try {
            Optional<UserTask> existing = resolveApprovalTask(document);
            if (existing.isEmpty()) {
                createApprovalTask(document, delegate, timestamp);
                return;
            }
            UserTask task = existing.get();
            task.setAssignee(delegate);
            task.setAssigneeId(delegate.getId());
            task.setAssigneeUsername(delegate.getUsername());
            task.setStatus(TaskStatus.PENDING);
            task.setWorkflowStep("Awaiting approval (delegated)");
            task.setUpdatedAt(timestamp);
            userTaskRepository.save(task);
        } catch (IOException ex) {
            log.warn("Failed to reassign approval task", ex);
        }
    }

    private String buildDelegationNote(AppUser delegate, String rawNote) {
        String delegateName = StringUtils.hasText(delegate.getDisplayName())
            ? delegate.getDisplayName()
            : delegate.getUsername();
        String baseNote = "Delegated approval to " + delegateName + ".";
        if (!StringUtils.hasText(rawNote)) {
            return baseNote;
        }
        return baseNote + " " + rawNote.trim();
    }

    private void completeApprovalTask(Document document, TaskStatus status, String workflowStep, Instant timestamp) {
        try {
            resolveApprovalTask(document).ifPresent(task -> {
                try {
                    task.setStatus(status);
                    task.setWorkflowStep(workflowStep);
                    task.setUpdatedAt(timestamp);
                    userTaskRepository.save(task);
                } catch (IOException ex) {
                    log.warn("Failed to complete approval task", ex);
                }
            });
        } catch (IOException ex) {
            log.warn("Failed to resolve approval task", ex);
        }
    }

    private void closeActorReviewTasks(Document document, AppUser actor, String workflowStep, Instant timestamp) {
        if (document == null || actor == null || !StringUtils.hasText(document.getId())) {
            return;
        }
        try {
            for (UserTask task : userTaskRepository.findByDocumentId(document.getId())) {
                if (task == null || !isActiveApprovalTask(task)) {
                    continue;
                }
                if (task.getTaskType() != TaskType.APPROVAL && task.getTaskType() != TaskType.WORKFLOW) {
                    continue;
                }
                boolean isActorOwnedReviewTask = isTaskAssignedToActor(task, actor)
                    || (task.getTaskType() == TaskType.WORKFLOW && isDocumentReviewer(document, actor));
                if (!isActorOwnedReviewTask) {
                    continue;
                }
                try {
                    task.setStatus(TaskStatus.COMPLETED);
                    task.setWorkflowStep(workflowStep);
                    task.setUpdatedAt(timestamp);
                    userTaskRepository.save(task);
                } catch (IOException ex) {
                    log.warn("Failed to close actor review task {} for document {}", task.getId(), document.getId(), ex);
                }
            }
        } catch (IOException ex) {
            log.warn("Failed to resolve actor review tasks for document {}", document.getId(), ex);
        }
    }

    private void completeReviewTasks(Document document, TaskStatus status, String workflowStep, Instant timestamp) {
        if (document == null || !StringUtils.hasText(document.getId())) {
            return;
        }
        try {
            for (UserTask task : userTaskRepository.findByDocumentId(document.getId())) {
                if (task == null || !isActiveApprovalTask(task)) {
                    continue;
                }
                if (task.getTaskType() != TaskType.APPROVAL && task.getTaskType() != TaskType.WORKFLOW) {
                    continue;
                }
                try {
                    task.setStatus(status);
                    task.setWorkflowStep(workflowStep);
                    task.setUpdatedAt(timestamp);
                    userTaskRepository.save(task);
                } catch (IOException ex) {
                    log.warn("Failed to complete review task {} for document {}", task.getId(), document.getId(), ex);
                }
            }
        } catch (IOException ex) {
            log.warn("Failed to resolve review tasks for document {}", document.getId(), ex);
        }
    }

    private void cancelLinkedTasks(Document document, String workflowStep, Instant timestamp) {
        if (document == null || !StringUtils.hasText(document.getId())) {
            return;
        }

        try {
            for (UserTask task : userTaskRepository.findByDocumentId(document.getId())) {
                try {
                    task.setStatus(TaskStatus.CANCELLED);
                    task.setWorkflowStep(workflowStep);
                    task.setUpdatedAt(timestamp);
                    userTaskRepository.save(task);
                } catch (IOException ex) {
                    log.warn("Failed to cancel linked task {} for document {}", task.getId(), document.getId(), ex);
                }
            }
        } catch (IOException ex) {
            log.warn("Failed to resolve linked tasks for document {}", document.getId(), ex);
        }
    }

    private void syncApprovalTaskMetadata(Document document) {
        try {
            resolveApprovalTask(document).ifPresent(task -> {
                try {
                    task.setDocumentTitle(document.getTitle());
                    userTaskRepository.save(task);
                } catch (IOException ex) {
                    log.warn("Failed to sync approval task metadata", ex);
                }
            });
        } catch (IOException ex) {
            log.warn("Failed to resolve approval task", ex);
        }
    }

    private Optional<UserTask> resolveApprovalTask(Document document) throws IOException {
        if (document == null || document.getId() == null) {
            return Optional.empty();
        }
        return userTaskRepository.findByDocumentIdAndTaskType(String.valueOf(document.getId()), TaskType.APPROVAL);
    }

    private Optional<UserTask> resolveWorkflowTask(Document document) throws IOException {
        if (document == null || document.getId() == null) {
            return Optional.empty();
        }
        return userTaskRepository.findByDocumentIdAndTaskType(String.valueOf(document.getId()), TaskType.WORKFLOW);
    }

    private Optional<UserTask> resolveRejectionTask(Document document) throws IOException {
        if (document == null || document.getId() == null) {
            return Optional.empty();
        }
        return userTaskRepository.findByDocumentIdAndTaskType(String.valueOf(document.getId()), TaskType.REJECTION);
    }

    private ApproverOptionResponse toApproverOption(AppUser candidate) {
        List<GroupSummary> groups = candidate.getGroups() == null
            ? List.of()
            : candidate.getGroups().stream()
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(group -> nullSafe(group.getName()), String.CASE_INSENSITIVE_ORDER))
                .map(group -> new GroupSummary(group.getId(), group.getName()))
                .toList();
        return new ApproverOptionResponse(candidate.getId(), candidate.getUsername(), candidate.getDisplayName(), groups);
    }

    private String userSortKey(AppUser candidate) {
        if (candidate == null) {
            return "";
        }
        if (StringUtils.hasText(candidate.getDisplayName())) {
            return candidate.getDisplayName();
        }
        if (StringUtils.hasText(candidate.getUsername())) {
            return candidate.getUsername();
        }
        return nullSafe(candidate.getId());
    }

    private String nullSafe(String value) {
        return value == null ? "" : value;
    }

    private DocumentApprovalInfo toApprovalInfo(Document document) {
        String uploaderUsername = StringUtils.hasText(document.getOwner()) ? document.getOwner().trim() : null;
        AppUser uploader = null;
        if (StringUtils.hasText(uploaderUsername)) {
            uploader = appUserRepository.findByUsernameIgnoreCaseWithFallback(uploaderUsername).orElse(null);
        }

        String reviewerId = StringUtils.hasText(document.getReviewerId()) ? document.getReviewerId().trim() : null;
        AppUser reviewer = document.getReviewer();
        if (reviewer == null && StringUtils.hasText(reviewerId)) {
            try {
                reviewer = appUserRepository.findById(reviewerId).orElse(null);
            } catch (IOException ex) {
                log.debug("Failed to resolve reviewer {} from document {}", reviewerId, document.getId(), ex);
            }
        }
        if (StringUtils.hasText(document.getId())) {
            List<WorkflowInstance> instances = workflowService.listDocumentInstances(document.getId());
            WorkflowInstance latest = (instances == null || instances.isEmpty()) ? null : instances.get(0);
            String instanceReviewerId = latest != null && StringUtils.hasText(latest.getReviewerId()) ? latest.getReviewerId().trim() : null;
            if (!StringUtils.hasText(reviewerId) && StringUtils.hasText(instanceReviewerId)) {
                reviewerId = instanceReviewerId;
            }
            if (reviewer == null && StringUtils.hasText(reviewerId)) {
                try {
                    reviewer = appUserRepository.findById(reviewerId).orElse(null);
                } catch (IOException ex) {
                    log.debug("Failed to resolve reviewer {} for document {}", reviewerId, document.getId(), ex);
                }
            }
        }

        if (reviewer == null) {
            try {
                Optional<UserTask> workflowTask = resolveWorkflowTask(document);
                if (workflowTask.isPresent()) {
                    UserTask task = workflowTask.get();
                    if (!StringUtils.hasText(reviewerId) && StringUtils.hasText(task.getAssigneeId())) {
                        reviewerId = task.getAssigneeId().trim();
                    }
                    if (StringUtils.hasText(task.getAssigneeUsername())) {
                        reviewer = appUserRepository.findByUsernameIgnoreCaseWithFallback(task.getAssigneeUsername().trim()).orElse(null);
                    }
                    if (reviewer == null && StringUtils.hasText(reviewerId)) {
                        try {
                            reviewer = appUserRepository.findById(reviewerId).orElse(null);
                        } catch (IOException ex) {
                            log.debug("Failed to resolve reviewer {} from workflow task for document {}", reviewerId, document.getId(), ex);
                        }
                    }
                }
            } catch (IOException ex) {
                log.debug("Failed to resolve workflow task reviewer for document {}", document.getId(), ex);
            }
        }

        AppUser approver = document.getApprover();
        if (approver == null && uploader == null && reviewer == null && !StringUtils.hasText(reviewerId)) {
            return null;
        }
        return new DocumentApprovalInfo(
            uploader != null ? uploader.getUsername() : uploaderUsername,
            uploader != null ? uploader.getDisplayName() : null,
            reviewerId,
            reviewer != null ? reviewer.getUsername() : null,
            reviewer != null ? reviewer.getDisplayName() : null,
            approver != null ? approver.getId() : null,
            approver != null ? approver.getUsername() : null,
            approver != null ? approver.getDisplayName() : null,
            document.getApprovalRequestedAt(),
            document.getApprovalDecidedAt()
        );
    }

    private List<DocumentApprovalNoteResponse> toApprovalNotes(Document document) {
        List<DocumentApprovalNote> notes = document.getApprovalNotes();
        if (notes == null || notes.isEmpty()) {
            return List.of();
        }
        return notes.stream()
            .sorted(Comparator.comparing(DocumentApprovalNote::getCreatedAt))
            .map(note -> {
                AppUser author = note.getAuthor();
                return new DocumentApprovalNoteResponse(
                    note.getId(),
                    author != null ? author.getId() : null,
                    author != null ? author.getUsername() : null,
                    author != null ? author.getDisplayName() : null,
                    note.getNote(),
                    note.getCreatedAt()
                );
            })
            .toList();
    }

    private AppUser requireUser(String username) {
        if (!StringUtils.hasText(username)) {
            throw new AccessDeniedException("Authentication required");
        }
        return appUserRepository.findByUsernameIgnoreCaseWithFallback(username)
            .orElseThrow(() -> new AccessDeniedException("User not found"));
    }

    private void assertCanRead(DocumentFolder folder, AppUser user) {
        if (!folderPermissionEvaluator.canRead(folder, user)) {
            throw new AccessDeniedException("You do not have read permission for this folder");
        }
    }

    private void assertCanWrite(DocumentFolder folder, AppUser user) {
        if (!folderPermissionEvaluator.canWrite(folder, user)) {
            throw new AccessDeniedException("You do not have write permission for this folder");
        }
    }

    private void assertCanDelete(DocumentFolder folder, AppUser user) {
        if (!folderPermissionEvaluator.canDelete(folder, user)) {
            throw new AccessDeniedException("You do not have delete permission for this folder");
        }
    }

    private Set<String> resolveReadableFolderIds(AppUser user) {
        try {
            return documentFolderRepository.findAll().stream()
                .filter(folder -> folderPermissionEvaluator.canRead(folder, user))
                .map(DocumentFolder::getId)
                .filter(Objects::nonNull)
                .map(String::valueOf)
                .collect(Collectors.toSet());
        } catch (IOException ex) {
            throw new RuntimeException("Failed to resolve readable folder IDs", ex);
        }
    }

    private MultipartFile requireFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new InvalidDocumentException("A non-empty file is required");
        }
        if (file.getSize() > maxUploadBytes) {
            long maxUploadMb = Math.max(1L, maxUploadBytes / (1024L * 1024L));
            throw new InvalidDocumentException("Files larger than " + maxUploadMb + " MB are not allowed");
        }
        return file;
    }

    private DocumentVersion buildVersion(Document document, MultipartFile file, Instant createdAt, int versionNumber) {
        DocumentVersion version = new DocumentVersion();
        version.setId(UUID.randomUUID().toString());
        version.setDocument(document);
        if (document != null && StringUtils.hasText(document.getId())) {
            version.setDocumentId(document.getId());
        }
        version.setVersionNumber(versionNumber);
        version.setFileName(Optional.ofNullable(file.getOriginalFilename()).orElse("document"));
        version.setContentType(file.getContentType());
        version.setSizeBytes(file.getSize());
        version.setCreatedAt(createdAt);
        try {
            version.setContent(file.getBytes());
        } catch (IOException ex) {
            throw new InvalidDocumentException("Failed to read document content");
        }
        return version;
    }

    private void indexLatestAttachment(Document document) {
        if (document == null || document.getVersions() == null || document.getVersions().isEmpty()) {
            return;
        }
        DocumentVersion latestVersion = document.getVersions().stream()
            .max(Comparator.comparingInt(DocumentVersion::getVersionNumber))
            .orElse(null);
        if (latestVersion != null) {
            documentAttachmentIndexingService.indexAttachment(document, latestVersion);
        }
    }

    private void removeIndexedAttachments(Document document) {
        if (document == null || document.getVersions() == null || document.getVersions().isEmpty()) {
            return;
        }
        for (DocumentVersion version : document.getVersions()) {
            if (version != null && StringUtils.hasText(version.getId())) {
                documentAttachmentIndexingService.deleteAttachmentByVersionId(version.getId());
            }
        }
    }

    private boolean repairDocumentIdentifiers(Document document) {
        boolean changed = false;
        if (!StringUtils.hasText(document.getId())) {
            document.setId(UUID.randomUUID().toString());
            changed = true;
        }

        if (document.getVersions() != null) {
            for (DocumentVersion version : document.getVersions()) {
                if (!StringUtils.hasText(version.getId())) {
                    version.setId(UUID.randomUUID().toString());
                    changed = true;
                }
                if (!StringUtils.hasText(version.getDocumentId())) {
                    version.setDocumentId(document.getId());
                    changed = true;
                }
                if (version.getDocument() == null) {
                    version.setDocument(document);
                }
            }
        }

        if (document.getApprovalNotes() != null) {
            for (DocumentApprovalNote note : document.getApprovalNotes()) {
                if (!StringUtils.hasText(note.getId())) {
                    note.setId(UUID.randomUUID().toString());
                    changed = true;
                }
                if (!StringUtils.hasText(note.getDocumentId())) {
                    note.setDocumentId(document.getId());
                    changed = true;
                }
            }
        }

        return changed;
    }

    private Set<String> normalizeTags(Set<String> tags) {
        return Optional.ofNullable(tags)
            .orElse(Set.of())
            .stream()
            .map(tag -> tag.trim().toLowerCase(Locale.ROOT))
            .filter(StringUtils::hasText)
            .collect(Collectors.toSet());
    }

    private DocumentSummaryResponse toSummary(Document document) {
        DocumentVersion latest = document.getVersions().stream()
            .max(Comparator.comparingInt(DocumentVersion::getVersionNumber))
            .orElse(null);

        int latestVersion = latest != null ? latest.getVersionNumber() : 0;
        long size = latest != null ? latest.getSizeBytes() : 0L;
        String latestFileName = latest != null ? latest.getFileName() : null;

        return new DocumentSummaryResponse(
            document.getId(),
            document.getTitle(),
            document.getOwner(),
            supervisorLabel(document),
            document.getCategory(),
            document.getCategoryCode(),
            document.getCategoryLabel(),
            document.getStatus(),
            calculateConfidenceScore(document),
            detachTags(document),
            toFolderInfo(document.getFolder()),
            latestVersion,
            size,
            latestFileName,
            document.getUpdatedAt(),
            Boolean.TRUE.equals(document.getIsOcr()),
            document.getOcrStatus(),
            document.getOcrStatusMessage(),
            document.getOcrStatusUpdatedAt()
        );
    }

    private DocumentDetailsResponse toDetails(Document document) {
        var versions = document.getVersions().stream()
            .sorted(Comparator.comparingInt(DocumentVersion::getVersionNumber).reversed())
            .map(this::toVersionResponse)
            .toList();

        return new DocumentDetailsResponse(
            document.getId(),
            document.getTitle(),
            document.getDescription(),
            document.getOwner(),
            supervisorLabel(document),
            document.getCategory(),
            document.getCategoryCode(),
            document.getCategoryLabel(),
            document.getStatus(),
            calculateConfidenceScore(document),
            detachTags(document),
            detachMetadata(document),
            toFolderInfo(document.getFolder()),
            document.getCreatedAt(),
            document.getUpdatedAt(),
            Boolean.TRUE.equals(document.getIsOcr()),
            document.getOcrStatus(),
            document.getOcrStatusMessage(),
            document.getOcrStatusUpdatedAt(),
            versions,
            toApprovalInfo(document),
            toApprovalNotes(document)
        );
    }

    private int calculateConfidenceScore(Document document) {
        if (document == null) {
            return 0;
        }

        List<FolderMetadataField> template = document.getFolder() != null ? document.getFolder().getMetadataTemplate() : null;
        if (template == null || template.isEmpty()) {
            return 100;
        }

        Map<String, String> values = document.getMetadataValues();
        int filled = 0;
        for (FolderMetadataField field : template) {
            String value = values != null ? values.get(field.getKey()) : null;
            if (StringUtils.hasText(value)) {
                filled++;
            }
        }

        double ratio = (double) filled / (double) template.size();
        int score = (int) Math.round(ratio * 100.0d);
        return Math.max(0, Math.min(100, score));
    }

    private String resolveCategoryLabel(String categoryCode) {
        if (!StringUtils.hasText(categoryCode)) {
            return null;
        }
        try {
            return codeTableRepository.findByTableCode("CATEGORY").stream()
                .filter(item -> categoryCode.equalsIgnoreCase(item.getItemCode()))
                .map(CodeTableItem::getItemLabel)
                .findFirst()
                .orElse(null);
        } catch (Exception ex) {
            log.warn("Could not resolve category label for code '{}': {}", categoryCode, ex.getMessage());
            return null;
        }
    }

    private String supervisorLabel(Document document) {
        if (document == null) {
            return null;
        }
        if (document.getSupervisor() != null) {
            if (StringUtils.hasText(document.getSupervisor().getUsername())) {
                return document.getSupervisor().getUsername();
            }
            return document.getSupervisor().getId();
        }
        return document.getSupervisorId();
    }

    private DocumentFolder findFolder(String folderId) {
        try {
            if (folderId == null) {
                throw new InvalidDocumentException("Folder selection is required");
            }
            return documentFolderRepository.findById(folderId)
                .orElseThrow(() -> new ResourceNotFoundException("Folder not found"));
        } catch (IOException ex) {
            throw new RuntimeException("Failed to retrieve folder", ex);
        }
    }

    private DocumentFolder resolveFolderForAccess(Document document) {
        String folderId = null;
        if (document.getFolderId() != null && !document.getFolderId().isBlank()) {
            folderId = document.getFolderId();
        } else if (document.getFolder() != null && document.getFolder().getId() != null
            && !document.getFolder().getId().isBlank()) {
            folderId = document.getFolder().getId();
        }

        if (folderId != null) {
            return findFolder(folderId);
        }
        if (document.getFolder() != null) {
            return document.getFolder();
        }
        throw new ResourceNotFoundException("Folder not found for document");
    }

    private DocumentFolderInfo toFolderInfo(DocumentFolder folder) {
        if (folder == null) {
            return null;
        }
        var breadcrumbs = new ArrayList<String>();
        DocumentFolder current = folder;
        while (current != null) {
            breadcrumbs.add(current.getName());
            current = current.getParent();
        }
        Collections.reverse(breadcrumbs);
        return new DocumentFolderInfo(folder.getId(), folder.getName(), breadcrumbs, toFolderMetadataTemplate(folder));
    }

    private List<FolderMetadataFieldDto> toFolderMetadataTemplate(DocumentFolder folder) {
        if (folder == null) {
            return List.of();
        }
        List<FolderMetadataField> template = folder.getMetadataTemplate();
        if (template == null || template.isEmpty()) {
            return List.of();
        }
        return template.stream()
            .map(field -> new FolderMetadataFieldDto(
                field.getKey(),
                field.getLabel(),
                field.getType(),
                field.isRequired(),
                field.getHint(),
                field.getCodeTableCode()
            ))
            .toList();
    }

    private DocumentVersionResponse toVersionResponse(DocumentVersion version) {
        return new DocumentVersionResponse(
            version.getId(),
            version.getVersionNumber(),
            version.getFileName(),
            version.getSizeBytes(),
            version.getContentType(),
            version.getCreatedAt()
        );
    }

    private Set<String> detachTags(Document document) {
        Set<String> tags = document.getTags();
        if (tags == null || tags.isEmpty()) {
            return Set.of();
        }
        return tags.stream()
            .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private Map<String, String> detachMetadata(Document document) {
        Map<String, String> metadata = document.getMetadataValues();
        if (metadata == null || metadata.isEmpty()) {
            return Map.of();
        }
        return metadata.entrySet().stream()
            .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue, (a, b) -> a, LinkedHashMap::new));
    }

    private Map<String, String> resolveMetadataValues(DocumentFolder folder, Map<String, String> rawMetadata, Set<String> extraAllowedKeys) {
        Map<String, String> sanitizedInput = new HashMap<>();
        if (rawMetadata != null) {
            rawMetadata.forEach((key, value) -> {
                if (key != null) {
                    sanitizedInput.put(key.trim(), value);
                }
            });
        }

        Map<String, String> resolved = new LinkedHashMap<>();
        if (folder != null) {
            List<FolderMetadataField> template = folder.getMetadataTemplate();
            if (template != null && !template.isEmpty()) {
                for (FolderMetadataField field : template) {
                    String provided = sanitizedInput.get(field.getKey());
                    String normalized = normalizeMetadataValue(field, provided);
                    if (!StringUtils.hasText(normalized)) {
                        if (field.isRequired()) {
                            throw new InvalidDocumentException("Metadata field '" + field.getLabel() + "' is required for folder '" + folder.getName() + "'");
                        }
                    } else {
                        resolved.put(field.getKey(), normalized);
                    }
                }
            }
        }

        if (extraAllowedKeys != null && !extraAllowedKeys.isEmpty()) {
            for (String key : extraAllowedKeys) {
                if (!StringUtils.hasText(key)) {
                    continue;
                }
                String normalizedKey = key.trim();
                String rawValue = sanitizedInput.get(normalizedKey);
                if (rawValue == null) {
                    continue;
                }
                String normalizedValue = rawValue.trim();
                if (StringUtils.hasText(normalizedValue)) {
                    resolved.put(normalizedKey, normalizedValue);
                }
            }
        }

        copySystemDateMetadata(sanitizedInput, resolved);
        return resolved;
    }

    private Map<String, String> mergeSystemDateMetadata(Map<String, String> incomingMetadata, Map<String, String> existingMetadata) {
        Map<String, String> merged = new LinkedHashMap<>();
        if (incomingMetadata != null) {
            merged.putAll(incomingMetadata);
        }
        if (existingMetadata != null) {
            copySystemDateMetadata(existingMetadata, merged);
        }
        return merged;
    }

    public record VersionHousekeepingResult(
        int scannedDocumentIds,
        int orphanDocumentIds,
        int deletedRows,
        List<String> orphanIds,
        boolean dryRun,
        DocumentVersionRepository.VersionStorageHealth before,
        DocumentVersionRepository.VersionStorageHealth after
    ) {
    }

    private void copySystemDateMetadata(Map<String, String> source, Map<String, String> target) {
        copyIsoDateField(source, target, META_DOCUMENT_DATE);
        copyIsoDateField(source, target, META_EXPIRY_DATE);
        copyIsoDateField(source, target, META_APPROVAL_DATE);
        copyIsoDateField(source, target, META_ARCHIVE_DATE);
        copyIsoDateField(source, target, META_REMINDER_DATE);
    }

    private void copyIsoDateField(Map<String, String> source, Map<String, String> target, String key) {
        String rawValue = source.get(key);
        if (!StringUtils.hasText(rawValue)) {
            return;
        }
        try {
            target.put(key, LocalDate.parse(rawValue.trim()).toString());
        } catch (DateTimeParseException ex) {
            throw new InvalidDocumentException("Metadata field '" + key + "' must be a valid ISO-8601 date (YYYY-MM-DD)");
        }
    }

    private Map<String, String> applySystemDateMetadata(
        Map<String, String> currentMetadata,
        String documentDateRaw,
        String expiryDateRaw,
        Instant approvalDate,
        String reminderDateRaw
    ) {
        Map<String, String> next = new LinkedHashMap<>();
        if (currentMetadata != null) {
            next.putAll(currentMetadata);
        }

        LocalDate documentDate = parseRequiredDate(
            documentDateRaw,
            next.get(META_DOCUMENT_DATE),
            "Document date is required and must follow YYYY-MM-DD"
        );
        LocalDate expiryDate = parseRequiredDate(
            expiryDateRaw,
            next.get(META_EXPIRY_DATE),
            "Expiry date is required and must follow YYYY-MM-DD"
        );
        if (expiryDate.isBefore(documentDate)) {
            throw new InvalidDocumentException("Expiry date cannot be earlier than document date");
        }

        next.put(META_DOCUMENT_DATE, documentDate.toString());
        next.put(META_EXPIRY_DATE, expiryDate.toString());
        next.put(META_ARCHIVE_DATE, expiryDate.plusYears(7).toString());

        if (approvalDate != null) {
            next.put(META_APPROVAL_DATE, approvalDate.atZone(ZoneOffset.UTC).toLocalDate().toString());
        }
        if (StringUtils.hasText(reminderDateRaw)) {
            next.put(META_REMINDER_DATE, parseDate(reminderDateRaw, "Reminder date must follow YYYY-MM-DD").toString());
        }

        return next;
    }

    private LocalDate parseRequiredDate(String preferred, String fallback, String errorMessage) {
        if (StringUtils.hasText(preferred)) {
            return parseDate(preferred, errorMessage);
        }
        if (StringUtils.hasText(fallback)) {
            return parseDate(fallback, errorMessage);
        }
        throw new InvalidDocumentException(errorMessage);
    }

    private LocalDate parseDate(String rawValue, String errorMessage) {
        try {
            return LocalDate.parse(rawValue.trim());
        } catch (Exception ex) {
            throw new InvalidDocumentException(errorMessage);
        }
    }

    private String normalizeMetadataValue(FolderMetadataField field, String rawValue) {
        if (!StringUtils.hasText(rawValue)) {
            return null;
        }
        String trimmed = rawValue.trim();
        return switch (field.getType()) {
            case TEXT, DROPDOWN -> {
                if (trimmed.length() > 1024) {
                    throw new InvalidDocumentException("Metadata field '" + field.getLabel() + "' must be 1024 characters or fewer");
                }
                yield trimmed;
            }
            case NUMBER -> {
                try {
                    BigDecimal value = new BigDecimal(trimmed);
                    yield value.stripTrailingZeros().toPlainString();
                } catch (NumberFormatException ex) {
                    throw new InvalidDocumentException("Metadata field '" + field.getLabel() + "' must be a valid number");
                }
            }
            case DATE -> {
                try {
                    LocalDate date = LocalDate.parse(trimmed);
                    yield date.toString();
                } catch (DateTimeParseException ex) {
                    throw new InvalidDocumentException("Metadata field '" + field.getLabel() + "' must be a valid ISO-8601 date (YYYY-MM-DD)");
                }
            }
        };
    }
}
