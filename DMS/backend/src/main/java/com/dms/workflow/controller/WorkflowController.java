package com.dms.workflow.controller;

import java.security.Principal;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.dms.workflow.dto.AutoActivityInfoResponse;
import com.dms.workflow.dto.WorkflowBindingRequest;
import com.dms.workflow.dto.WorkflowManualDecisionRequest;
import com.dms.workflow.dto.WorkflowTemplateUpsertRequest;
import com.dms.workflow.model.WorkflowCategoryBinding;
import com.dms.workflow.model.WorkflowInstance;
import com.dms.workflow.model.WorkflowTemplate;
import com.dms.workflow.service.WorkflowService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/workflows")
public class WorkflowController {

    private final WorkflowService workflowService;

    public WorkflowController(WorkflowService workflowService) {
        this.workflowService = workflowService;
    }

    @GetMapping("/templates")
    @PreAuthorize("hasAnyRole('SYS_ADMIN','USER_ADMIN')")
    public List<WorkflowTemplate> listTemplates(Principal principal) {
        workflowService.requireWorkflowAdmin(principal != null ? principal.getName() : null);
        return workflowService.listTemplates();
    }

    @GetMapping("/templates/{id}")
    @PreAuthorize("hasAnyRole('SYS_ADMIN','USER_ADMIN')")
    public WorkflowTemplate getTemplate(@PathVariable String id, Principal principal) {
        workflowService.requireWorkflowAdmin(principal != null ? principal.getName() : null);
        return workflowService.getTemplate(id);
    }

    @PostMapping("/templates")
    @PreAuthorize("hasAnyRole('SYS_ADMIN','USER_ADMIN')")
    public WorkflowTemplate createTemplate(@RequestBody @Valid WorkflowTemplateUpsertRequest request, Principal principal) {
        String actor = principal != null ? principal.getName() : null;
        workflowService.requireWorkflowAdmin(actor);
        return workflowService.createTemplate(request, actor);
    }

    @PutMapping("/templates/{id}")
    @PreAuthorize("hasAnyRole('SYS_ADMIN','USER_ADMIN')")
    public WorkflowTemplate updateTemplate(@PathVariable String id, @RequestBody @Valid WorkflowTemplateUpsertRequest request, Principal principal) {
        String actor = principal != null ? principal.getName() : null;
        workflowService.requireWorkflowAdmin(actor);
        return workflowService.updateTemplate(id, request, actor);
    }

    @PostMapping("/templates/{id}/publish")
    @PreAuthorize("hasRole('SYS_ADMIN')")
    public WorkflowTemplate publishTemplate(@PathVariable String id, Principal principal) {
        String actor = principal != null ? principal.getName() : null;
        workflowService.requireSystemAdmin(actor);
        return workflowService.publishTemplate(id, actor);
    }

    @PostMapping("/templates/{id}/branch")
    @PreAuthorize("hasAnyRole('SYS_ADMIN','USER_ADMIN')")
    public WorkflowTemplate branchTemplate(@PathVariable String id, Principal principal) {
        String actor = principal != null ? principal.getName() : null;
        workflowService.requireWorkflowAdmin(actor);
        return workflowService.branchTemplateFromPublished(id, actor);
    }

    @GetMapping("/categories")
    @PreAuthorize("hasAnyRole('SYS_ADMIN','USER_ADMIN')")
    public List<String> listCategories(Principal principal) {
        workflowService.requireWorkflowAdmin(principal != null ? principal.getName() : null);
        return workflowService.listDocumentCategories();
    }

    @GetMapping("/bindings")
    @PreAuthorize("hasAnyRole('SYS_ADMIN','USER_ADMIN')")
    public List<WorkflowCategoryBinding> listBindings(Principal principal) {
        workflowService.requireWorkflowAdmin(principal != null ? principal.getName() : null);
        return workflowService.listBindings();
    }

    @PostMapping("/bindings")
    @PreAuthorize("hasRole('SYS_ADMIN')")
    public WorkflowCategoryBinding upsertBinding(@RequestBody @Valid WorkflowBindingRequest request, Principal principal) {
        String actor = principal != null ? principal.getName() : null;
        workflowService.requireSystemAdmin(actor);
        return workflowService.upsertBinding(request, actor);
    }

    @DeleteMapping("/bindings/{id}")
    @PreAuthorize("hasRole('SYS_ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteBinding(@PathVariable String id, Principal principal) {
        String actor = principal != null ? principal.getName() : null;
        workflowService.requireSystemAdmin(actor);
        workflowService.deleteBinding(id, actor);
    }

    @GetMapping("/auto-activities")
    @PreAuthorize("hasAnyRole('SYS_ADMIN','USER_ADMIN')")
    public List<AutoActivityInfoResponse> listAutoActivities(Principal principal) {
        workflowService.requireWorkflowAdmin(principal != null ? principal.getName() : null);
        return workflowService.listAutoActivityClasses();
    }

    @GetMapping("/documents/{documentId}/instances")
    @PreAuthorize("isAuthenticated()")
    public List<WorkflowInstance> listDocumentInstances(@PathVariable String documentId) {
        return workflowService.listDocumentInstances(documentId);
    }

    @PostMapping("/instances/{instanceId}/manual-decision")
    @PreAuthorize("isAuthenticated()")
    public WorkflowInstance decideManualStep(
        @PathVariable String instanceId,
        @RequestBody @Valid WorkflowManualDecisionRequest request,
        Principal principal
    ) {
        String actor = principal != null ? principal.getName() : null;
        return workflowService.decideManualStep(instanceId, request, actor);
    }
}
