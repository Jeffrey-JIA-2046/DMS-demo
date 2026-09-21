package com.dms.document.dto;

import java.util.List;

public record DocumentFolderTreeNode(
    String id,
    String name,
    String parentId,
    List<DocumentFolderTreeNode> children,
    List<FolderMetadataFieldDto> metadataTemplate
) {
}
