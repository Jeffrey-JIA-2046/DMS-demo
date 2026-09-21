package com.dms.extraction.service;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.dms.document.model.Document;
import com.dms.document.model.DocumentFolder;
import com.dms.document.model.FolderMetadataField;
import com.dms.document.repository.DocumentRepository;
import com.dms.extraction.client.ExtractionApiClient;
import com.dms.exception.InvalidDocumentException;
import com.dms.exception.ResourceNotFoundException;

@Service
public class DocumentExtractionProcessingService {

    private static final Logger log = LoggerFactory.getLogger(DocumentExtractionProcessingService.class);
    private static final List<String> PLACEHOLDER_VALUES = List.of("n/a", "na", "not available", "not found", "none", "null", "undefined", "unknown");
    private static final String META_DOCUMENT_DATE = "documentDate";
    private static final String META_APPROVAL_DATE = "approvalDate";
    private static final String META_EXPIRY_DATE = "expiryDate";
    private static final String META_ARCHIVE_DATE = "archiveDate";
    private static final String META_REMINDER_DATE = "reminderDate";

    private final DocumentRepository documentRepository;
    private final ExtractionApiClient extractionApiClient;

    public DocumentExtractionProcessingService(
        DocumentRepository documentRepository,
        ExtractionApiClient extractionApiClient
    ) {
        this.documentRepository = documentRepository;
        this.extractionApiClient = extractionApiClient;
    }

    public void extractAndApplyMetadata(String documentId, Map<String, Object> ocrPayload) {
        Document document;
        try {
            document = documentRepository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
        } catch (IOException ex) {
            throw new RuntimeException("Failed to load document for extraction", ex);
        }
        DocumentFolder folder = document.getFolder();
        List<FolderMetadataField> metadataTemplate = folder != null ? folder.getMetadataTemplate() : List.of();
        if (metadataTemplate == null || metadataTemplate.isEmpty()) {
            return;
        }

        String ocrText = extractOcrText(ocrPayload);
        if (!StringUtils.hasText(ocrText)) {
            log.info("Skipping extraction for document {} because OCR text is empty", documentId);
            return;
        }

        Map<String, String> extracted = extractionApiClient.extract(ocrText, metadataTemplate);
        Map<String, String> filtered = extracted.entrySet().stream()
            .filter(entry -> StringUtils.hasText(entry.getKey()))
            .filter(entry -> isMeaningfulValue(entry.getValue()))
            .collect(java.util.stream.Collectors.toMap(
                Map.Entry::getKey,
                entry -> entry.getValue().trim(),
                (left, right) -> right,
                java.util.LinkedHashMap::new
            ));

        if (filtered.isEmpty()) {
            log.info("Skipping metadata update for document {} because extraction returned no meaningful values", documentId);
            return;
        }

        applyExtractedMetadata(document, filtered);
    }

    private void applyExtractedMetadata(Document document, Map<String, String> extractedMetadata) {
        DocumentFolder folder = document.getFolder();
        Map<String, String> mergedMetadata = new LinkedHashMap<>();
        if (document.getMetadataValues() != null) {
            mergedMetadata.putAll(document.getMetadataValues());
        }
        if (extractedMetadata != null) {
            extractedMetadata.forEach((key, value) -> {
                if (StringUtils.hasText(key) && StringUtils.hasText(value)) {
                    mergedMetadata.put(key.trim(), value.trim());
                }
            });
        }

        document.setMetadataValues(resolveMetadataValues(folder, mergedMetadata));
        document.setUpdatedAt(Instant.now());
        try {
            documentRepository.save(document);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to save extracted metadata", ex);
        }
    }

    private Map<String, String> resolveMetadataValues(DocumentFolder folder, Map<String, String> rawMetadata) {
        Map<String, String> sanitizedInput = new HashMap<>();
        if (rawMetadata != null) {
            rawMetadata.forEach((key, value) -> {
                if (key != null) {
                    sanitizedInput.put(key.trim(), value);
                }
            });
        }

        Map<String, String> resolved = new LinkedHashMap<>();
        if (folder != null) {
            List<FolderMetadataField> template = folder.getMetadataTemplate();
            if (template != null && !template.isEmpty()) {
                for (FolderMetadataField field : template) {
                    String provided = sanitizedInput.get(field.getKey());
                    String normalized = normalizeMetadataValue(field, provided);
                    if (!StringUtils.hasText(normalized)) {
                        if (field.isRequired()) {
                            throw new InvalidDocumentException("Metadata field '" + field.getLabel() + "' is required for folder '" + folder.getName() + "'");
                        }
                    } else {
                        resolved.put(field.getKey(), normalized);
                    }
                }
            }
        }

        copySystemDateMetadata(sanitizedInput, resolved);
        return resolved;
    }

