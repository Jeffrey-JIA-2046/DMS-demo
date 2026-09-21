package com.dms.user.service;

import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.StreamSupport;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.dms.audit.service.AuditService;
import com.dms.audit.model.AuditLog;
import com.dms.security.Role;
import com.dms.security.crypto.AesPasswordEncoder;
import com.dms.user.dto.GroupRequest;
import com.dms.user.dto.GroupResponse;
import com.dms.user.dto.GroupSummary;
import com.dms.user.dto.UserRequest;
import com.dms.user.dto.UserResponse;
import com.dms.user.model.AppUser;
import com.dms.user.model.UserGroup;
import com.dms.user.repository.AppUserRepository;
import com.dms.user.repository.UserGroupRepository;
import com.dms.exception.ResourceNotFoundException;

@Service
@Transactional
public class UserManagementService {

    private static final String DEFAULT_PASSWORD = "P@ssw0rd";
    private static final String USER_CREATE_AUDIT_ACTION = "ADMIN_CREATE_USER";
    private static final Logger LOGGER = LoggerFactory.getLogger(UserManagementService.class);

    private final AppUserRepository appUserRepository;
    private final UserGroupRepository userGroupRepository;
    private final AuditService auditService;
    private final AesPasswordEncoder passwordEncoder;
    private final int adminCreateUserLimit;

    public UserManagementService(AppUserRepository appUserRepository, UserGroupRepository userGroupRepository,
            AuditService auditService,
            AesPasswordEncoder passwordEncoder,
            @Value("${app.user-management.admin-create-user-limit:5}") int adminCreateUserLimit) {
        this.appUserRepository = appUserRepository;
        this.userGroupRepository = userGroupRepository;
        this.auditService = auditService;
        this.passwordEncoder = passwordEncoder;
        this.adminCreateUserLimit = Math.max(1, adminCreateUserLimit);
    }

    @Transactional(readOnly = true)
    public List<GroupResponse> listGroups() {
        List<UserGroup> groups = StreamSupport.stream(userGroupRepository.findAll().spliterator(), false)
            .sorted(Comparator.comparing(UserGroup::getName, String.CASE_INSENSITIVE_ORDER))
            .toList();

        Map<String, Integer> memberCountByGroupId = new HashMap<>();
        try {
            for (AppUser user : appUserRepository.findAll()) {
                if (user == null || user.getGroupIds() == null || user.getGroupIds().isEmpty()) {
                    continue;
                }
                for (String groupId : user.getGroupIds()) {
                    if (groupId == null || groupId.isBlank()) {
                        continue;
                    }
                    memberCountByGroupId.merge(groupId, 1, Integer::sum);
                }
            }
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to resolve group members", ex);
        }

        return groups.stream()
            .map(group -> toGroupResponse(group, memberCountByGroupId.getOrDefault(group.getId(), 0)))
            .toList();
    }

    public GroupResponse createGroup(GroupRequest request) {
        userGroupRepository.findByNameIgnoreCase(request.name())
            .ifPresent(existing -> { throw new IllegalArgumentException("Group name already exists"); });
        UserGroup group = new UserGroup();
        group.setName(request.name().trim());
        group.setDescription(request.description());
        return toGroupResponse(userGroupRepository.save(group));
    }

    public GroupResponse updateGroup(String id, GroupRequest request) {
        UserGroup group = userGroupRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Group not found"));
        userGroupRepository.findByNameIgnoreCase(request.name())
            .filter(other -> !other.getId().equals(id))
            .ifPresent(other -> { throw new IllegalArgumentException("Group name already exists"); });
        group.setName(request.name().trim());
        group.setDescription(request.description());
        return toGroupResponse(group);
    }

