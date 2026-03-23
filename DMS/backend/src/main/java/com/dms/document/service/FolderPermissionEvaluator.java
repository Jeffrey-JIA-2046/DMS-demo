package com.dms.document.service;

import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.HashSet;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.dms.document.model.DocumentFolder;
import com.dms.document.model.DocumentFolderPermission;
import com.dms.security.Role;
import com.dms.user.model.AppUser;
import com.dms.user.model.UserGroup;

@Component
public class FolderPermissionEvaluator {

    public FolderPermissionSnapshot evaluate(DocumentFolder folder, AppUser user) {
        if (user == null) {
            return FolderPermissionSnapshot.none();
        }
        if (user.getRole() == Role.SYS_ADMIN) {
            return FolderPermissionSnapshot.fullAccess();
        }
        if (folder == null) {
            return defaultsForRole(user.getRole());
        }
        List<DocumentFolderPermission> folderPermissions = folder.getPermissions();
        if (folderPermissions == null || folderPermissions.isEmpty()) {
            return defaultsForRole(user.getRole());
        }
        Set<String> userGroupIds = new HashSet<>();

        Set<UserGroup> groups = user.getGroups();
        if (groups != null && !groups.isEmpty()) {
            userGroupIds.addAll(groups.stream()
                .map(UserGroup::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet()));
        }

        Set<String> groupIds = user.getGroupIds();
        if (groupIds != null && !groupIds.isEmpty()) {
            userGroupIds.addAll(groupIds.stream()
                .filter(Objects::nonNull)
                .collect(Collectors.toSet()));
        }

        if (userGroupIds.isEmpty()) {
            return FolderPermissionSnapshot.none();
        }

        boolean canRead = false;
        boolean canWrite = false;
        boolean canDelete = false;

        for (DocumentFolderPermission permission : folderPermissions) {
            String permissionGroupId = resolvePermissionGroupId(permission);
            if (!StringUtils.hasText(permissionGroupId) || !userGroupIds.contains(permissionGroupId)) {
                continue;
            }
            canRead |= permission.isCanRead();
            canWrite |= permission.isCanWrite();
            canDelete |= permission.isCanDelete();
        }

        if (!canRead && !canWrite && !canDelete) {
            return FolderPermissionSnapshot.none();
        }

        return new FolderPermissionSnapshot(canRead, canWrite, canDelete);
    }

    public boolean canRead(DocumentFolder folder, AppUser user) {
        return evaluate(folder, user).canRead();
    }

    public boolean canWrite(DocumentFolder folder, AppUser user) {
        return evaluate(folder, user).canWrite();
    }

    public boolean canDelete(DocumentFolder folder, AppUser user) {
        return evaluate(folder, user).canDelete();
    }

    private FolderPermissionSnapshot defaultsForRole(Role role) {
        return switch (role) {
            case SYS_ADMIN -> FolderPermissionSnapshot.fullAccess();
            case USER_ADMIN -> FolderPermissionSnapshot.fullAccess();
            case DOC_ADMIN -> new FolderPermissionSnapshot(true, true, false);
            case DOC_VIEWER -> new FolderPermissionSnapshot(true, false, false);
        };
    }

    private String resolvePermissionGroupId(DocumentFolderPermission permission) {
        if (permission == null) {
            return null;
        }
        UserGroup group = permission.getGroup();
        if (group != null && StringUtils.hasText(group.getId())) {
            return group.getId();
        }
        if (StringUtils.hasText(permission.getGroupId())) {
            return permission.getGroupId();
        }
        return null;
    }
}
