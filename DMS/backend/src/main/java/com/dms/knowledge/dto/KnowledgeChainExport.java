package com.dms.knowledge.dto;

public record KnowledgeChainExport(
    String fileName,
    byte[] content,
    String contentType
) {
}