    public void deleteGroup(String id) {
        UserGroup group = userGroupRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Group not found"));
        try {
            for (AppUser member : appUserRepository.findByGroupIdsIn(id)) {
                if (member.getGroupIds() != null) {
                    member.getGroupIds().remove(id);
                }
                if (member.getGroups() != null) {
                    member.getGroups().removeIf(g -> id.equals(g.getId()));
                }
                appUserRepository.save(member);
            }
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to update users for deleted group", ex);
        }
        userGroupRepository.delete(group);
    }

    @Transactional(readOnly = true)
    public List<UserResponse> listUsers() {
        try {
            return appUserRepository.findAll().stream()
                .sorted(Comparator.comparing(AppUser::getUsername, String.CASE_INSENSITIVE_ORDER))
                .map(this::toUserResponse)
                .toList();
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to list users", ex);
        }
    }

    public UserResponse createUser(UserRequest request, String actorUsername) {
        try {
            AppUser actor = resolveActor(actorUsername);
            validateRootAccountChange(actor, null, request.role());
            enforceAdminCreateLimit(actorUsername);
            appUserRepository.findByUsernameIgnoreCaseWithFallback(request.username())
                .ifPresent(existing -> { throw new IllegalArgumentException("Username already exists"); });
            String passwordToUse = (request.password() == null || request.password().isBlank())
                ? DEFAULT_PASSWORD
                : request.password().trim();
            AppUser user = new AppUser();
            applyUserRequest(user, request);
            applyPassword(user, passwordToUse);
            AppUser saved = appUserRepository.save(user);
            String actorAudit = normalizeActor(actorUsername);
            auditService.record(
                USER_CREATE_AUDIT_ACTION,
                saved.getId(),
                actorAudit,
                "created user " + saved.getUsername()
            );
            return toUserResponse(saved);
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to create user", ex);
        }
    }

    private void enforceAdminCreateLimit(String actorUsername) throws java.io.IOException {
        String actor = normalizeActor(actorUsername);
        if ("system".equals(actor)) {
            return;
        }
        long createdCount = countActiveUsersCreatedBy(actor);
        if (createdCount >= adminCreateUserLimit) {
            throw new IllegalArgumentException(
                "User creation limit reached. Each admin can create up to " + adminCreateUserLimit + " users."
            );
        }
    }

    private long countActiveUsersCreatedBy(String actor) throws java.io.IOException {
        List<AppUser> users = appUserRepository.findAll();
        Set<String> activeUsernames = users.stream()
            .map(AppUser::getUsername)
            .filter(username -> username != null && !username.isBlank())
            .map(username -> username.trim().toLowerCase(Locale.ROOT))
            .collect(java.util.stream.Collectors.toSet());
        if (activeUsernames.isEmpty()) {
            return 0;
        }

        List<AuditLog> createLogs = auditService.findByAction(USER_CREATE_AUDIT_ACTION);
        Map<String, AuditLog> latestCreateLogByUsername = new HashMap<>();
        for (AuditLog log : createLogs) {
            String username = extractCreatedUsername(log);
            if (username == null || username.isBlank()) {
                continue;
            }
            String normalizedUsername = username.trim().toLowerCase(Locale.ROOT);
            if (!activeUsernames.contains(normalizedUsername)) {
                continue;
            }
            AuditLog existing = latestCreateLogByUsername.get(normalizedUsername);
            if (existing == null || isAfter(log, existing)) {
                latestCreateLogByUsername.put(normalizedUsername, log);
            }
        }

        String normalizedActor = actor.trim().toLowerCase(Locale.ROOT);
        return latestCreateLogByUsername.values().stream()
            .map(AuditLog::getPerformedBy)
            .filter(performedBy -> performedBy != null && !performedBy.isBlank())
            .map(performedBy -> performedBy.trim().toLowerCase(Locale.ROOT))
            .filter(performedBy -> performedBy.equals(normalizedActor))
            .count();
    }

