package com.dms.knowledge.controller;

import java.security.Principal;
import java.util.Set;

import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpHeaders;
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
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.dms.document.dto.PageResponse;
import com.dms.knowledge.dto.KnowledgeContributionRequest;
import com.dms.knowledge.dto.KnowledgeDocumentLinkRequest;
import com.dms.knowledge.dto.KnowledgeShareRequest;
import com.dms.knowledge.dto.KnowledgeTopicDetailsResponse;
import com.dms.knowledge.dto.KnowledgeTopicRequest;
import com.dms.knowledge.dto.KnowledgeTopicSummaryResponse;
import com.dms.knowledge.dto.KnowledgeTopicUpdateRequest;
import com.dms.knowledge.model.KnowledgeTopicUpload;
import com.dms.knowledge.service.KnowledgeTopicService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/knowledge/topics")
public class KnowledgeTopicController {

    private final KnowledgeTopicService knowledgeTopicService;

    public KnowledgeTopicController(KnowledgeTopicService knowledgeTopicService) {
        this.knowledgeTopicService = knowledgeTopicService;
    }

    @GetMapping
    public PageResponse<KnowledgeTopicSummaryResponse> search(
        @RequestParam(value = "q", required = false) String query,
        @RequestParam(value = "tags", required = false) Set<String> tags,
        @RequestParam(value = "starredOnly", defaultValue = "false") boolean starredOnly,
        @RequestParam(value = "joinedOnly", defaultValue = "false") boolean joinedOnly,
        @PageableDefault(size = 20, page = 0) org.springframework.data.domain.Pageable pageable,
        Principal principal
    ) {
        return knowledgeTopicService.searchTopics(query, tags, starredOnly, joinedOnly, pageable, principalName(principal));
    }

    @PostMapping
    public KnowledgeTopicDetailsResponse create(@RequestBody @Valid KnowledgeTopicRequest request, Principal principal) {
        return knowledgeTopicService.createTopic(request, principalName(principal));
    }

    @GetMapping("/{id}")
    public KnowledgeTopicDetailsResponse get(@PathVariable String id, Principal principal) {
        return knowledgeTopicService.getTopic(id, principalName(principal));
    }

    @PutMapping("/{id}")
    public KnowledgeTopicDetailsResponse update(
        @PathVariable String id,
        @RequestBody @Valid KnowledgeTopicUpdateRequest request,
        Principal principal
    ) {
        return knowledgeTopicService.updateTopic(id, request, principalName(principal));
    }

    @PostMapping("/{id}/join")
    public KnowledgeTopicDetailsResponse join(@PathVariable String id, Principal principal) {
        return knowledgeTopicService.joinTopic(id, principalName(principal));
    }

    @PostMapping("/{id}/contributions")
    public KnowledgeTopicDetailsResponse contribute(
        @PathVariable String id,
        @RequestBody @Valid KnowledgeContributionRequest request,
        Principal principal
    ) {
        return knowledgeTopicService.addContribution(id, request, principalName(principal));
    }

    @PostMapping("/{id}/share")
    public KnowledgeTopicDetailsResponse share(
        @PathVariable String id,
        @RequestBody @Valid KnowledgeShareRequest request,
        Principal principal
    ) {
        return knowledgeTopicService.shareTopic(id, request, principalName(principal));
    }

    @PostMapping("/{id}/stars")
    public KnowledgeTopicDetailsResponse star(@PathVariable String id, Principal principal) {
        return knowledgeTopicService.starTopic(id, principalName(principal));
    }

    @DeleteMapping("/{id}/stars")
    public KnowledgeTopicDetailsResponse unstar(@PathVariable String id, Principal principal) {
        return knowledgeTopicService.unstarTopic(id, principalName(principal));
    }

    @PostMapping("/{id}/links")
    public KnowledgeTopicDetailsResponse linkDocument(
        @PathVariable String id,
        @RequestBody @Valid KnowledgeDocumentLinkRequest request,
        Principal principal
    ) {
        return knowledgeTopicService.linkDocument(id, request, principalName(principal));
    }

    @DeleteMapping("/{id}/links/{linkId}")
    public KnowledgeTopicDetailsResponse unlinkDocument(
        @PathVariable String id,
        @PathVariable String linkId,
        Principal principal
    ) {
        return knowledgeTopicService.unlinkDocument(id, linkId, principalName(principal));
    }

    @PostMapping(value = "/{id}/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public KnowledgeTopicDetailsResponse upload(
        @PathVariable String id,
        @RequestPart("file") MultipartFile file,
        @RequestPart(value = "description", required = false) String description,
        Principal principal
    ) {
        return knowledgeTopicService.uploadAttachment(id, description, file, principalName(principal));
    }

    @GetMapping("/{id}/chain/download")
    public ResponseEntity<byte[]> downloadChain(@PathVariable String id, Principal principal) {
        var export = knowledgeTopicService.downloadKnowledgeChain(id, principalName(principal));
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(export.contentType()))
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + export.fileName())
            .body(export.content());
    }

    @GetMapping("/{topicId}/documents/{uploadId}/download")
    public ResponseEntity<byte[]> downloadUpload(
        @PathVariable String topicId,
        @PathVariable String uploadId,
        Principal principal
    ) {
        KnowledgeTopicUpload upload = knowledgeTopicService.fetchUpload(topicId, uploadId, principalName(principal));
        MediaType mediaType = upload.getContentType() != null
            ? MediaType.parseMediaType(upload.getContentType())
            : MediaType.APPLICATION_OCTET_STREAM;
        return ResponseEntity.ok()
            .contentType(mediaType)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + upload.getFileName())
            .body(upload.getContent());
    }

    private String principalName(Principal principal) {
        return principal != null ? principal.getName() : null;
    }
}
