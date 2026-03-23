package com.dms.task.service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.dms.task.dto.TaskItemResponse;
import com.dms.task.dto.UserDashboardResponse;
import com.dms.task.model.UserTask;
import com.dms.task.repository.UserTaskRepository;

@Service
@Transactional(readOnly = true)
public class UserDashboardService {

    private final UserTaskRepository userTaskRepository;
    private final Clock clock;

    public UserDashboardService(UserTaskRepository userTaskRepository, Clock clock) {
        this.userTaskRepository = userTaskRepository;
        this.clock = clock;
    }

    public UserDashboardResponse buildDashboardFor(String username) {
        List<TaskItemResponse> tasks;
        try {
            tasks = userTaskRepository
                .findByAssigneeUsernameIgnoreCaseOrderByDueDateAsc(username)
                .stream()
                .map(this::toResponse)
                .toList();
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to build dashboard tasks", ex);
        }

        Instant generatedAt = Instant.now(clock);
        return new UserDashboardResponse(generatedAt, tasks);
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
}