    private boolean isAfter(AuditLog candidate, AuditLog baseline) {
        if (candidate == null) {
            return false;
        }
        if (baseline == null) {
            return true;
        }
        if (candidate.getCreatedAt() == null) {
            return false;
        }
        if (baseline.getCreatedAt() == null) {
            return true;
        }
        return candidate.getCreatedAt().isAfter(baseline.getCreatedAt());
    }

    private String extractCreatedUsername(AuditLog log) {
        if (log == null) {
            return null;
        }
        String details = log.getDetails();
        if (details == null) {
            return null;
        }
        final String prefix = "created user ";
        if (!details.startsWith(prefix)) {
            return null;
        }
        String username = details.substring(prefix.length()).trim();
        return username.isBlank() ? null : username;
    }

    private String normalizeActor(String actorUsername) {
        if (actorUsername == null || actorUsername.isBlank()) {
            return "system";
        }
        return actorUsername.trim();
    }

    public UserResponse updateUser(String id, UserRequest request, String actorUsername) {
        try {
            AppUser actor = resolveActor(actorUsername);
            AppUser user = appUserRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
            validateRootAccountChange(actor, user, request.role());
            appUserRepository.findByUsernameIgnoreCaseWithFallback(request.username())
                .filter(other -> !other.getId().equals(id))
                .ifPresent(other -> { throw new IllegalArgumentException("Username already exists"); });
            applyUserRequest(user, request);
            if (request.password() != null && !request.password().isBlank()) {
                applyPassword(user, request.password());
            }
            return toUserResponse(appUserRepository.save(user));
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to update user", ex);
        }
    }

    public void deleteUser(String id, String actorUsername) {
        try {
            AppUser actor = resolveActor(actorUsername);
            AppUser user = appUserRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
            if (user.getRole() == Role.ROOT && (actor == null || actor.getRole() != Role.ROOT)) {
                throw new AccessDeniedException("Only root can delete the root user");
            }
            appUserRepository.delete(user);
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to delete user", ex);
        }
    }

    private AppUser resolveActor(String actorUsername) throws java.io.IOException {
        if (actorUsername == null || actorUsername.isBlank()) {
            return null;
        }
        return appUserRepository.findByUsernameIgnoreCaseWithFallback(actorUsername)
            .orElseThrow(() -> new AccessDeniedException("Actor user not found"));
    }

    private void validateRootAccountChange(AppUser actor, AppUser existingUser, Role requestedRole) throws java.io.IOException {
        boolean existingIsRoot = existingUser != null && existingUser.getRole() == Role.ROOT;
        boolean requestedIsRoot = requestedRole == Role.ROOT;
        boolean touchesRoot = existingIsRoot || requestedIsRoot;

        if (touchesRoot && (actor == null || actor.getRole() != Role.ROOT)) {
            throw new AccessDeniedException("Only root can create or modify a root user");
        }

        if (requestedIsRoot && !existingIsRoot) {
            long rootUsers = appUserRepository.findAll().stream()
                .filter(user -> user != null && user.getRole() == Role.ROOT)
                .count();
            if (rootUsers >= 1) {
                throw new IllegalArgumentException("Only one root user is allowed");
            }
        }
    }

    private void applyUserRequest(AppUser user, UserRequest request) {
        user.setUsername(request.username().trim());
        user.setDisplayName(request.displayName().trim());
        user.setRole(request.role());
        Set<String> groupIds = request.groupIds() == null ? Set.of() : request.groupIds().stream()
            .filter(value -> value != null && !value.isBlank())
            .map(String::trim)
            .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
        Set<UserGroup> groups = resolveGroups(user, groupIds);
        user.setGroups(groups);
        user.setGroupIds(groups.stream().map(UserGroup::getId).collect(java.util.stream.Collectors.toSet()));
    }

