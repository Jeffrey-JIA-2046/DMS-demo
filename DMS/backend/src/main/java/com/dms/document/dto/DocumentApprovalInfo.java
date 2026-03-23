package com.dms.document.dto;

import java.time.Instant;

public record DocumentApprovalInfo(
    String approverId,
    String approverUsername,
    String approverDisplayName,
    Instant requestedAt,
    Instant decidedAt
) {}
