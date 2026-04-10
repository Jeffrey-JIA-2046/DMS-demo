package com.dms.ocr.service;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.dms.document.model.Document;
import com.dms.document.model.DocumentVersion;
import com.dms.document.repository.DocumentRepository;
import com.dms.exception.ResourceNotFoundException;
import com.dms.extraction.service.DocumentExtractionProcessingService;
import com.dms.ocr.client.DotsOcrClient;

@Service
public class DocumentOcrProcessingService {

    private static final Logger log = LoggerFactory.getLogger(DocumentOcrProcessingService.class);

    private final DocumentRepository documentRepository;
    private final DotsOcrClient dotsOcrClient;
    private final DocumentOcrResultService documentOcrResultService;
    private final DocumentExtractionProcessingService documentExtractionProcessingService;
    private final Clock clock;

    public DocumentOcrProcessingService(
        DocumentRepository documentRepository,
        DotsOcrClient dotsOcrClient,
        DocumentOcrResultService documentOcrResultService,
        DocumentExtractionProcessingService documentExtractionProcessingService,
        Clock clock
    ) {
        this.documentRepository = documentRepository;
        this.dotsOcrClient = dotsOcrClient;
        this.documentOcrResultService = documentOcrResultService;
        this.documentExtractionProcessingService = documentExtractionProcessingService;
        this.clock = clock;
    }

    public void queueStoredDocumentOcr(String documentId, String prompt, Integer confidence) {
        queueStoredDocumentOcr(documentId, prompt, confidence, false);
    }

    public void queueStoredDocumentOcr(String documentId, String prompt, Integer confidence, boolean runDataExtraction) {
        markQueued(documentId);
        CompletableFuture.runAsync(() -> {
            try {
                processStoredDocumentOcr(documentId, prompt, confidence, runDataExtraction);
            } catch (Exception ex) {
                markFailed(documentId, ex.getMessage());
                log.warn("Background OCR failed for document {}", documentId, ex);
            }
        });
    }

    @Transactional
    public Map<String, Object> processStoredDocumentOcr(String documentId, String prompt, Integer confidence) {
        return processStoredDocumentOcr(documentId, prompt, confidence, false);
    }

    @Transactional
    public Map<String, Object> processStoredDocumentOcr(String documentId, String prompt, Integer confidence, boolean runDataExtraction) {
        try {
            Document document = documentRepository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
            updateStatus(document, "RUNNING", "OCR is running.");
            documentRepository.save(document);

            DocumentVersion version = document.getVersions().stream()
                .max(Comparator.comparingInt(DocumentVersion::getVersionNumber))
                .orElseThrow(() -> new ResourceNotFoundException("No versions found for document"));

            Map<String, Object> response = dotsOcrClient.ocrPdf(
                version.getFileName(),
                version.getContentType(),
                version.getContent(),
                prompt,
                confidence
            );

            Map<String, Object> saved = documentOcrResultService.save(documentId, prompt, confidence, response);
            document.setIsOcr(true);
            updateStatus(document, "READY", "OCR result is available.");
            documentRepository.save(document);
            if (runDataExtraction) {
                documentExtractionProcessingService.extractAndApplyMetadata(documentId, saved);
            }
            return saved;
        } catch (IOException ex) {
            throw new RuntimeException("Failed to process OCR for stored document", ex);
        }
    }

    @Transactional
    public void markDocumentOcrUnavailable(String documentId) {
        try {
            Document document = documentRepository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
            document.setIsOcr(false);
            updateStatus(document, "NOT_STARTED", "OCR has not been run for the current file version.");
            documentRepository.save(document);
            documentOcrResultService.invalidateDocumentCache(documentId);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to update OCR state", ex);
        }
    }

    @Transactional
    public void markQueued(String documentId) {
        try {
            Document document = documentRepository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
            document.setIsOcr(false);
            updateStatus(document, "QUEUED", "OCR job has been queued.");
            documentRepository.save(document);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to mark OCR as queued", ex);
        }
    }

    @Transactional
    public void markFailed(String documentId, String message) {
        try {
            Document document = documentRepository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
            document.setIsOcr(false);
            updateStatus(document, "FAILED", StringUtils.hasText(message) ? message : "OCR failed.");
            documentRepository.save(document);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to mark OCR as failed", ex);
        }
    }

    private void updateStatus(Document document, String status, String message) {
        Instant now = Instant.now(clock);
        document.setOcrStatus(status);
        document.setOcrStatusMessage(message);
        document.setOcrStatusUpdatedAt(now);
        document.setUpdatedAt(now);
    }

    public boolean shouldQueueUploadOcr(Boolean runOcr, Boolean runDataExtraction, String fileName, String contentType) {
        if (!Boolean.TRUE.equals(runOcr) && !Boolean.TRUE.equals(runDataExtraction)) {
            return false;
        }
        boolean byName = StringUtils.hasText(fileName) && fileName.toLowerCase().endsWith(".pdf");
        boolean byType = StringUtils.hasText(contentType) && contentType.toLowerCase().contains("pdf");
        return byName || byType;
    }
}