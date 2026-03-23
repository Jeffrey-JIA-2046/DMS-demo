package com.dms.document.dto;

import java.util.List;

public record FolderPermissionsResponse(
    String folderId,
    List<FolderPermissionEntryDto> permissions
) {}
