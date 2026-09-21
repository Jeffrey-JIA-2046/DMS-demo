package com.dms.repository;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.OpenSearchException;
import org.opensearch.client.opensearch._types.Refresh;
import org.opensearch.client.opensearch.core.DeleteRequest;
import org.opensearch.client.opensearch.core.GetRequest;
import org.opensearch.client.opensearch.core.IndexRequest;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.opensearch.client.opensearch.core.search.HitsMetadata;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Base class for OpenSearch repositories providing common CRUD operations.
 */
public abstract class BaseOpenSearchRepository<T> {

    protected final OpenSearchClient openSearchClient;
    protected final ObjectMapper objectMapper;
    protected final Class<T> entityClass;

    public BaseOpenSearchRepository(OpenSearchClient openSearchClient, ObjectMapper objectMapper, Class<T> entityClass) {
        this.openSearchClient = openSearchClient;
        this.objectMapper = objectMapper;
        this.entityClass = entityClass;
    }

    /**
     * Get the index name for this entity type.
     */
    abstract protected String getIndexName();

    /**
     * Find an entity by ID.
     */
    public Optional<T> findById(String id) throws IOException {
        GetRequest request = new GetRequest.Builder()
            .index(getIndexName())
            .id(id)
            .build();

        var response = openSearchClient.get(request, entityClass);
        if (response.found()) {
            return Optional.of(assignEntityId(response.source(), id));
        }
        return Optional.empty();
    }

    /**
     * Save (index) an entity.
     */
    public T save(T entity) throws IOException {
        String id = extractId(entity);
        IndexRequest.Builder<T> builder = new IndexRequest.Builder<T>()
            .index(getIndexName())
            .document(entity)
            .refresh(Refresh.WaitFor);
        if (id != null && !id.isBlank()) {
            builder.id(id);
        }

        var response = openSearchClient.index(builder.build());
        if (id == null || id.isBlank()) {
            return assignEntityId(entity, response.id());
        }
        return entity;
    }

    /**
     * Delete an entity by ID.
     */
    public void deleteById(String id) throws IOException {
        DeleteRequest request = new DeleteRequest.Builder()
            .index(getIndexName())
            .id(id)
            .refresh(Refresh.WaitFor)
            .build();

        openSearchClient.delete(request);
    }

    /**
     * Find all entities (no filter).
     */
    public List<T> findAll() throws IOException {
        SearchRequest request = new SearchRequest.Builder()
            .index(getIndexName())
            .size(10000)
            .build();

        SearchResponse<T> response = openSearchClient.search(request, entityClass);
        return extractHits(response);
    }

    /**
     * Find all with pagination.
     */
    public Page<T> findAll(Pageable pageable) throws IOException {
        int from = pageable.getPageNumber() * pageable.getPageSize();
        SearchRequest request = new SearchRequest.Builder()
            .index(getIndexName())
            .from(from)
            .size(pageable.getPageSize())
            .build();

        SearchResponse<T> response = openSearchClient.search(request, entityClass);
        HitsMetadata<T> hits = response.hits();
        List<T> content = extractHits(response);

        return new PageImpl<>(content, pageable, hits.total().value());
    }

    /**
     * Count all entities.
     */
    public long count() throws IOException {
        SearchRequest request = new SearchRequest.Builder()
            .index(getIndexName())
            .size(0)
            .build();

        try {
            SearchResponse<T> response = openSearchClient.search(request, entityClass);
            return response.hits().total().value();
        } catch (OpenSearchException ex) {
            if (isIndexNotFound(ex)) {
                return 0L;
            }
            throw ex;
        }
    }

    private boolean isIndexNotFound(OpenSearchException ex) {
        if (ex == null || ex.getMessage() == null) {
            return false;
        }
        return ex.getMessage().contains("index_not_found_exception");
    }

    /**
     * Execute a search with custom SearchRequest.
     */
    public List<T> search(SearchRequest request) throws IOException {
        SearchResponse<T> response = openSearchClient.search(request, entityClass);
        return extractHits(response);
    }

    /**
     * Execute a search with pagination.
     */
    public Page<T> search(SearchRequest.Builder requestBuilder, Pageable pageable) throws IOException {
        int from = pageable.getPageNumber() * pageable.getPageSize();
        SearchRequest request = requestBuilder
            .from(from)
            .size(pageable.getPageSize())
            .build();

        SearchResponse<T> response = openSearchClient.search(request, entityClass);
        HitsMetadata<T> hits = response.hits();
        List<T> content = extractHits(response);

        return new PageImpl<>(content, pageable, hits.total().value());
    }

    /**
     * Extract hits from search response.
     */
    protected List<T> extractHits(SearchResponse<T> response) {
        List<T> results = new ArrayList<>();
        if (response.hits() != null && response.hits().hits() != null) {
            for (Hit<T> hit : response.hits().hits()) {
                if (hit.source() != null) {
                    results.add(ensureEntityId(hit));
                }
            }
        }
        return results;
    }

    private T ensureEntityId(Hit<T> hit) {
        T source = hit.source();
        if (source == null || hit.id() == null || hit.id().isBlank()) {
            return source;
        }
        return assignEntityId(source, hit.id());
    }

    private T assignEntityId(T source, String id) {
        if (source == null || id == null || id.isBlank()) {
            return source;
        }
        try {
            Map<String, Object> value = objectMapper.convertValue(source, Map.class);
            Object existingId = value.get("id");
            if (existingId != null && !existingId.toString().isBlank()) {
                return source;
            }
            value.put("id", id);
            return objectMapper.convertValue(value, entityClass);
        } catch (Exception ex) {
            // If ID backfill fails, keep original source to avoid breaking read paths.
            return source;
        }
    }

    /**
     * Extract ID from entity. Override if ID field has a different name.
     */
    protected String extractId(T entity) {
        try {
            Object idValue = objectMapper.convertValue(entity, java.util.Map.class).get("id");
            return idValue != null ? idValue.toString() : null;
        } catch (Exception e) {
            throw new RuntimeException("Failed to extract ID from entity", e);
        }
    }
}
