package com.dms.eform.service;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.dms.eform.dto.EformDefinitionRequest;
import com.dms.eform.dto.EformDefinitionResponse;
import com.dms.eform.model.EformDefinition;
import com.dms.eform.repository.EformDefinitionRepository;
import com.dms.exception.InvalidDocumentException;
import com.dms.exception.ResourceNotFoundException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class EformDefinitionService {

    private final EformDefinitionRepository repository;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public EformDefinitionService(EformDefinitionRepository repository, ObjectMapper objectMapper, Clock clock) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    public List<EformDefinitionResponse> listDefinitions() {
        try {
            return repository.findAllOrderByCategoryCodeAsc().stream()
                .map(this::toResponse)
                .toList();
        } catch (IOException ex) {
            throw new RuntimeException("Failed to load eForm definitions", ex);
        }
    }

    public Optional<EformDefinitionResponse> findByCategoryCode(String categoryCode) {
        String normalizedCode = normalizeCode(categoryCode);
        if (!StringUtils.hasText(normalizedCode)) {
            return Optional.empty();
        }

        try {
            return repository.findByCategoryCode(normalizedCode).map(this::toResponse);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to read eForm definition", ex);
        }
    }

    public EformDefinitionResponse getByCategoryCode(String categoryCode) {
        return findByCategoryCode(categoryCode)
            .orElseThrow(() -> new ResourceNotFoundException("eForm schema not found for category '" + categoryCode + "'"));
    }

    public EformDefinitionResponse upsert(EformDefinitionRequest request, String actorUsername) {
        String normalizedCode = normalizeCode(request.categoryCode());
        if (!StringUtils.hasText(normalizedCode)) {
            throw new InvalidDocumentException("Category code is required");
        }

        Map<String, Object> schema = request.schema();
        if (schema == null || schema.isEmpty()) {
            throw new InvalidDocumentException("Form schema is required");
        }

        Instant now = Instant.now(clock);
        try {
            Optional<EformDefinition> existing = repository.findByCategoryCode(normalizedCode);
            EformDefinition definition = existing.orElseGet(EformDefinition::new);
            definition.setCategoryCode(normalizedCode);
            definition.setCategoryLabel(StringUtils.hasText(request.categoryLabel()) ? request.categoryLabel().trim() : normalizedCode);
            definition.setSchemaJson(objectMapper.writeValueAsString(schema));
            definition.setCreatedBy(StringUtils.hasText(actorUsername) ? actorUsername : "system");
            if (definition.getCreatedAt() == null) {
                definition.setCreatedAt(now);
            }
            definition.setUpdatedAt(now);

            return toResponse(repository.upsert(definition));
        } catch (IOException ex) {
            throw new RuntimeException("Failed to save eForm definition", ex);
        }
    }

    public void deleteByCategoryCode(String categoryCode) {
        try {
            repository.deleteByCategoryCode(categoryCode);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to delete eForm definition", ex);
        }
    }

    public Set<String> resolveMetadataKeysForCategory(String categoryCode) {
        Optional<EformDefinitionResponse> maybe = findByCategoryCode(categoryCode);
        if (maybe.isEmpty()) {
            return Collections.emptySet();
        }
        return extractMetadataKeys(maybe.get().schema());
    }

    private EformDefinitionResponse toResponse(EformDefinition definition) {
        Map<String, Object> schema;
        try {
            schema = objectMapper.readValue(
                StringUtils.hasText(definition.getSchemaJson()) ? definition.getSchemaJson() : "{}",
                new TypeReference<Map<String, Object>>() {
                }
            );
        } catch (Exception ex) {
            schema = Map.of();
        }

        return new EformDefinitionResponse(
            definition.getId(),
            definition.getCategoryCode(),
            definition.getCategoryLabel(),
            schema,
            definition.getCreatedBy(),
            definition.getCreatedAt(),
            definition.getUpdatedAt()
        );
    }

    private Set<String> extractMetadataKeys(Map<String, Object> schema) {
        if (schema == null || schema.isEmpty()) {
            return Collections.emptySet();
        }

        Set<String> keys = new LinkedHashSet<>();
        collectComponentKeys(schema, keys);
        return keys;
    }

    @SuppressWarnings("unchecked")
    private void collectComponentKeys(Object node, Set<String> keys) {
        if (node instanceof Map<?, ?> rawMap) {
            Map<String, Object> map = (Map<String, Object>) rawMap;
            Object keyRaw = map.get("key");
            Object typeRaw = map.get("type");
            Object inputRaw = map.get("input");

            String key = keyRaw instanceof String ? ((String) keyRaw).trim() : "";
            String type = typeRaw instanceof String ? ((String) typeRaw).trim().toLowerCase(Locale.ROOT) : "";
            boolean isInput = !(inputRaw instanceof Boolean flag) || flag.booleanValue();

            if (StringUtils.hasText(key)
                && isInput
                && !"button".equals(type)
                && !"content".equals(type)
                && !"columns".equals(type)
                && !"fieldset".equals(type)
                && !"panel".equals(type)
                && !"tabs".equals(type)
                && !"table".equals(type)) {
                keys.add(key);
            }

            for (Object value : map.values()) {
                collectComponentKeys(value, keys);
            }
            return;
        }

        if (node instanceof List<?> list) {
            for (Object item : list) {
                collectComponentKeys(item, keys);
            }
        }
    }

    private String normalizeCode(String categoryCode) {
        if (!StringUtils.hasText(categoryCode)) {
            return null;
        }
        return categoryCode.trim().toUpperCase(Locale.ROOT);
    }
}
