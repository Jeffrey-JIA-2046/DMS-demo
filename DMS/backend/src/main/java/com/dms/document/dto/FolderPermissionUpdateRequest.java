package com.dms.document.dto;

import java.util.List;

public record FolderPermissionUpdateRequest(
    List<FolderPermissionUpdateEntry> entries,
    Boolean preserveInheritance
) {
    public record FolderPermissionUpdateEntry(
        String groupId,
        boolean canRead,
        boolean canWrite,
        boolean canDelete
    ) {}
}
