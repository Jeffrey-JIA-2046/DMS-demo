package com.dms.document.dto;

import java.util.List;

import com.dms.user.dto.GroupSummary;

public record ApproverOptionResponse(
    String id,
    String username,
    String displayName,
    List<GroupSummary> groups
) {}
