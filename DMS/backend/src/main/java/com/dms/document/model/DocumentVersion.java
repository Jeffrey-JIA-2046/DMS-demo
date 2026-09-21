package com.dms.document.model;

import java.time.Instant;
import java.util.Base64;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;

public class DocumentVersion {

    private String id;

    @JsonProperty("document_id")
    private String documentId;

    private Document document;

    @JsonProperty("version_number")
    private int versionNumber;

    @JsonProperty("file_name")
    private String fileName;

    @JsonProperty("content_type")
    private String contentType;

    @JsonProperty("size_bytes")
    private long sizeBytes;

    private byte[] content;

    @JsonProperty("created_at")
    private Instant createdAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getDocumentId() {
        return documentId;
    }

    public void setDocumentId(String documentId) {
        this.documentId = documentId;
    }

    public int getVersionNumber() {
        return versionNumber;
    }

    public void setVersionNumber(int versionNumber) {
        this.versionNumber = versionNumber;
    }

    public String getFileName() {
        return fileName;
    }

    public void setFileName(String fileName) {
        this.fileName = fileName;
    }

    public String getContentType() {
        return contentType;
    }

    public void setContentType(String contentType) {
        this.contentType = contentType;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public void setSizeBytes(long sizeBytes) {
        this.sizeBytes = sizeBytes;
    }

    @JsonIgnore
    public byte[] getContent() {
        return content;
    }

    @JsonIgnore
    public void setContent(byte[] content) {
        this.content = content;
    }

    @JsonProperty("content")
    public String getContentBase64() {
        return content == null ? null : Base64.getEncoder().encodeToString(content);
    }

    @JsonProperty("content")
    public void setContentBase64(String contentBase64) {
        if (contentBase64 == null || contentBase64.isBlank()) {
            this.content = null;
            return;
        }
        this.content = Base64.getDecoder().decode(contentBase64);
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    @JsonIgnore
    public Document getDocument() {
        return document;
    }

    public void setDocument(Document document) {
        this.document = document;
    }
}
