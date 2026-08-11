package com.dms.extraction.client;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import com.dms.document.model.FolderMetadataField;
import com.dms.exception.AiServiceException;
import com.dms.extraction.config.ExtractionApiProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class ExtractionApiClient {

    private final ExtractionApiProperties properties;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate;

    public ExtractionApiClient(ExtractionApiProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        HttpComponentsClientHttpRequestFactory requestFactory = new HttpComponentsClientHttpRequestFactory();
        Duration timeout = properties.getTimeout() != null ? properties.getTimeout() : Duration.ofSeconds(180);
        int timeoutMs = (int) timeout.toMillis();
        requestFactory.setConnectTimeout(timeoutMs);
        requestFactory.setConnectionRequestTimeout(timeoutMs);
        this.restTemplate = new RestTemplate(requestFactory);
    }

    public Map<String, String> extract(String ocrText, List<FolderMetadataField> metadataTemplate) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ocr_text", ocrText);
        body.put("form_type", "folder_metadata");
        body.put("metadata_template", metadataTemplate == null ? List.of() : metadataTemplate);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> requestEntity = new HttpEntity<>(body, headers);

        ResponseEntity<String> response;
        try {
            response = restTemplate.exchange(properties.extractUri(), HttpMethod.POST, requestEntity, String.class);
        } catch (HttpStatusCodeException ex) {
            throw new AiServiceException("Extraction API request failed (status %d): %s".formatted(ex.getStatusCode().value(), trimBody(ex.getResponseBodyAsString())));
        } catch (ResourceAccessException ex) {
            throw new AiServiceException("Failed to call extraction API", ex);
        }

        if (!response.getStatusCode().is2xxSuccessful()) {
            throw new AiServiceException("Extraction API request failed (status %d): %s".formatted(response.getStatusCode().value(), trimBody(response.getBody())));
        }

        try {
            Map<String, Object> payload = objectMapper.readValue(response.getBody(), new TypeReference<LinkedHashMap<String, Object>>() {});
            Object extracted = payload.get("extracted_json");
            if (!(extracted instanceof Map<?, ?> extractedMap)) {
                return Map.of();
            }
            Map<String, String> normalized = new LinkedHashMap<>();
            extractedMap.forEach((key, value) -> {
                if (key != null && value != null) {
                    normalized.put(String.valueOf(key), String.valueOf(value));
                }
            });
            return normalized;
        } catch (Exception ex) {
            throw new AiServiceException("Failed to parse extraction API response", ex);
        }
    }

    private String trimBody(String body) {
        if (body == null || body.isBlank()) {
            return "";
        }
        String normalized = body.trim().replaceAll("\\s+", " ");
        if (normalized.length() <= 220) {
            return normalized;
        }
        return normalized.substring(0, 220) + "...";
    }
}