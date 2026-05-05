package com.dms.ocr.service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.dms.document.model.Document;
import com.dms.document.model.DocumentFolder;
import com.dms.document.model.DocumentVersion;
import com.dms.document.repository.DocumentRepository;
import com.dms.embedding.client.EmbeddingApiClient;
import com.dms.exception.ResourceNotFoundException;
import com.dms.extraction.service.DocumentExtractionProcessingService;
import com.dms.ocr.client.DotsOcrClient;

@Service
public class DocumentOcrProcessingService {

    private static final Logger log = LoggerFactory.getLogger(DocumentOcrProcessingService.class);

    @Value("${app.ocr.batch-page-limit:32}")
    private int ocrBatchPageLimit;

    private final DocumentRepository documentRepository;
    private final DotsOcrClient dotsOcrClient;
    private final DocumentOcrResultService documentOcrResultService;
    private final DocumentExtractionProcessingService documentExtractionProcessingService;
    private final EmbeddingApiClient embeddingApiClient;
    private final Clock clock;

    public DocumentOcrProcessingService(
        DocumentRepository documentRepository,
        DotsOcrClient dotsOcrClient,
        DocumentOcrResultService documentOcrResultService,
        DocumentExtractionProcessingService documentExtractionProcessingService,
        EmbeddingApiClient embeddingApiClient,
        Clock clock
    ) {
        this.documentRepository = documentRepository;
        this.dotsOcrClient = dotsOcrClient;
        this.documentOcrResultService = documentOcrResultService;
        this.documentExtractionProcessingService = documentExtractionProcessingService;
        this.embeddingApiClient = embeddingApiClient;
        this.clock = clock;
    }

    public void queueStoredDocumentOcr(String documentId, String prompt, Integer confidence) {
        queueStoredDocumentOcr(documentId, prompt, confidence, false);
    }

    public void queueStoredDocumentOcr(String documentId, String prompt, Integer confidence, boolean runDataExtraction) {
        queueStoredDocumentOcr(documentId, prompt, confidence, runDataExtraction, false);
    }

