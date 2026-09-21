package com.dms.document.dto;

public record FolderPermissionEntryDto(
    String groupId,
    String groupName,
    String groupDescription,
    boolean canRead,
    boolean canWrite,
    boolean canDelete
) {}
