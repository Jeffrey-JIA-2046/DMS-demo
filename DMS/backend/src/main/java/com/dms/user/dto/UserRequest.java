package com.dms.user.dto;

import java.util.Set;

import com.dms.security.Role;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UserRequest(
    @NotBlank @Size(max = 120) String username,
    @NotBlank @Size(max = 160) String displayName,
    @Size(min = 8, max = 120) String password,
    @NotNull Role role,
    Set<String> groupIds
) {}
