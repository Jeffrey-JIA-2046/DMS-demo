package com.dms.document.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.StreamSupport;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.dms.document.dto.FolderPermissionEntryDto;
import com.dms.document.dto.FolderPermissionUpdateRequest;
import com.dms.document.dto.FolderPermissionsResponse;
import com.dms.document.dto.FolderSelfPermissionResponse;
import com.dms.document.model.DocumentFolder;
import com.dms.document.model.DocumentFolderPermission;
import com.dms.document.repository.DocumentFolderRepository;
import com.dms.exception.ResourceNotFoundException;
import com.dms.user.model.AppUser;
import com.dms.user.model.UserGroup;
import com.dms.user.repository.AppUserRepository;
import com.dms.user.repository.UserGroupRepository;

@Service
@Transactional
public class DocumentFolderPermissionService {

    private final DocumentFolderRepository folderRepository;
    private final UserGroupRepository userGroupRepository;
    private final AppUserRepository appUserRepository;
    private final FolderPermissionEvaluator folderPermissionEvaluator;

    public DocumentFolderPermissionService(
        DocumentFolderRepository folderRepository,
        UserGroupRepository userGroupRepository,
        AppUserRepository appUserRepository,
        FolderPermissionEvaluator folderPermissionEvaluator
    ) {
        this.folderRepository = folderRepository;
        this.userGroupRepository = userGroupRepository;
        this.appUserRepository = appUserRepository;
        this.folderPermissionEvaluator = folderPermissionEvaluator;
    }

    @Transactional(readOnly = true)
    public FolderPermissionsResponse getPermissions(String folderId) {
        try {
            DocumentFolder folder = folderRepository.findById(folderId)
                .orElseThrow(() -> new ResourceNotFoundException("Folder not found"));
            if (folder.getPermissions() == null) {
                folder.setPermissions(new ArrayList<>());
            }
            List<UserGroup> groups = StreamSupport.stream(userGroupRepository.findAll().spliterator(), false)
                .sorted(Comparator.comparing(UserGroup::getName, String.CASE_INSENSITIVE_ORDER))
                .toList();
            return toResponse(folder, groups);
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to retrieve folder permissions", ex);
        }
    }

    public FolderPermissionsResponse updatePermissions(String folderId, FolderPermissionUpdateRequest request) {
        try {
            DocumentFolder folder = folderRepository.findById(folderId)
                .orElseThrow(() -> new ResourceNotFoundException("Folder not found"));
            List<UserGroup> groups = java.util.stream.StreamSupport.stream(userGroupRepository.findAll().spliterator(), false).toList();
            if (folder.getPermissions() == null) {
                folder.setPermissions(new ArrayList<>());
            }
            if (groups.isEmpty()) {
                folder.getPermissions().clear();
                DocumentFolder saved = folderRepository.save(folder);
                return toResponse(saved, List.of());
            }

            Map<String, UserGroup> groupIndex = new HashMap<>();
            groups.forEach(group -> groupIndex.put(group.getId(), group));

            Map<String, DocumentFolderPermission> existing = new HashMap<>();
            folder.getPermissions().forEach(permission -> {
                String permissionGroupId = resolvePermissionGroupId(permission);
                if (StringUtils.hasText(permissionGroupId)) {
                    existing.put(permissionGroupId, permission);
                }
            });

            Set<String> updatedGroupIds = new HashSet<>();
            List<FolderPermissionUpdateRequest.FolderPermissionUpdateEntry> entries =
                request != null && request.entries() != null ? request.entries() : List.of();

            for (FolderPermissionUpdateRequest.FolderPermissionUpdateEntry entry : entries) {
                if (entry == null || entry.groupId() == null) {
                    continue;
                }
                UserGroup group = groupIndex.get(entry.groupId());
                if (group == null) {
                    throw new ResourceNotFoundException("Group not found");
                }
                updatedGroupIds.add(group.getId());
                boolean anyPermission = entry.canRead() || entry.canWrite() || entry.canDelete();
                DocumentFolderPermission permission = existing.get(group.getId());
                if (!anyPermission) {
                    if (permission != null) {
                        folder.getPermissions().remove(permission);
                    }
                    continue;
                }
                if (permission == null) {
                    permission = new DocumentFolderPermission();
                    permission.setFolder(folder);
                    permission.setGroup(group);
                    permission.setGroupId(group.getId());
                    permission.setGroupName(group.getName());
                    folder.getPermissions().add(permission);
                } else {
                    permission.setGroup(group);
                    permission.setGroupId(group.getId());
                    permission.setGroupName(group.getName());
                }
                permission.setCanRead(entry.canRead());
                permission.setCanWrite(entry.canWrite());
                permission.setCanDelete(entry.canDelete());
            }

            folder.getPermissions().removeIf(permission -> !updatedGroupIds.contains(resolvePermissionGroupId(permission)));

            DocumentFolder saved = folderRepository.save(folder);
            List<UserGroup> sortedGroups = groupIndex.values().stream()
                .sorted(Comparator.comparing(UserGroup::getName, String.CASE_INSENSITIVE_ORDER))
                .toList();
            return toResponse(saved, sortedGroups);
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to update folder permissions", ex);
        }
    }

    @Transactional(readOnly = true)
    public FolderSelfPermissionResponse getMyPermissions(String folderId, String username) {
        try {
            DocumentFolder folder = folderRepository.findById(folderId)
                .orElseThrow(() -> new ResourceNotFoundException("Folder not found"));
            AppUser user = loadUser(username);
            FolderPermissionSnapshot snapshot = folderPermissionEvaluator.evaluate(folder, user);
            return new FolderSelfPermissionResponse(folder.getId(), snapshot.canRead(), snapshot.canWrite(), snapshot.canDelete());
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to retrieve your folder permissions", ex);
        }
    }

    private FolderPermissionsResponse toResponse(DocumentFolder folder, List<UserGroup> groups) {
        Map<String, DocumentFolderPermission> existing = new HashMap<>();
        List<DocumentFolderPermission> folderPermissions = folder.getPermissions();
        if (folderPermissions == null) {
            folderPermissions = List.of();
        }
        folderPermissions.forEach(permission -> {
            String permissionGroupId = resolvePermissionGroupId(permission);
            if (StringUtils.hasText(permissionGroupId)) {
                existing.put(permissionGroupId, permission);
            }
        });

        List<FolderPermissionEntryDto> entries = groups.stream()
            .map(group -> {
                DocumentFolderPermission permission = existing.get(group.getId());
                boolean canRead = permission != null && permission.isCanRead();
                boolean canWrite = permission != null && permission.isCanWrite();
                boolean canDelete = permission != null && permission.isCanDelete();
                return new FolderPermissionEntryDto(
                    group.getId(),
                    group.getName(),
                    group.getDescription(),
                    canRead,
                    canWrite,
                    canDelete
                );
            })
            .toList();

        return new FolderPermissionsResponse(folder.getId(), entries);
    }

    private AppUser loadUser(String username) {
        if (!StringUtils.hasText(username)) {
            throw new AccessDeniedException("Authentication required");
        }
        try {
            return appUserRepository.findByUsernameIgnoreCase(username)
                .orElseThrow(() -> new AccessDeniedException("User not found"));
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to load user", ex);
        }
    }

    private String resolvePermissionGroupId(DocumentFolderPermission permission) {
        if (permission == null) {
            return null;
        }
        if (permission.getGroup() != null && StringUtils.hasText(permission.getGroup().getId())) {
            return permission.getGroup().getId();
        }
        if (StringUtils.hasText(permission.getGroupId())) {
            return permission.getGroupId();
        }
        return null;
    }
}
