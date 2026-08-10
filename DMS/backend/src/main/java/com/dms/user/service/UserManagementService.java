package com.dms.user.service;

import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
<<<<<<< HEAD
=======
import java.util.Locale;
>>>>>>> 5014c446f40fae7eee98fd5a6c4b511d9d566f1f
import java.util.Map;
import java.util.Set;
import java.util.stream.StreamSupport;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
    private static final Logger LOGGER = LoggerFactory.getLogger(UserManagementService.class);

    private final AppUserRepository appUserRepository;
    private final UserGroupRepository userGroupRepository;
    private final AesPasswordEncoder passwordEncoder;

    public UserManagementService(AppUserRepository appUserRepository, UserGroupRepository userGroupRepository,
            AesPasswordEncoder passwordEncoder) {
        this.appUserRepository = appUserRepository;
        this.userGroupRepository = userGroupRepository;
        this.passwordEncoder = passwordEncoder;
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

    public UserResponse createUser(UserRequest request) {
        try {
            appUserRepository.findByUsernameIgnoreCaseWithFallback(request.username())
                .ifPresent(existing -> { throw new IllegalArgumentException("Username already exists"); });
            String passwordToUse = (request.password() == null || request.password().isBlank())
                ? DEFAULT_PASSWORD
                : request.password().trim();
            AppUser user = new AppUser();
            applyUserRequest(user, request);
            applyPassword(user, passwordToUse);
            return toUserResponse(appUserRepository.save(user));
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to create user", ex);
        }
    }

    public UserResponse updateUser(String id, UserRequest request) {
        try {
            AppUser user = appUserRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
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

    public void deleteUser(String id) {
        try {
            AppUser user = appUserRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
            appUserRepository.delete(user);
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to delete user", ex);
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
