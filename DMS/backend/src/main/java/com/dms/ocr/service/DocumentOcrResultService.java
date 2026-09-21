package com.dms.ocr.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.dms.document.repository.DocumentRepository;
import com.dms.exception.ResourceNotFoundException;
import com.dms.ocr.model.DocumentOcrResult;
import com.dms.ocr.repository.DocumentOcrResultRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class DocumentOcrResultService {

    private static final Logger log = LoggerFactory.getLogger(DocumentOcrResultService.class);
    private static final String DEFAULT_PROMPT = "prompt_ocr";
    private static final int DEFAULT_CONFIDENCE = 95;

    private final DocumentOcrResultRepository repository;
    private final DocumentRepository documentRepository;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public DocumentOcrResultService(
        DocumentOcrResultRepository repository,
        DocumentRepository documentRepository,
        ObjectMapper objectMapper,
        Clock clock
    ) {
        this.repository = repository;
        this.documentRepository = documentRepository;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    public Optional<Map<String, Object>> findCached(String documentId, String prompt, Integer confidence) {
        try {
            String normalizedPrompt = normalizePrompt(prompt);
            int normalizedConfidence = normalizeConfidence(confidence);
            return repository.findByDocumentIdAndPromptAndConfidence(documentId, normalizedPrompt, normalizedConfidence)
                .map(this::toCachedPayload);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to lookup cached OCR result", ex);
        }
    }

    public Map<String, Object> getCachedOrThrow(String documentId, String prompt, Integer confidence) {
        return findCached(documentId, prompt, confidence)
            .orElseThrow(() -> new ResourceNotFoundException("No cached OCR result found for this document and prompt."));
    }

    @Transactional
    public void invalidateDocumentCache(String documentId) {
        try {
            for (DocumentOcrResult record : repository.findAllByDocumentId(documentId)) {
                if (StringUtils.hasText(record.getId())) {
                    repository.deleteById(record.getId());
                }
            }
        } catch (IOException ex) {
            throw new RuntimeException("Failed to invalidate OCR cache", ex);
        }
    }

    @Transactional
    public Map<String, Object> save(String documentId, String prompt, Integer confidence, Map<String, Object> responsePayload) {
        try {
            String normalizedPrompt = normalizePrompt(prompt);
            int normalizedConfidence = normalizeConfidence(confidence);
            DocumentOcrResult record = repository.findByDocumentIdAndPromptAndConfidence(documentId, normalizedPrompt, normalizedConfidence)
                .orElseGet(DocumentOcrResult::new);

            if (!StringUtils.hasText(record.getId())) {
                record.setId(buildStableId(documentId, normalizedPrompt, normalizedConfidence));
                record.setCachedAt(Instant.now(clock));
            }

            record.setDocumentId(documentId);
            record.setPrompt(normalizedPrompt);
            record.setConfidence(normalizedConfidence);
            record.setResponseJson(objectMapper.writeValueAsString(responsePayload));
            record.setUpdatedAt(Instant.now(clock));

            DocumentOcrResult saved = repository.save(record);
            return toCachedPayload(saved);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to save OCR result", ex);
        }
    }

    @Transactional
    public Map<String, Object> saveExtractionResult(String documentId, String prompt, Integer confidence, String formType, Map<String, Object> extractedJson) {
        try {
            String normalizedPrompt = normalizePrompt(prompt);
            int normalizedConfidence = normalizeConfidence(confidence);

            DocumentOcrResult record = repository.findByDocumentIdAndPromptAndConfidence(documentId, normalizedPrompt, normalizedConfidence)
                .orElseGet(DocumentOcrResult::new);

            if (!StringUtils.hasText(record.getId())) {
                record.setId(buildStableId(documentId, normalizedPrompt, normalizedConfidence));
                record.setCachedAt(Instant.now(clock));
            }

            Map<String, Object> payload = new LinkedHashMap<>();
            if (StringUtils.hasText(record.getResponseJson())) {
                try {
                    payload.putAll(objectMapper.readValue(record.getResponseJson(), new TypeReference<LinkedHashMap<String, Object>>() {}));
                } catch (Exception ignored) {
                    // keep payload empty when old JSON cannot be parsed
                }
            }

            payload.put("extracted_json", extractedJson != null ? extractedJson : Map.of());
            if (StringUtils.hasText(formType)) {
                payload.put("form_type", formType.trim());
            }
            payload.put("has_data_extraction", true);
            payload.put("dms_extraction_saved_at", Instant.now(clock).toString());

            record.setDocumentId(documentId);
            record.setPrompt(normalizedPrompt);
            record.setConfidence(normalizedConfidence);
            record.setResponseJson(objectMapper.writeValueAsString(payload));
            record.setUpdatedAt(Instant.now(clock));

            DocumentOcrResult saved = repository.save(record);
            persistExtractionInDocumentMetadata(documentId, payload);
            return toCachedPayload(saved);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to save extraction result", ex);
        }
    }

    private void persistExtractionInDocumentMetadata(String documentId, Map<String, Object> payload) throws IOException {
        Object extracted = payload.get("extracted_json");
        Map<String, Object> extractedObject = extracted instanceof Map<?, ?> extractedMap
            ? objectMapper.convertValue(extractedMap, new TypeReference<LinkedHashMap<String, Object>>() {})
            : new LinkedHashMap<>();

        String formType = String.valueOf(payload.getOrDefault("form_type", "form1"));
        Instant savedAt = Instant.now(clock);

        try {
            documentRepository.updateExtractionFields(documentId, true, extractedObject, formType, savedAt);
            log.info("Updated extraction fields in dms-documents for document {}", documentId);
        } catch (Exception ex) {
            log.error("Failed to update extraction fields in dms-documents for document {}: {}", documentId, ex.getMessage(), ex);
            throw ex instanceof IOException ? (IOException) ex : new IOException("OpenSearch update failed", ex);
        }
    }

    private Map<String, Object> toCachedPayload(DocumentOcrResult record) {
        Map<String, Object> payload;
        try {
            payload = objectMapper.readValue(record.getResponseJson(), new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception ex) {
            payload = new LinkedHashMap<>();
            payload.put("ok", false);
            payload.put("message", "Cached OCR payload is not valid JSON.");
        }

        payload.put("dms_cached", true);
        payload.put("dms_cached_at", record.getCachedAt() != null ? record.getCachedAt().toString() : null);
        payload.put("dms_cached_updated_at", record.getUpdatedAt() != null ? record.getUpdatedAt().toString() : null);
        payload.put("dms_prompt", record.getPrompt());
        payload.put("dms_confidence", record.getConfidence() != null ? record.getConfidence() : DEFAULT_CONFIDENCE);
        payload.put("has_data_extraction", hasSavedExtraction(payload));
        return payload;
    }

    private String normalizePrompt(String prompt) {
        return StringUtils.hasText(prompt) ? prompt.trim() : DEFAULT_PROMPT;
    }

    private int normalizeConfidence(Integer confidence) {
        if (confidence == null) return DEFAULT_CONFIDENCE;
        return Math.max(0, Math.min(100, confidence));
    }

    private boolean hasSavedExtraction(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return false;
        }
        Object explicit = payload.get("has_data_extraction");
        if (explicit instanceof Boolean booleanValue) {
            return booleanValue;
        }
        if (explicit instanceof String text) {
            String normalized = text.trim();
            if (!normalized.isEmpty()) {
                return Boolean.parseBoolean(normalized);
            }
        }
        Object savedAt = payload.get("dms_extraction_saved_at");
        if (savedAt instanceof String savedAtText && StringUtils.hasText(savedAtText)) {
            return true;
        }
        return payload.containsKey("extracted_json");
    }

    private String buildStableId(String documentId, String prompt, int confidence) {
        String key = documentId + "::" + prompt + "::" + confidence;
        return UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8)).toString();
    }
}
