package com.dms.document.dto;

public record FolderSelfPermissionResponse(
    String folderId,
    boolean canRead,
    boolean canWrite,
    boolean canDelete
) {}
