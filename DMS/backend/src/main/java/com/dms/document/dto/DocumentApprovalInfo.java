package com.dms.document.dto;

import java.time.Instant;

public record DocumentApprovalInfo(
    String uploaderUsername,
    String uploaderDisplayName,
    String reviewerId,
    String reviewerUsername,
    String reviewerDisplayName,
    String approverId,
    String approverUsername,
    String approverDisplayName,
    Instant requestedAt,
    Instant decidedAt
) {}
