package com.dms.document.controller;

import java.util.List;
import java.util.Set;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.dms.document.dto.ApproverOptionResponse;
import com.dms.document.dto.DocumentApprovalDecisionRequest;
import com.dms.document.dto.DocumentDetailsResponse;
import com.dms.document.dto.DocumentContentPreviewResponse;
import com.dms.document.dto.DocumentExtractionSaveRequest;
import com.dms.document.dto.DocumentFilter;
import com.dms.document.dto.DocumentSummaryResponse;
import com.dms.document.dto.DocumentUpdateRequest;
import com.dms.document.dto.DocumentUploadRequest;
import com.dms.document.dto.PageResponse;
import com.dms.document.model.DocumentStatus;
import com.dms.document.model.DocumentVersion;
import com.dms.document.repository.DocumentVersionRepository;
import com.dms.document.service.DocumentService;
import com.dms.document.service.DocumentAttachmentIndexingService;
import com.dms.document.service.DocumentVersionsContentHousekeepingService;
import com.dms.ocr.client.DotsOcrClient;
import com.dms.ocr.service.DocumentOcrProcessingService;
import com.dms.ocr.service.DocumentOcrResultService;
import com.dms.audit.service.AuditService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    private final DocumentService documentService;
    private final AuditService auditService;
    private final DotsOcrClient dotsOcrClient;
    private final DocumentOcrResultService documentOcrResultService;
    private final DocumentOcrProcessingService documentOcrProcessingService;
    private final DocumentAttachmentIndexingService documentAttachmentIndexingService;
    private final DocumentVersionsContentHousekeepingService documentVersionsContentHousekeepingService;

    public DocumentController(DocumentService documentService, AuditService auditService, DotsOcrClient dotsOcrClient, DocumentOcrResultService documentOcrResultService, DocumentOcrProcessingService documentOcrProcessingService, DocumentAttachmentIndexingService documentAttachmentIndexingService, DocumentVersionsContentHousekeepingService documentVersionsContentHousekeepingService) {
        this.documentService = documentService;
        this.auditService = auditService;
        this.dotsOcrClient = dotsOcrClient;
        this.documentOcrResultService = documentOcrResultService;
        this.documentOcrProcessingService = documentOcrProcessingService;
        this.documentAttachmentIndexingService = documentAttachmentIndexingService;
        this.documentVersionsContentHousekeepingService = documentVersionsContentHousekeepingService;
    }

    @GetMapping
    public PageResponse<DocumentSummaryResponse> search(
        @RequestParam(value = "q", required = false) String query,
        @RequestParam(value = "owner", required = false) String owner,
        @RequestParam(value = "category", required = false) String category,
        @RequestParam(value = "status", required = false) DocumentStatus status,
        @RequestParam(value = "tags", required = false) Set<String> tags,
        @RequestParam(value = "folderId", required = false) String folderId,
        @RequestParam(value = "searchColumns", required = false) Set<String> searchColumns,
        @RequestParam(value = "searchOperator", required = false) String searchOperator,
        @RequestParam(value = "conditionField", required = false) List<String> conditionFields,
        @RequestParam(value = "conditionValue", required = false) List<String> conditionValues,
        @RequestParam(value = "conditionOp", required = false) List<String> conditionOperators,
        @RequestParam(value = "conditionGroup", required = false) List<Integer> conditionGroups,
        @RequestParam(value = "conditionJoin", required = false) List<String> conditionJoins,
        @RequestParam(value = "conditionOperator", required = false) String conditionOperator,
        @org.springframework.data.web.PageableDefault(size = 20, page = 0) org.springframework.data.domain.Pageable pageable,
        java.security.Principal principal
    ) {
        var filter = new DocumentFilter(
            query,
            owner,
            category,
            status,
            tags,
            folderId,
            searchColumns,
            searchOperator,
            conditionFields,
            conditionValues,
            conditionOperators,
            conditionGroups,
            conditionJoins,
            conditionOperator
        );
        return documentService.findDocuments(filter, pageable, principal != null ? principal.getName() : null);
    }

    @GetMapping("/approvers")
    public List<ApproverOptionResponse> approverOptions(java.security.Principal principal) {
        return documentService.listEligibleApprovers(principal != null ? principal.getName() : null);
    }

    @GetMapping("/supervisors")
    public List<ApproverOptionResponse> supervisorOptions(java.security.Principal principal) {
        return documentService.listEligibleSupervisors(principal != null ? principal.getName() : null);
    }

    @GetMapping("/{id}")
    public DocumentDetailsResponse get(@PathVariable String id, java.security.Principal principal) {
        return documentService.getDocument(id, principal != null ? principal.getName() : null);
    }

    @GetMapping("/versions/health")
    public DocumentVersionRepository.VersionStorageHealth getVersionStorageHealth() {
        return documentService.getVersionStorageHealth();
    }

    @PostMapping("/versions/housekeeping")
    public DocumentService.VersionHousekeepingResult runVersionHousekeeping(
        @RequestParam(value = "dryRun", required = false, defaultValue = "true") boolean dryRun
    ) {
        return documentService.runVersionHousekeeping(dryRun);
    }

    @PostMapping("/versions-content/housekeeping")
    public DocumentVersionsContentHousekeepingService.VersionsContentHousekeepingResult runVersionsContentHousekeeping(
        @RequestParam(value = "dryRun", required = false, defaultValue = "true") boolean dryRun
    ) {
        return documentVersionsContentHousekeepingService.run(dryRun);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public DocumentDetailsResponse upload(
        @Valid @RequestPart("metadata") DocumentUploadRequest metadata,
        @RequestPart("file") MultipartFile file,
        java.security.Principal principal
    ) {
        DocumentDetailsResponse resp = documentService.createDocument(metadata, file, principal != null ? principal.getName() : null);
        auditService.record("CREATE", resp.id(), principal != null ? principal.getName() : "system", "created document");
        if (documentOcrProcessingService.shouldQueueUploadOcr(metadata.runOcr(), metadata.runDataExtraction(), metadata.runEmbedding(), file.getOriginalFilename(), file.getContentType())) {
            documentOcrProcessingService.queueStoredDocumentOcr(
                resp.id(),
                null,
                null,
                Boolean.TRUE.equals(metadata.runDataExtraction()),
                Boolean.TRUE.equals(metadata.runEmbedding())
            );
            return documentService.getDocument(resp.id(), principal != null ? principal.getName() : null);
        }
        return resp;
    }

    @PostMapping(value = "/ocr/pdf", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public java.util.Map<String, Object> ocrPdf(
        @RequestParam("file") MultipartFile file,
        @RequestParam(value = "prompt", required = false) String prompt,
        @RequestParam(value = "confidence", required = false) Integer confidence
    ) {
        return dotsOcrClient.ocrPdf(file, prompt, confidence);
    }

    @PostMapping("/{id}/ocr/pdf")
    public java.util.Map<String, Object> ocrStoredPdf(
        @PathVariable String id,
        @RequestParam(value = "prompt", required = false) String prompt,
        @RequestParam(value = "confidence", required = false) Integer confidence,
        @RequestParam(value = "force", required = false, defaultValue = "false") boolean force,
        java.security.Principal principal
    ) {
        documentService.getLatestVersion(id, principal != null ? principal.getName() : null);

        if (!force) {
            java.util.Optional<java.util.Map<String, Object>> cached = documentOcrResultService.findCached(id, prompt, confidence);
            if (cached.isPresent()) {
                return cached.get();
            }
        }
        return documentOcrProcessingService.processStoredDocumentOcr(id, prompt, confidence);
    }

    @GetMapping("/{id}/ocr/pdf")
    public java.util.Map<String, Object> getCachedStoredPdfOcr(
        @PathVariable String id,
        @RequestParam(value = "prompt", required = false) String prompt,
        @RequestParam(value = "confidence", required = false) Integer confidence,
        java.security.Principal principal
    ) {
        // Validate read permission before returning cached OCR payload.
        documentService.getLatestVersion(id, principal != null ? principal.getName() : null);
        return documentOcrResultService.getCachedOrThrow(id, prompt, confidence);
    }

    @PostMapping("/{id}/extraction")
    public java.util.Map<String, Object> saveExtraction(
        @PathVariable String id,
        @RequestBody(required = false) @Valid DocumentExtractionSaveRequest request,
        java.security.Principal principal
    ) {
        documentService.getLatestVersion(id, principal != null ? principal.getName() : null);
        return documentOcrResultService.saveExtractionResult(
            id,
            request != null ? request.prompt() : null,
            request != null ? request.confidence() : null,
            request != null ? request.formType() : null,
            request != null ? request.extractedJson() : null
        );
    }

    @PostMapping(value = "/{id}/versions", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public DocumentDetailsResponse uploadVersion(@PathVariable String id, @RequestPart("file") MultipartFile file, java.security.Principal principal) {
        DocumentDetailsResponse resp = documentService.addVersion(id, file, principal != null ? principal.getName() : null);
        auditService.record("UPLOAD_VERSION", resp.id(), principal != null ? principal.getName() : "system", "added new version");
        return resp;
    }

    @PutMapping("/{id}")
    public DocumentDetailsResponse update(@PathVariable String id, @RequestBody @Valid DocumentUpdateRequest request, java.security.Principal principal) {
        DocumentDetailsResponse resp = documentService.updateDocument(id, request, principal != null ? principal.getName() : null);
        auditService.record("UPDATE", resp.id(), principal != null ? principal.getName() : "system", "updated metadata");
        return resp;
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void archive(
        @PathVariable String id,
        @RequestParam(value = "permanent", required = false, defaultValue = "false") boolean permanent,
        java.security.Principal principal
    ) {
        String actor = principal != null ? principal.getName() : "system";
        String username = principal != null ? principal.getName() : null;
        if (permanent) {
            documentService.deleteDocument(id, username);
            auditService.record("DELETE", id, actor, "permanent=true");
        } else {
            documentService.archiveDocument(id, username);
            auditService.record("ARCHIVE", id, actor, "permanent=false");
        }
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<byte[]> downloadLatest(@PathVariable String id, java.security.Principal principal) {
        DocumentVersion version = documentService.getLatestVersion(id, principal != null ? principal.getName() : null);
        return toFileResponse(version);
    }

    @GetMapping("/{id}/versions/{versionId}/download")
    public ResponseEntity<byte[]> downloadVersion(@PathVariable String id, @PathVariable String versionId, java.security.Principal principal) {
        DocumentVersion version = documentService.getVersion(id, versionId, principal != null ? principal.getName() : null);
        return toFileResponse(version);
    }

    @GetMapping("/{id}/versions/{versionId}/preview")
    public DocumentContentPreviewResponse previewVersion(@PathVariable String id, @PathVariable String versionId, java.security.Principal principal) {
        DocumentVersion version = documentService.getVersion(id, versionId, principal != null ? principal.getName() : null);
        return documentAttachmentIndexingService.buildPreview(version, 100000);
    }

    @PostMapping("/{id}/approval/notes")
    public DocumentDetailsResponse addApprovalNote(
        @PathVariable String id,
        @RequestBody @Valid DocumentApprovalDecisionRequest request,
        java.security.Principal principal
    ) {
        DocumentDetailsResponse resp = documentService.addApprovalNote(id, request, principal != null ? principal.getName() : null);
        auditService.record("APPROVAL_NOTE", id, principal != null ? principal.getName() : "system", "added note");
        return resp;
    }

    @PostMapping("/{id}/approval/approve")
    public DocumentDetailsResponse approve(
        @PathVariable String id,
        @RequestBody(required = false) @Valid DocumentApprovalDecisionRequest request,
        java.security.Principal principal
    ) {
        DocumentDetailsResponse resp = documentService.approveDocument(id, request, principal != null ? principal.getName() : null);
        auditService.record("APPROVE", id, principal != null ? principal.getName() : "system", "document approved");
        return resp;
    }

    @PostMapping("/{id}/approval/reject")
    public DocumentDetailsResponse reject(
        @PathVariable String id,
        @RequestBody(required = false) @Valid DocumentApprovalDecisionRequest request,
        java.security.Principal principal
    ) {
        DocumentDetailsResponse resp = documentService.rejectDocument(id, request, principal != null ? principal.getName() : null);
        auditService.record("REJECT", id, principal != null ? principal.getName() : "system", "document rejected");
        return resp;
    }

    @PostMapping("/{id}/approval/delegate")
    public DocumentDetailsResponse delegateApproval(
        @PathVariable String id,
        @RequestBody @Valid DocumentApprovalDecisionRequest request,
        java.security.Principal principal
    ) {
        DocumentDetailsResponse resp = documentService.delegateApproval(id, request, principal != null ? principal.getName() : null);
        auditService.record("DELEGATE", id, principal != null ? principal.getName() : "system", "approval delegated");
        return resp;
    }

    private ResponseEntity<byte[]> toFileResponse(DocumentVersion version) {
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(version.getContentType() == null ? MediaType.APPLICATION_OCTET_STREAM_VALUE : version.getContentType()))
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + version.getFileName())
            .body(version.getContent());
    }
}
