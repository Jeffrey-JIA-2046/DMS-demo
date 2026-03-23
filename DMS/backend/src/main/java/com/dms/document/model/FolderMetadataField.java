package com.dms.document.model;

import com.fasterxml.jackson.annotation.JsonProperty;

public class FolderMetadataField {

    @JsonProperty("key")
    private String key;

    @JsonProperty("label")
    private String label;

    @JsonProperty("type")
    private MetadataFieldType type = MetadataFieldType.TEXT;

    @JsonProperty("required")
    private boolean required;

    @JsonProperty("hint")
    private String hint;

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public MetadataFieldType getType() {
        return type;
    }

    public void setType(MetadataFieldType type) {
        this.type = type;
    }

    public boolean isRequired() {
        return required;
    }

    public void setRequired(boolean required) {
        this.required = required;
    }

    public String getHint() {
        return hint;
    }

    public void setHint(String hint) {
        this.hint = hint;
    }
}