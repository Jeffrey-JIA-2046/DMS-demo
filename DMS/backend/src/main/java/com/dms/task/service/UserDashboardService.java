package com.dms.task.service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import com.dms.document.dto.DocumentApprovalDecisionRequest;
import com.dms.document.dto.DocumentApprovalInfo;
import com.dms.document.dto.DocumentDetailsResponse;
import com.dms.document.model.DocumentFolder;
import com.dms.document.repository.DocumentFolderRepository;
import com.dms.document.service.FolderPermissionEvaluator;
import com.dms.document.service.DocumentService;
import com.dms.document.model.DocumentStatus;
import com.dms.task.dto.FavoriteItemResponse;
import com.dms.task.dto.FavoriteToggleRequest;
import com.dms.task.dto.TaskItemResponse;
import com.dms.task.dto.UserDashboardResponse;
import com.dms.task.model.FavoriteTargetType;
import com.dms.task.model.TaskStatus;
import com.dms.task.model.TaskType;
import com.dms.task.model.UserTask;
import com.dms.task.model.UserFavorite;
import com.dms.task.repository.UserFavoriteRepository;
import com.dms.task.repository.UserTaskRepository;
import com.dms.user.model.AppUser;
import com.dms.user.repository.AppUserRepository;

@Service
@Transactional(readOnly = true)
public class UserDashboardService {

    private final UserTaskRepository userTaskRepository;
    private final UserFavoriteRepository userFavoriteRepository;
    private final AppUserRepository appUserRepository;
    private final DocumentService documentService;
    private final DocumentFolderRepository documentFolderRepository;
    private final FolderPermissionEvaluator folderPermissionEvaluator;
    private final Clock clock;

    public UserDashboardService(
        UserTaskRepository userTaskRepository,
        UserFavoriteRepository userFavoriteRepository,
        AppUserRepository appUserRepository,
        DocumentService documentService,
        DocumentFolderRepository documentFolderRepository,
        FolderPermissionEvaluator folderPermissionEvaluator,
        Clock clock
    ) {
        this.userTaskRepository = userTaskRepository;
        this.userFavoriteRepository = userFavoriteRepository;
        this.appUserRepository = appUserRepository;
        this.documentService = documentService;
        this.documentFolderRepository = documentFolderRepository;
        this.folderPermissionEvaluator = folderPermissionEvaluator;
        this.clock = clock;
    }

    public UserDashboardResponse buildDashboardFor(String username) {
        AppUser user = requireDashboardUser(username);
        List<TaskItemResponse> tasks;
        try {
            tasks = userTaskRepository
                .findByAssigneeUsernameIgnoreCaseOrderByDueDateAsc(user.getUsername())
                .stream()
                .filter(this::excludeOrphanedDocumentTasks)
                .filter(task -> excludeNonActionableReviewTasks(task, user.getUsername()))
                .map(this::toResponse)
                .toList();
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to build dashboard tasks", ex);
        }

        List<FavoriteItemResponse> favorites = buildFavoritesFor(user);
        Instant generatedAt = Instant.now(clock);
        return new UserDashboardResponse(generatedAt, tasks, favorites);
    }

    @Transactional
    public void addFavorite(String username, FavoriteToggleRequest request) {
        AppUser user = requireDashboardUser(username);
        FavoriteTargetType targetType = parseFavoriteTargetType(request.targetType());
        String targetId = normalizeTargetId(request.targetId());

        validateFavoriteTarget(user, targetType, targetId);
        try {
            userFavoriteRepository.upsert(user.getUsername(), targetType, targetId, Instant.now(clock));
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to save favorite", ex);
        }
    }

    @Transactional
    public void removeFavorite(String username, String targetType, String targetId) {
        AppUser user = requireDashboardUser(username);
        FavoriteTargetType resolvedType = parseFavoriteTargetType(targetType);
        String resolvedTargetId = normalizeTargetId(targetId);
        try {
            userFavoriteRepository.delete(user.getUsername(), resolvedType, resolvedTargetId);
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to remove favorite", ex);
        }
    }

