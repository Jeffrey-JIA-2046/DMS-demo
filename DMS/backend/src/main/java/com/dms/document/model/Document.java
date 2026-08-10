package com.dms.document.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.annotation.JsonProperty;

public class Document {

    private String id;
    private String title;
    private String description;
    private String owner;
    private String category;

    @JsonProperty("category_code")
    private String categoryCode;

    @JsonProperty("category_label")
    private String categoryLabel;

    private DocumentStatus status = DocumentStatus.DRAFT;

    @JsonProperty("folder_id")
    private String folderId;

    @JsonProperty("approver_id")
    private String approverId;

    @JsonProperty("reviewer_id")
    private String reviewerId;

    @JsonProperty("supervisor_id")
    private String supervisorId;

    private DocumentFolder folder;
    private com.dms.user.model.AppUser approver;
    private com.dms.user.model.AppUser reviewer;
    private com.dms.user.model.AppUser supervisor;

    private Set<String> tags = new HashSet<>();
    private List<DocumentVersion> versions = new ArrayList<>();
    private Map<String, String> metadataValues = new LinkedHashMap<>();

    @JsonProperty("approval_requested_at")
    private Instant approvalRequestedAt;

    @JsonProperty("approval_decided_at")
    private Instant approvalDecidedAt;

    private List<DocumentApprovalNote> approvalNotes = new ArrayList<>();

    @JsonProperty("created_at")
    private Instant createdAt;

    @JsonProperty("updated_at")
    private Instant updatedAt;

    @JsonProperty("is_ocr")
    private Boolean isOcr = false;

    @JsonProperty("ocr_status")
    private String ocrStatus = "NOT_STARTED";

    @JsonProperty("ocr_status_message")
    private String ocrStatusMessage;

    @JsonProperty("ocr_status_updated_at")
    private Instant ocrStatusUpdatedAt;

    @JsonProperty("has_data_extraction")
    private Boolean hasDataExtraction = false;

    @JsonProperty("extracted_json")
    private Map<String, Object> extractedJson = new LinkedHashMap<>();

    @JsonProperty("extraction_form_type")
    private String extractionFormType;

    @JsonProperty("extraction_saved_at")
    private Instant extractionSavedAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getOwner() {
        return owner;
    }

    public void setOwner(String owner) {
        this.owner = owner;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getCategoryCode() {
        return categoryCode;
    }

    public void setCategoryCode(String categoryCode) {
        this.categoryCode = categoryCode;
    }

    public String getCategoryLabel() {
        return categoryLabel;
    }

    public void setCategoryLabel(String categoryLabel) {
        this.categoryLabel = categoryLabel;
    }

    public DocumentStatus getStatus() {
        return status;
    }

    public void setStatus(DocumentStatus status) {
        this.status = status;
    }

    public Set<String> getTags() {
        return tags;
    }

    public void setTags(Set<String> tags) {
        this.tags = tags;
    }

    public List<DocumentVersion> getVersions() {
        return versions;
    }

    public String getFolderId() {
        return folderId;
    }

    public void setFolderId(String folderId) {
        this.folderId = folderId;
    }

    public String getApproverId() {
        return approverId;
    }

    public void setApproverId(String approverId) {
        this.approverId = approverId;
    }

    public String getReviewerId() {
        return reviewerId;
    }

    public void setReviewerId(String reviewerId) {
        this.reviewerId = reviewerId;
    }

    public String getSupervisorId() {
        return supervisorId;
    }

    public void setSupervisorId(String supervisorId) {
        this.supervisorId = supervisorId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Instant getApprovalRequestedAt() {
        return approvalRequestedAt;
    }

    public void setApprovalRequestedAt(Instant approvalRequestedAt) {
        this.approvalRequestedAt = approvalRequestedAt;
    }

    public Instant getApprovalDecidedAt() {
        return approvalDecidedAt;
    }

    public void setApprovalDecidedAt(Instant approvalDecidedAt) {
        this.approvalDecidedAt = approvalDecidedAt;
    }

    public void addVersion(DocumentVersion version) {
        version.setDocumentId(this.id);
        this.versions.add(0, version);
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public Boolean getIsOcr() {
        return isOcr;
    }

    public void setIsOcr(Boolean isOcr) {
        this.isOcr = isOcr;
    }

    public String getOcrStatus() {
        return ocrStatus;
    }

    public void setOcrStatus(String ocrStatus) {
        this.ocrStatus = ocrStatus;
    }

    public String getOcrStatusMessage() {
        return ocrStatusMessage;
    }

    public void setOcrStatusMessage(String ocrStatusMessage) {
        this.ocrStatusMessage = ocrStatusMessage;
    }

    public Instant getOcrStatusUpdatedAt() {
        return ocrStatusUpdatedAt;
    }

    public void setOcrStatusUpdatedAt(Instant ocrStatusUpdatedAt) {
        this.ocrStatusUpdatedAt = ocrStatusUpdatedAt;
    }

    public Boolean getHasDataExtraction() {
        return hasDataExtraction;
    }

    public void setHasDataExtraction(Boolean hasDataExtraction) {
        this.hasDataExtraction = hasDataExtraction;
    }

    public Map<String, Object> getExtractedJson() {
        return extractedJson;
    }

    public void setExtractedJson(Map<String, Object> extractedJson) {
        this.extractedJson = extractedJson != null ? new LinkedHashMap<>(extractedJson) : new LinkedHashMap<>();
    }

    public String getExtractionFormType() {
        return extractionFormType;
    }

    public void setExtractionFormType(String extractionFormType) {
        this.extractionFormType = extractionFormType;
    }

    public Instant getExtractionSavedAt() {
        return extractionSavedAt;
    }

    public void setExtractionSavedAt(Instant extractionSavedAt) {
        this.extractionSavedAt = extractionSavedAt;
    }

    public Map<String, String> getMetadataValues() {
        return metadataValues;
    }

    public void setMetadataValues(Map<String, String> metadataValues) {
        this.metadataValues = metadataValues != null ? new LinkedHashMap<>(metadataValues) : new LinkedHashMap<>();
    }

    public List<DocumentApprovalNote> getApprovalNotes() {
        return approvalNotes;
    }

    public void setApprovalNotes(List<DocumentApprovalNote> approvalNotes) {
        this.approvalNotes = approvalNotes;
    }

    public void addApprovalNote(DocumentApprovalNote note) {
        if (note == null) {
            return;
        }
        note.setDocumentId(this.id);
        this.approvalNotes.add(note);
    }

    public DocumentFolder getFolder() {
        return folder;
    }

    public void setFolder(DocumentFolder folder) {
        this.folder = folder;
    }

    public com.dms.user.model.AppUser getApprover() {
        return approver;
    }

    public void setApprover(com.dms.user.model.AppUser approver) {
        this.approver = approver;
    }

    public com.dms.user.model.AppUser getReviewer() {
        return reviewer;
    }

    public void setReviewer(com.dms.user.model.AppUser reviewer) {
        this.reviewer = reviewer;
    }

    public com.dms.user.model.AppUser getSupervisor() {
        return supervisor;
    }

    public void setSupervisor(com.dms.user.model.AppUser supervisor) {
        this.supervisor = supervisor;
    }
}
