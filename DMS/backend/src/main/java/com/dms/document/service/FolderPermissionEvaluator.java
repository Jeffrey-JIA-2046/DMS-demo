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
        if (folder == null) {
            return FolderPermissionSnapshot.none();
        }
        if (user.getRole() == Role.SYS_ADMIN || user.getRole() == Role.USER_ADMIN) {
            return new FolderPermissionSnapshot(true, true, true);
        }
        List<DocumentFolderPermission> folderPermissions = folder.getPermissions();
        if (folderPermissions == null || folderPermissions.isEmpty()) {
            return FolderPermissionSnapshot.none();
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

        // Effective policy:
        // - Visibility/search: Read OR Write OR Delete
        // - Edit/upload/version update: Write OR Delete
        // - Delete: Delete only
        boolean effectiveRead = canRead || canWrite || canDelete;
        boolean effectiveWrite = canWrite || canDelete;
        return new FolderPermissionSnapshot(effectiveRead, effectiveWrite, canDelete);
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