    private List<FavoriteItemResponse> buildFavoritesFor(AppUser user) {
        try {
            List<UserFavorite> favorites = userFavoriteRepository.findByUsernameOrderByCreatedAtDesc(user.getUsername());
            if (favorites.isEmpty()) {
                return List.of();
            }

            List<DocumentFolder> folders = documentFolderRepository.findAll();
            Map<String, DocumentFolder> folderById = new HashMap<>();
            for (DocumentFolder folder : folders) {
                if (folder != null && StringUtils.hasText(folder.getId())) {
                    folderById.put(folder.getId(), folder);
                }
            }

            List<FavoriteItemResponse> items = new ArrayList<>();
            for (UserFavorite favorite : favorites) {
                FavoriteItemResponse item = toFavoriteItem(favorite, user, folderById);
                if (item != null) {
                    items.add(item);
                }
            }
            return items;
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to build dashboard favorites", ex);
        }
    }

    private FavoriteItemResponse toFavoriteItem(UserFavorite favorite, AppUser user, Map<String, DocumentFolder> folderById) {
        if (favorite == null || favorite.getTargetType() == null || !StringUtils.hasText(favorite.getTargetId())) {
            return null;
        }

        try {
            if (favorite.getTargetType() == FavoriteTargetType.DOCUMENT) {
                DocumentDetailsResponse document = documentService.getDocument(favorite.getTargetId(), user.getUsername());
                String subtitle = document.folder() != null && document.folder().breadcrumbs() != null && !document.folder().breadcrumbs().isEmpty()
                    ? String.join(" / ", document.folder().breadcrumbs())
                    : "No folder";
                return new FavoriteItemResponse(
                    FavoriteTargetType.DOCUMENT.name(),
                    favorite.getTargetId(),
                    document.title(),
                    subtitle,
                    favorite.getCreatedAt()
                );
            }

            DocumentFolder folder = folderById.get(favorite.getTargetId());
            if (folder == null) {
                removeInvalidFavorite(user.getUsername(), favorite);
                return null;
            }
            if (!folderPermissionEvaluator.canRead(folder, user)) {
                return null;
            }

            return new FavoriteItemResponse(
                FavoriteTargetType.FOLDER.name(),
                favorite.getTargetId(),
                folder.getName(),
                buildFolderPath(folder, folderById),
                favorite.getCreatedAt()
            );
        } catch (Exception ex) {
            if (favorite.getTargetType() == FavoriteTargetType.DOCUMENT) {
                removeInvalidFavorite(user.getUsername(), favorite);
            }
            return null;
        }
    }

    private String buildFolderPath(DocumentFolder folder, Map<String, DocumentFolder> folderById) {
        List<String> segments = new ArrayList<>();
        DocumentFolder cursor = folder;
        while (cursor != null && StringUtils.hasText(cursor.getName())) {
            segments.add(0, cursor.getName());
            String parentId = cursor.getParentId();
            if (!StringUtils.hasText(parentId) && cursor.getParent() != null) {
                parentId = cursor.getParent().getId();
            }
            if (!StringUtils.hasText(parentId)) {
                break;
            }
            cursor = folderById.get(parentId);
        }
        return segments.isEmpty() ? folder.getName() : String.join(" / ", segments);
    }

    private void removeInvalidFavorite(String username, UserFavorite favorite) {
        try {
            userFavoriteRepository.delete(username, favorite.getTargetType(), favorite.getTargetId());
        } catch (java.io.IOException ignored) {
            // Ignore cleanup failures to keep dashboard response resilient.
        }
    }

