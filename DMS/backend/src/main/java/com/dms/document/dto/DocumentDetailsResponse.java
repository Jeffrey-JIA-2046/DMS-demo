package com.dms.document.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.dms.document.model.DocumentStatus;

public record DocumentDetailsResponse(
    String id,
    String title,
    String description,
    String owner,
    String supervisor,
    String category,
    DocumentStatus status,
    int confidenceScore,
    Set<String> tags,
    Map<String, String> metadata,
    DocumentFolderInfo folder,
    Instant createdAt,
    Instant updatedAt,
    List<DocumentVersionResponse> versions,
    DocumentApprovalInfo approval,
    List<DocumentApprovalNoteResponse> approvalNotes
) {
}
