package com.dms.document.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonIgnore;

public class DocumentFolderPermission {

    @JsonProperty("group_id")
    private String groupId;

    @JsonProperty("group_name")
    private String groupName;

    private com.dms.user.model.UserGroup group;

    @JsonProperty("can_read")
    private boolean canRead;

    @JsonProperty("can_write")
    private boolean canWrite;

    @JsonProperty("can_delete")
    private boolean canDelete;

    public String getGroupId() {
        return groupId;
    }

    public void setGroupId(String groupId) {
        this.groupId = groupId;
    }

    public String getGroupName() {
        return groupName;
    }

    public void setGroupName(String groupName) {
        this.groupName = groupName;
    }

    public boolean isCanRead() {
        return canRead;
    }

    public void setCanRead(boolean canRead) {
        this.canRead = canRead;
    }

    public boolean isCanWrite() {
        return canWrite;
    }

    public void setCanWrite(boolean canWrite) {
        this.canWrite = canWrite;
    }

    public boolean isCanDelete() {
        return canDelete;
    }

    public void setCanDelete(boolean canDelete) {
        this.canDelete = canDelete;
    }

    public com.dms.user.model.UserGroup getGroup() {
        return group;
    }

    public void setGroup(com.dms.user.model.UserGroup group) {
        this.group = group;
    }

    private com.dms.document.model.DocumentFolder folder;

    @JsonIgnore
    public com.dms.document.model.DocumentFolder getFolder() {
        return folder;
    }

    public void setFolder(com.dms.document.model.DocumentFolder folder) {
        this.folder = folder;
    }
}