    private void validateFavoriteTarget(AppUser user, FavoriteTargetType targetType, String targetId) {
        if (targetType == FavoriteTargetType.DOCUMENT) {
            documentService.getDocument(targetId, user.getUsername());
            return;
        }
        try {
            DocumentFolder folder = documentFolderRepository.findById(targetId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Folder not found"));
            if (!folderPermissionEvaluator.canRead(folder, user)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have access to this folder");
            }
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to validate favorite folder", ex);
        }
    }

    private FavoriteTargetType parseFavoriteTargetType(String rawType) {
        if (!StringUtils.hasText(rawType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Favorite target type is required");
        }
        try {
            return FavoriteTargetType.valueOf(rawType.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported favorite target type");
        }
    }

    private String normalizeTargetId(String targetId) {
        if (!StringUtils.hasText(targetId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Favorite target ID is required");
        }
        return targetId.trim();
    }

    private AppUser requireDashboardUser(String username) {
        if (!StringUtils.hasText(username)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        return appUserRepository.findByUsernameIgnoreCaseWithFallback(username)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }

    @Transactional
    public void approveRetentionTask(String taskId, DocumentApprovalDecisionRequest request, String username) {
        UserTask task = requireAssignedRetentionTask(taskId, username);
        Instant now = Instant.now(clock);

        String note = request != null ? request.note() : null;
        task.setStatus(TaskStatus.COMPLETED);
        task.setWorkflowStep("Retention disposal approved");
        task.setDescription(buildTaskDescription(task.getDescription(), "Approved", note));
        task.setUpdatedAt(now);

        LocalDate disposalDate = LocalDate.now(clock.withZone(ZoneOffset.UTC));
        documentService.disposeDocumentByRetention(task.getDocumentId(), disposalDate, "manual-supervisor-approval");
        saveTask(task, "Failed to complete retention approval task");
    }

    @Transactional
    public void rejectRetentionTask(String taskId, DocumentApprovalDecisionRequest request, String username) {
        UserTask task = requireAssignedRetentionTask(taskId, username);
        Instant now = Instant.now(clock);

        String note = request != null ? request.note() : null;
        task.setStatus(TaskStatus.COMPLETED);
        task.setWorkflowStep("Retention disposal rejected");
        task.setDescription(buildTaskDescription(task.getDescription(), "Rejected", note));
        task.setUpdatedAt(now);
        saveTask(task, "Failed to complete retention rejection task");
    }

    @Transactional
    public void delegateRetentionTask(String taskId, DocumentApprovalDecisionRequest request, String username) {
        UserTask task = requireAssignedRetentionTask(taskId, username);
        if (request == null || !StringUtils.hasText(request.approverId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A delegate user is required");
        }

        AppUser delegate = requireUser(request.approverId().trim());
        if (!StringUtils.hasText(delegate.getUsername())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Delegate user is invalid");
        }
        if (delegate.getUsername().equalsIgnoreCase(username)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot delegate to yourself");
        }

        Instant now = Instant.now(clock);
        task.setAssignee(delegate);
        task.setStatus(TaskStatus.PENDING);
        task.setWorkflowStep("Retention due - delegated");
        task.setDescription(buildTaskDescription(task.getDescription(), "Delegated to " + delegate.getUsername(), request.note()));
        task.setUpdatedAt(now);
        saveTask(task, "Failed to delegate retention task");
    }

    private TaskItemResponse toResponse(UserTask task) {
        return new TaskItemResponse(
            task.getId(),
            task.getTitle(),
            task.getDescription(),
            task.getStatus(),
            task.getPriority(),
            task.getTaskType(),
            task.getDueDate(),
            task.getWorkflowStep(),
            task.getDocumentId(),
            task.getDocumentTitle(),
            task.getCreatedAt(),
            task.getUpdatedAt()
        );
    }

    private UserTask requireAssignedRetentionTask(String taskId, String username) {
        if (!StringUtils.hasText(taskId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Task ID is required");
        }
        if (!StringUtils.hasText(username)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }

        UserTask task;
        try {
            task = userTaskRepository.findById(taskId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Task not found"));
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to load task", ex);
        }

        if (task.getTaskType() != TaskType.RETENTION) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Task is not a retention task");
        }
        if (!isActiveTaskStatus(task.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Retention task is already closed");
        }

        String assigneeUsername = task.getAssigneeUsername();
        if (!StringUtils.hasText(assigneeUsername) && task.getAssignee() != null) {
            assigneeUsername = task.getAssignee().getUsername();
        }
        if (!StringUtils.hasText(assigneeUsername) || !assigneeUsername.equalsIgnoreCase(username)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the assigned supervisor can manage this retention task");
        }
        if (!StringUtils.hasText(task.getDocumentId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Retention task is missing document reference");
        }

        return task;
    }

    private boolean isActiveTaskStatus(TaskStatus status) {
        return status == TaskStatus.PENDING || status == TaskStatus.IN_PROGRESS || status == TaskStatus.BLOCKED;
    }

    private boolean excludeOrphanedDocumentTasks(UserTask task) {
        if (task == null || !StringUtils.hasText(task.getDocumentId())) {
            return true;
        }

        boolean exists = documentService.existsDocument(task.getDocumentId());
        if (exists) {
            return true;
        }

        if (isActiveTaskStatus(task.getStatus())) {
            task.setStatus(TaskStatus.CANCELLED);
            task.setWorkflowStep("Document deleted");
            task.setUpdatedAt(Instant.now(clock));
            saveTask(task, "Failed to cancel orphaned dashboard task");
        }
        return false;
    }

    private boolean excludeNonActionableReviewTasks(UserTask task, String username) {
        if (task == null || !StringUtils.hasText(task.getDocumentId())) {
            return true;
        }
        TaskType type = task.getTaskType();
        if (type != TaskType.APPROVAL && type != TaskType.WORKFLOW && type != TaskType.REVIEW) {
            return true;
        }

        DocumentDetailsResponse document;
        try {
            document = documentService.getDocument(task.getDocumentId(), username);
        } catch (Exception ex) {
            // Preserve task visibility if the document lookup fails unexpectedly.
            return true;
        }

        if (document == null || document.status() == null) {
            return true;
        }

        String user = normalizeUsername(username);
        DocumentApprovalInfo approval = document.approval();
        String reviewer = normalizeUsername(approval != null ? approval.reviewerUsername() : null);
        String approver = normalizeUsername(approval != null ? approval.approverUsername() : null);

        boolean actionable = switch (document.status()) {
            case DRAFT -> user.equals(reviewer) || user.equals(approver);
            case REVIEWED -> user.equals(approver);
            case ACTIVE, REJECTED, ARCHIVED -> false;
        };

        if (actionable) {
            return true;
        }

        if (isActiveTaskStatus(task.getStatus())) {
            task.setStatus(TaskStatus.CANCELLED);
            task.setWorkflowStep("No longer actionable");
            task.setUpdatedAt(Instant.now(clock));
            saveTask(task, "Failed to cancel stale review task");
        }
        return false;
    }

    private String normalizeUsername(String username) {
        if (!StringUtils.hasText(username)) {
            return "";
        }
        return username.trim().toLowerCase(Locale.ROOT);
    }

    private AppUser requireUser(String userId) {
        try {
            return appUserRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Delegate user not found"));
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to resolve delegate user", ex);
        }
    }

    private void saveTask(UserTask task, String message) {
        try {
            userTaskRepository.save(task);
        } catch (java.io.IOException ex) {
            throw new RuntimeException(message, ex);
        }
    }

    private String buildTaskDescription(String existing, String action, String note) {
        StringBuilder builder = new StringBuilder();
        if (StringUtils.hasText(existing)) {
            builder.append(existing.trim());
        }
        if (builder.length() > 0) {
            builder.append("\n\n");
        }
        builder.append("Supervisor decision: ").append(action).append(" at ").append(Instant.now(clock));
        if (StringUtils.hasText(note)) {
            builder.append(". Note: ").append(note.trim());
        }
        return builder.toString();
    }
}
