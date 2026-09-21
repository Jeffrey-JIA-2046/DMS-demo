package com.dms.workflow.service;

import com.dms.document.model.Document;
import com.dms.workflow.model.WorkflowActivity;
import com.dms.workflow.model.WorkflowInstance;

public record AutoActivityContext(
    Document document,
    WorkflowInstance instance,
    WorkflowActivity activity,
    String actor
) {
}
