package com.dms.document.dto;

import jakarta.validation.constraints.Size;

public record DocumentApprovalDecisionRequest(
    @Size(max = 2000) String note
) {}