    private void copySystemDateMetadata(Map<String, String> source, Map<String, String> target) {
        copyIsoDateField(source, target, META_DOCUMENT_DATE);
        copyIsoDateField(source, target, META_EXPIRY_DATE);
        copyIsoDateField(source, target, META_APPROVAL_DATE);
        copyIsoDateField(source, target, META_ARCHIVE_DATE);
        copyIsoDateField(source, target, META_REMINDER_DATE);
    }

    private void copyIsoDateField(Map<String, String> source, Map<String, String> target, String key) {
        String rawValue = source.get(key);
        if (!StringUtils.hasText(rawValue)) {
            return;
        }
        try {
            target.put(key, LocalDate.parse(rawValue.trim()).toString());
        } catch (DateTimeParseException ex) {
            throw new InvalidDocumentException("Metadata field '" + key + "' must be a valid ISO-8601 date (YYYY-MM-DD)");
        }
    }

    private String normalizeMetadataValue(FolderMetadataField field, String rawValue) {
        if (!StringUtils.hasText(rawValue)) {
            return null;
        }
        String trimmed = rawValue.trim();
        return switch (field.getType()) {
            case TEXT, DROPDOWN -> {
                if (trimmed.length() > 1024) {
                    throw new InvalidDocumentException("Metadata field '" + field.getLabel() + "' must be 1024 characters or fewer");
                }
                yield trimmed;
            }
            case NUMBER -> {
                try {
                    BigDecimal value = new BigDecimal(trimmed);
                    yield value.stripTrailingZeros().toPlainString();
                } catch (NumberFormatException ex) {
                    throw new InvalidDocumentException("Metadata field '" + field.getLabel() + "' must be a valid number");
                }
            }
            case DATE -> {
                try {
                    LocalDate date = LocalDate.parse(trimmed);
                    yield date.toString();
                } catch (DateTimeParseException ex) {
                    throw new InvalidDocumentException("Metadata field '" + field.getLabel() + "' must be a valid ISO-8601 date (YYYY-MM-DD)");
                }
            }
        };
    }

    private boolean isMeaningfulValue(String value) {
        if (!StringUtils.hasText(value)) {
            return false;
        }
        return !PLACEHOLDER_VALUES.contains(value.trim().toLowerCase());
    }

    private String extractOcrText(Map<String, Object> payload) {
        List<String> lines = new ArrayList<>();
        collectText(payload, lines);
        return String.join("\n\n", lines);
    }

    @SuppressWarnings("unchecked")
    private void collectText(Object node, List<String> lines) {
        if (node == null) {
            return;
        }
        if (node instanceof String text) {
            String trimmed = text.trim();
            if (StringUtils.hasText(trimmed)) {
                lines.add(trimmed);
            }
            return;
        }
        if (node instanceof List<?> list) {
            list.forEach(item -> collectText(item, lines));
            return;
        }
        if (node instanceof Map<?, ?> map) {
            collectText(map.get("text"), lines);
            collectText(map.get("markdown"), lines);
            collectText(map.get("md"), lines);
            collectText(map.get("content"), lines);
            collectText(map.get("md_content"), lines);
            collectText(map.get("markdown_content"), lines);
            collectText(map.get("preview_markdown"), lines);
            collectText(map.get("combined_md_content"), lines);
            Object results = map.get("results");
            if (results != null) {
                collectText(results, lines);
            }
            Object cells = map.get("cells_data");
            if (cells instanceof List<?> cellList) {
                cellList.forEach(cell -> {
                    if (cell instanceof Map<?, ?> cellMap) {
                        collectText(cellMap.get("text"), lines);
                    } else {
                        collectText(cell, lines);
                    }
                });
            }
        }
    }
}