package com.dms.workflow.dto;

import java.util.List;

import com.dms.workflow.model.WorkflowActivity;
import com.dms.workflow.model.WorkflowConnection;

import jakarta.validation.constraints.NotBlank;

public record WorkflowTemplateUpsertRequest(
    @NotBlank String name,
    String description,
    String bpmnXml,
    List<WorkflowActivity> activities,
    List<WorkflowConnection> connections
) {
}
