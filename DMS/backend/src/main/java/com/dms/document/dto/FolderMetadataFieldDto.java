package com.dms.document.dto;

import com.dms.document.model.MetadataFieldType;

public record FolderMetadataFieldDto(
    String key,
    String label,
    MetadataFieldType type,
    boolean required,
    String hint,
    String codeTableCode
) {
}
