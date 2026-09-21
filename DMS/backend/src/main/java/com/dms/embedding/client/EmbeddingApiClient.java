package com.dms.embedding.client;

import java.time.Duration;
import java.util.LinkedHashMap;
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

import com.dms.embedding.config.EmbeddingApiProperties;
import com.dms.exception.AiServiceException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class EmbeddingApiClient {

    private final EmbeddingApiProperties properties;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate;

    public EmbeddingApiClient(EmbeddingApiProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        HttpComponentsClientHttpRequestFactory requestFactory = new HttpComponentsClientHttpRequestFactory();
        Duration timeout = properties.getTimeout() != null ? properties.getTimeout() : Duration.ofSeconds(180);
        int timeoutMs = (int) timeout.toMillis();
        requestFactory.setConnectTimeout(timeoutMs);
        requestFactory.setConnectionRequestTimeout(timeoutMs);
        requestFactory.setReadTimeout(timeoutMs);
        this.restTemplate = new RestTemplate(requestFactory);
    }

    public Map<String, Object> startJob(Map<String, Object> payload) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> requestEntity = new HttpEntity<>(payload, headers);

        ResponseEntity<String> response;
        try {
            response = restTemplate.exchange(properties.startJobUri(), HttpMethod.POST, requestEntity, String.class);
        } catch (HttpStatusCodeException ex) {
            throw new AiServiceException("Embedding API request failed (status %d): %s".formatted(ex.getStatusCode().value(), trimBody(ex.getResponseBodyAsString())));
        } catch (ResourceAccessException ex) {
            throw new AiServiceException("Failed to call embedding API", ex);
        }

        if (!response.getStatusCode().is2xxSuccessful()) {
            throw new AiServiceException("Embedding API request failed (status %d): %s".formatted(response.getStatusCode().value(), trimBody(response.getBody())));
        }

        try {
            return objectMapper.readValue(response.getBody(), new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception ex) {
            throw new AiServiceException("Failed to parse embedding API response", ex);
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