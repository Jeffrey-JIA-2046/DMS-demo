package com.dms.task.controller;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.dms.document.dto.DocumentApprovalDecisionRequest;
import com.dms.task.dto.UserDashboardResponse;
import com.dms.task.service.UserDashboardService;

@RestController
@RequestMapping("/api/dashboard")
public class UserDashboardController {

    private final UserDashboardService userDashboardService;

    public UserDashboardController(UserDashboardService userDashboardService) {
        this.userDashboardService = userDashboardService;
    }

    @GetMapping("/my-tasks")
    public UserDashboardResponse currentUserTasks(Authentication authentication) {
        if (authentication == null || !StringUtils.hasText(authentication.getName())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        return userDashboardService.buildDashboardFor(authentication.getName());
    }

    @PostMapping("/tasks/{taskId}/retention/approve")
    @org.springframework.http.ResponseStatus(HttpStatus.NO_CONTENT)
    public void approveRetentionTask(
        @PathVariable String taskId,
        @RequestBody(required = false) DocumentApprovalDecisionRequest request,
        Authentication authentication
    ) {
        if (authentication == null || !StringUtils.hasText(authentication.getName())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        userDashboardService.approveRetentionTask(taskId, request, authentication.getName());
    }

    @PostMapping("/tasks/{taskId}/retention/reject")
    @org.springframework.http.ResponseStatus(HttpStatus.NO_CONTENT)
    public void rejectRetentionTask(
        @PathVariable String taskId,
        @RequestBody(required = false) DocumentApprovalDecisionRequest request,
        Authentication authentication
    ) {
        if (authentication == null || !StringUtils.hasText(authentication.getName())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        userDashboardService.rejectRetentionTask(taskId, request, authentication.getName());
    }

    @PostMapping("/tasks/{taskId}/retention/delegate")
    @org.springframework.http.ResponseStatus(HttpStatus.NO_CONTENT)
    public void delegateRetentionTask(
        @PathVariable String taskId,
        @RequestBody DocumentApprovalDecisionRequest request,
        Authentication authentication
    ) {
        if (authentication == null || !StringUtils.hasText(authentication.getName())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        userDashboardService.delegateRetentionTask(taskId, request, authentication.getName());
    }
}
