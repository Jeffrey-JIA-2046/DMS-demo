package com.dms.document.dto;

import java.util.List;

public record DocumentFolderInfo(
    String id,
    String name,
    List<String> breadcrumbs,
    List<FolderMetadataFieldDto> metadataTemplate
) {
}
