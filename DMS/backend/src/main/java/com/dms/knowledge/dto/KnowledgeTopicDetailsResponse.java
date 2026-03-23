package com.dms.knowledge.dto;

import java.time.Instant;
import java.util.List;

public record KnowledgeTopicDetailsResponse(
    String id,
    String title,
    String description,
    List<String> tags,
    String createdBy,
    Instant createdAt,
    Instant updatedAt,
    int memberCount,
    int contributionCount,
    int starCount,
    int linkedDocumentCount,
    boolean member,
    boolean starredByMe,
    List<KnowledgeContributionResponse> contributions,
    List<KnowledgeMemberResponse> members,
    List<KnowledgeDocumentLinkResponse> documentLinks,
    List<KnowledgeAttachmentResponse> uploads,
    List<KnowledgeShareResponse> shares
) {
}