    private Set<UserGroup> resolveGroups(AppUser existingUser, Set<String> groupIdentifiers) {
        if (groupIdentifiers == null || groupIdentifiers.isEmpty()) {
            return Set.of();
        }

        List<UserGroup> availableGroups = userGroupRepository.findAll();
        Map<String, UserGroup> byId = availableGroups.stream()
            .filter(group -> group.getId() != null)
            .collect(java.util.stream.Collectors.toMap(UserGroup::getId, group -> group, (left, right) -> left));
        Map<String, UserGroup> byNameLower = availableGroups.stream()
            .filter(group -> group.getName() != null)
            .collect(java.util.stream.Collectors.toMap(
                group -> group.getName().toLowerCase(Locale.ROOT),
                group -> group,
                (left, right) -> left));

        Set<UserGroup> resolved = new LinkedHashSet<>();
        Set<String> unresolved = new LinkedHashSet<>();
        for (String identifier : groupIdentifiers) {
            UserGroup group = byId.get(identifier);
            if (group == null) {
                group = byNameLower.get(identifier.toLowerCase(Locale.ROOT));
            }
            if (group == null && existingUser != null && existingUser.getGroups() != null) {
                UserGroup legacy = existingUser.getGroups().stream()
                    .filter(current -> current != null && identifier.equals(current.getId()) && current.getName() != null)
                    .findFirst()
                    .orElse(null);
                if (legacy != null) {
                    group = byNameLower.get(legacy.getName().toLowerCase(Locale.ROOT));
                }
            }
            if (group == null) {
                group = userGroupRepository.findById(identifier).orElse(null);
            }
            if (group == null) {
                group = userGroupRepository.findByNameIgnoreCase(identifier).orElse(null);
            }
            if (group == null) {
                unresolved.add(identifier);
                continue;
            }
            resolved.add(group);
        }

        if (!unresolved.isEmpty()) {
            LOGGER.warn("Unresolved group identifiers while saving user: {}", unresolved);
            throw new IllegalArgumentException("One or more groups do not exist");
        }
        return resolved;
    }

    private GroupResponse toGroupResponse(UserGroup group) {
        int memberCount = group.getMemberIds() == null ? 0 : group.getMemberIds().size();
        return new GroupResponse(group.getId(), group.getName(), group.getDescription(), memberCount);
    }

    private GroupResponse toGroupResponse(UserGroup group, int memberCount) {
        return new GroupResponse(group.getId(), group.getName(), group.getDescription(), memberCount);
    }

    private UserResponse toUserResponse(AppUser user) {
        Map<String, String> canonicalIdByNameLower = userGroupRepository.findAll().stream()
            .filter(group -> group.getName() != null && group.getId() != null)
            .collect(java.util.stream.Collectors.toMap(
                group -> group.getName().toLowerCase(Locale.ROOT),
                UserGroup::getId,
                (left, right) -> left));
        List<GroupSummary> summaries = user.getGroups().stream()
            .sorted(Comparator.comparing(UserGroup::getName, String.CASE_INSENSITIVE_ORDER))
            .map(group -> {
                String summaryId = group.getId();
                if (group.getName() != null) {
                    summaryId = canonicalIdByNameLower.getOrDefault(group.getName().toLowerCase(Locale.ROOT), summaryId);
                }
                return new GroupSummary(summaryId, group.getName());
            })
            .toList();
        return new UserResponse(user.getId(), user.getUsername(), user.getDisplayName(), user.getRole(), summaries,
            resolveManagedPassword(user));
    }

    private void applyPassword(AppUser user, String rawPassword) {
        String normalized = rawPassword.trim();
        String encoded = passwordEncoder.encode(normalized);
        user.setPassword(encoded);
        user.setUserPassword(encoded);
    }

    private String resolveManagedPassword(AppUser user) {
        String stored = user.getUserPassword();
        if (stored == null || stored.isBlank()) {
            stored = user.getPassword();
        }
        if (stored == null || stored.isBlank()) {
            return "";
        }
        try {
            return passwordEncoder.decrypt(stored);
        } catch (IllegalStateException ex) {
            return "";
        }
    }
}

