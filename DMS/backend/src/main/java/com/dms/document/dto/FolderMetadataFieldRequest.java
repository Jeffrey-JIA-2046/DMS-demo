package com.dms.document.dto;

import com.dms.document.model.MetadataFieldType;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record FolderMetadataFieldRequest(
    @NotBlank
    @Size(max = 64)
    @Pattern(regexp = "^[A-Za-z][A-Za-z0-9_-]*$", message = "Key must start with a letter and contain only letters, numbers, underscores, or hyphens")
    String key,

    @NotBlank
    @Size(max = 160)
    String label,

    @NotNull
    MetadataFieldType type,

    boolean required,

    @Size(max = 255)
    String hint
) {
}
