package com.dms.document.model;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

public class DocumentFolder {

    private String id;
    private String name;

    @JsonProperty("parent_id")
    private String parentId;

    private DocumentFolder parent;

    @JsonProperty("child_ids")
    private List<String> childIds = new ArrayList<>();

    @JsonProperty("metadata_template")
    private List<FolderMetadataField> metadataTemplate = new ArrayList<>();

    private List<DocumentFolderPermission> permissions = new ArrayList<>();

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getParentId() {
        return parentId;
    }

    public void setParentId(String parentId) {
        this.parentId = parentId;
    }

    public List<String> getChildIds() {
        return childIds;
    }

    public void setChildIds(List<String> childIds) {
        this.childIds = childIds;
    }

    public List<FolderMetadataField> getMetadataTemplate() {
        return metadataTemplate;
    }

    public void setMetadataTemplate(List<FolderMetadataField> metadataTemplate) {
        this.metadataTemplate = metadataTemplate;
    }

    public List<DocumentFolderPermission> getPermissions() {
        return permissions;
    }

    public void setPermissions(List<DocumentFolderPermission> permissions) {
        this.permissions = permissions;
    }

    public DocumentFolder getParent() {
        return parent;
    }

    public void setParent(DocumentFolder parent) {
        this.parent = parent;
    }
}
