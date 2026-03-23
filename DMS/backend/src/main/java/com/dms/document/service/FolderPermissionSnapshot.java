package com.dms.document.service;

public record FolderPermissionSnapshot(boolean canRead, boolean canWrite, boolean canDelete) {

    public static FolderPermissionSnapshot none() {
        return new FolderPermissionSnapshot(false, false, false);
    }

    public static FolderPermissionSnapshot fullAccess() {
        return new FolderPermissionSnapshot(true, true, true);
    }
}
