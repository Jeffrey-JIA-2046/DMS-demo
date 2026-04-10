package com.dms.task.service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import com.dms.document.dto.DocumentApprovalDecisionRequest;
import com.dms.document.service.DocumentService;
import com.dms.task.dto.TaskItemResponse;
import com.dms.task.dto.UserDashboardResponse;
import com.dms.task.model.TaskStatus;
import com.dms.task.model.TaskType;
import com.dms.task.model.UserTask;
import com.dms.task.repository.UserTaskRepository;
import com.dms.user.model.AppUser;
import com.dms.user.repository.AppUserRepository;

@Service
@Transactional(readOnly = true)
public class UserDashboardService {

    private final UserTaskRepository userTaskRepository;
    private final AppUserRepository appUserRepository;
    private final DocumentService documentService;
    private final Clock clock;

    public UserDashboardService(
        UserTaskRepository userTaskRepository,
        AppUserRepository appUserRepository,
        DocumentService documentService,
        Clock clock
    ) {
        this.userTaskRepository = userTaskRepository;
        this.appUserRepository = appUserRepository;
        this.documentService = documentService;
        this.clock = clock;
    }

    public UserDashboardResponse buildDashboardFor(String username) {
        List<TaskItemResponse> tasks;
        try {
            tasks = userTaskRepository
                .findByAssigneeUsernameIgnoreCaseOrderByDueDateAsc(username)
                .stream()
                .filter(this::excludeOrphanedDocumentTasks)
                .map(this::toResponse)
                .toList();
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to build dashboard tasks", ex);
        }

        Instant generatedAt = Instant.now(clock);
        return new UserDashboardResponse(generatedAt, tasks);
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
