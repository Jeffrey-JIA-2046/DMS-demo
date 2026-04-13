package com.dms.document.dto;

import java.util.List;
import java.util.Set;

import com.dms.document.model.DocumentStatus;

public record DocumentFilter(
    String query,
    String owner,
    String category,
    DocumentStatus status,
    Set<String> tags,
    String folderId,
    Set<String> searchColumns,
    String searchOperator,
    List<String> conditionFields,
    List<String> conditionValues,
    List<String> conditionJoins,
    String conditionOperator
) {
}