    public void queueStoredDocumentOcr(String documentId, String prompt, Integer confidence, boolean runDataExtraction, boolean runEmbedding) {
        markQueued(documentId);
        CompletableFuture.runAsync(() -> {
            try {
                processStoredDocumentOcr(documentId, prompt, confidence, runDataExtraction, runEmbedding);
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
        return processStoredDocumentOcr(documentId, prompt, confidence, runDataExtraction, false);
    }

    @Transactional
    public Map<String, Object> processStoredDocumentOcr(String documentId, String prompt, Integer confidence, boolean runDataExtraction, boolean runEmbedding) {
        try {
            Document document = documentRepository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
            updateStatus(document, "RUNNING", "OCR is running.");
            documentRepository.save(document);

            DocumentVersion version = document.getVersions().stream()
                .max(Comparator.comparingInt(DocumentVersion::getVersionNumber))
                .orElseThrow(() -> new ResourceNotFoundException("No versions found for document"));

            Map<String, Object> response = ocrPdfInBatches(
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
            if (runEmbedding) {
                queueEmbeddingJob(document, saved);
            }
            return saved;
        } catch (IOException ex) {
            throw new RuntimeException("Failed to process OCR for stored document", ex);
        }
    }

    @SuppressWarnings("unchecked")
    private void queueEmbeddingJob(Document document, Map<String, Object> savedOcrPayload) {
        String ocrText = extractOcrText(savedOcrPayload);
        if (!StringUtils.hasText(ocrText)) {
            log.warn("Skip embedding for document {} because OCR text is empty", document.getId());
            return;
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("document_id", document.getId());
        payload.put("title", StringUtils.hasText(document.getTitle()) ? document.getTitle() : document.getId());
        payload.put("description", document.getDescription());
        payload.put("ocr_text", ocrText);
        payload.put("ocr_response_json", new LinkedHashMap<>(savedOcrPayload));
        payload.put("category", document.getCategory());
        payload.put("owner", document.getOwner());
        payload.put("tags", normalizeTags(document.getTags()));
        payload.put("document_metadata", new HashMap<>(document.getMetadataValues() != null ? document.getMetadataValues() : Map.of()));

        DocumentFolder folder = document.getFolder();
        payload.put("folder_name", folder != null ? folder.getName() : null);
        payload.put("folder_path", folder != null ? folder.getName() : null);
        payload.put("folder_breadcrumbs", buildFolderBreadcrumbs(folder));
        payload.put("created_at", document.getCreatedAt() != null ? document.getCreatedAt().toString() : null);

        try {
            Map<String, Object> response = embeddingApiClient.startJob(payload);
            log.info("Queued embedding job for document {} with response: {}", document.getId(), response);
        } catch (Exception ex) {
            // Non-fatal for OCR completion: log and continue.
            log.warn("Failed to queue embedding job for document {}", document.getId(), ex);
        }
    }

    @SuppressWarnings("unchecked")
    private String extractOcrText(Map<String, Object> savedOcrPayload) {
        Object preview = savedOcrPayload.get("preview_markdown");
        if (preview instanceof String previewText && StringUtils.hasText(previewText)) {
            return previewText;
        }

        Object results = savedOcrPayload.get("results");
        if (!(results instanceof List<?> pages)) {
            return "";
        }

        StringBuilder combined = new StringBuilder();
        for (Object pageObj : pages) {
            if (!(pageObj instanceof Map<?, ?> page)) {
                continue;
            }
            Object md = ((Map<String, Object>) page).get("md_content");
            if (md == null) {
                continue;
            }
            String mdText = String.valueOf(md).trim();
            if (!StringUtils.hasText(mdText)) {
                continue;
            }
            if (combined.length() > 0) {
                combined.append("\n\n---\n\n");
            }
            combined.append(mdText);
        }
        return combined.toString();
    }

    private List<String> normalizeTags(Set<String> tags) {
        if (tags == null || tags.isEmpty()) {
            return List.of();
        }
        return tags.stream()
            .filter(StringUtils::hasText)
            .map(String::trim)
            .distinct()
            .collect(Collectors.toList());
    }

    private List<String> buildFolderBreadcrumbs(DocumentFolder folder) {
        if (folder == null) {
            return List.of();
        }
        List<String> breadcrumbs = new ArrayList<>();
        DocumentFolder current = folder;
        while (current != null && StringUtils.hasText(current.getName())) {
            breadcrumbs.add(0, current.getName().trim());
            current = current.getParent();
        }
        return breadcrumbs;
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
        return shouldQueueUploadOcr(runOcr, runDataExtraction, false, fileName, contentType);
    }

    public boolean shouldQueueUploadOcr(Boolean runOcr, Boolean runDataExtraction, Boolean runEmbedding, String fileName, String contentType) {
        if (!Boolean.TRUE.equals(runOcr) && !Boolean.TRUE.equals(runDataExtraction) && !Boolean.TRUE.equals(runEmbedding)) {
            return false;
        }
        boolean byName = StringUtils.hasText(fileName) && fileName.toLowerCase().endsWith(".pdf");
        boolean byType = StringUtils.hasText(contentType) && contentType.toLowerCase().contains("pdf");
        return byName || byType;
    }

    /**
     * Runs OCR on a PDF, splitting it into batches of OCR_BATCH_PAGE_LIMIT pages
     * to avoid request timeouts on large documents. Results from each batch are
     * merged into a single response with correct overall page numbering.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> ocrPdfInBatches(String fileName, String contentType, byte[] content, String prompt, Integer confidence) throws IOException {
        int totalPages;
        try (PDDocument doc = PDDocument.load(new ByteArrayInputStream(content))) {
            totalPages = doc.getNumberOfPages();
        }

        if (totalPages <= ocrBatchPageLimit) {
            return dotsOcrClient.ocrPdf(fileName, contentType, content, prompt, confidence);
        }

        log.info("PDF '{}' has {} pages — splitting into batches of {} for OCR", fileName, totalPages, ocrBatchPageLimit);

        List<Map<String, Object>> allResults = new ArrayList<>();
        String baseName = StringUtils.hasText(fileName) ? fileName.replaceAll("(?i)\\.pdf$", "") : "document";

        for (int start = 0; start < totalPages; start += ocrBatchPageLimit) {
            int end = Math.min(start + ocrBatchPageLimit, totalPages);
            int pageOffset = start;

            byte[] chunkBytes = extractPdfPages(content, start, end);
            String chunkFileName = baseName + "_p" + (start + 1) + "-" + end + ".pdf";

            log.debug("OCR batch: pages {}-{} of {} for '{}'", start + 1, end, totalPages, fileName);
            Map<String, Object> batchResult = dotsOcrClient.ocrPdf(chunkFileName, contentType, chunkBytes, prompt, confidence);

            Object resultsObj = batchResult.get("results");
            if (resultsObj instanceof List<?> batchPages) {
                for (Object pageObj : batchPages) {
                    if (pageObj instanceof Map<?, ?> rawPage) {
                        Map<String, Object> page = new LinkedHashMap<>((Map<String, Object>) rawPage);
                        Object pageNo = page.get("page_no");
                        if (pageNo instanceof Number n) {
                            page.put("page_no", n.intValue() + pageOffset);
                        }
                        allResults.add(page);
                    }
                }
            }
        }

        StringBuilder preview = new StringBuilder();
        for (Map<String, Object> page : allResults) {
            Object md = page.get("md_content");
            if (md != null && !md.toString().isBlank()) {
                if (preview.length() > 0) preview.append("\n\n---\n\n");
                preview.append(md);
            }
        }

        Map<String, Object> merged = new LinkedHashMap<>();
        merged.put("ok", true);
        merged.put("pages", totalPages);
        merged.put("results", allResults);
        merged.put("preview_markdown", preview.toString());
        return merged;
    }

    private byte[] extractPdfPages(byte[] content, int startPage, int endPage) throws IOException {
        try (PDDocument src = PDDocument.load(new ByteArrayInputStream(content));
             PDDocument dest = new PDDocument()) {
            for (int i = startPage; i < endPage; i++) {
                // importPage already adds the page to dest's page tree — do not call addPage again
                dest.importPage(src.getPage(i));
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            dest.save(out);
            return out.toByteArray();
        }
    }
}