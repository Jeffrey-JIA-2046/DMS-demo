package com.dms.user.dto;

import com.dms.security.Role;

public record CurrentUserResponse(
    String username,
    String displayName,
    Role role
) {}
