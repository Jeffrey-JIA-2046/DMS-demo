package com.dms.user.dto;

import java.util.List;

import com.dms.security.Role;

public record UserResponse(
    String id,
    String username,
    String displayName,
    Role role,
    List<GroupSummary> groups,
    String userPassword
) {}
