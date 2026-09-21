package com.dms.document.model;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;

public class DocumentApprovalNote {

    private String id;

    @JsonProperty("document_id")
    private String documentId;

    @JsonProperty("author_id")
    private String authorId;

    @JsonProperty("author_name")
    private String authorName;

    private com.dms.user.model.AppUser author;

    private String note;

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

    public String getAuthorId() {
        return authorId;
    }

    public void setAuthorId(String authorId) {
        this.authorId = authorId;
    }

    public String getAuthorName() {
        return authorName;
    }

    public void setAuthorName(String authorName) {
        this.authorName = authorName;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    @JsonIgnore
    public com.dms.user.model.AppUser getAuthor() {
        return author;
    }

    public void setAuthor(com.dms.user.model.AppUser author) {
        this.author = author;
    }
}
