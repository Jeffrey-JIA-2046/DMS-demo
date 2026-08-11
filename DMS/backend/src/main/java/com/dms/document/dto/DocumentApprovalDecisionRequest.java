package com.dms.document.dto;

import jakarta.validation.constraints.Size;

public record DocumentApprovalDecisionRequest(
    @Size(max = 2000) String note,
    @Size(max = 128) String reviewerId,
    @Size(max = 128) String approverId,
    @Size(max = 10) String documentDate,
    @Size(max = 10) String expiryDate
) {}
