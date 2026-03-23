package com.dms.document.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record DocumentFolderRequest(
    @NotBlank @Size(max = 120) String name,
    String parentId,
    @Valid @Size(max = 25) List<FolderMetadataFieldRequest> metadataTemplate,
    Boolean inheritMetadataTemplateFromParent
) {
}
