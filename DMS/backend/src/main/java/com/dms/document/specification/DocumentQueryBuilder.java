package com.dms.document.specification;

import java.util.HashMap;
import java.util.Map;

/**
 * Helper class to build OpenSearch query DSL for document filtering.
 * Returns query as a Map that can be serialized to JSON.
 */
public class DocumentQueryBuilder {

    private final Map<String, Object> mustClauses = new HashMap<>();
    private final Map<String, Object>[] shouldClauses = new HashMap[0];
    private int shouldCount = 0;

    public DocumentQueryBuilder matchesQuery(String searchTerm) {
        if (searchTerm != null && !searchTerm.isBlank()) {
            Map<String, Object> multiMatch = new HashMap<>();
            Map<String, Object> multiMatchQuery = new HashMap<>();
            multiMatchQuery.put("query", searchTerm);
            multiMatchQuery.put("fields", new String[]{"title", "description", "tags"});
            multiMatch.put("multi_match", multiMatchQuery);
            // Store as should clause for optional matching
        }
        return this;
    }

    public DocumentQueryBuilder hasOwner(String owner) {
        if (owner != null && !owner.isBlank()) {
            Map<String, Object> term = new HashMap<>();
            Map<String, Object> termQuery = new HashMap<>();
            termQuery.put("value", owner);
            term.put("owner.keyword", termQuery);
            mustClauses.put("term", term);
        }
        return this;
    }

    public DocumentQueryBuilder hasCategory(String category) {
        if (category != null && !category.isBlank()) {
            Map<String, Object> term = new HashMap<>();
            Map<String, Object> termQuery = new HashMap<>();
            termQuery.put("value", category);
            term.put("category.keyword", termQuery);
            mustClauses.put("term", term);
        }
        return this;
    }

    public DocumentQueryBuilder hasStatus(String status) {
        if (status != null && !status.isBlank()) {
            Map<String, Object> term = new HashMap<>();
            Map<String, Object> termQuery = new HashMap<>();
            termQuery.put("value", status);
            term.put("status.keyword", termQuery);
            mustClauses.put("term", term);
        }
        return this;
    }

    public DocumentQueryBuilder hasTags(java.util.List<String> tags) {
        if (tags != null && !tags.isEmpty()) {
            for (String tag : tags) {
                Map<String, Object> term = new HashMap<>();
                Map<String, Object> termQuery = new HashMap<>();
                termQuery.put("value", tag);
                term.put("tags.keyword", termQuery);
                // Store as should clause
            }
        }
        return this;
    }

    public DocumentQueryBuilder inFolder(String folderId) {
        if (folderId != null && !folderId.isBlank()) {
            Map<String, Object> term = new HashMap<>();
            Map<String, Object> termQuery = new HashMap<>();
            termQuery.put("value", folderId);
            term.put("folder_id.keyword", termQuery);
            mustClauses.put("term", term);
        }
        return this;
    }

    public DocumentQueryBuilder inFolders(java.util.Set<String> folderIds) {
        if (folderIds != null && !folderIds.isEmpty()) {
            Map<String, Object> terms = new HashMap<>();
            terms.put("values", folderIds.toArray());
            Map<String, Object> termsQuery = new HashMap<>();
            termsQuery.put("folder_id.keyword", new java.util.ArrayList<>(folderIds));
            mustClauses.put("terms", termsQuery);
        }
        return this;
    }

    /**
     * Build a query string suitable for OpenSearch.
     */
    public String buildQueryString() {
        if (mustClauses.isEmpty()) {
            return "{\"query\": {\"match_all\": {}}}";
        }
        
        Map<String, Object> query = new HashMap<>();
        Map<String, Object> boolQuery = new HashMap<>();
        
        if (!mustClauses.isEmpty()) {
            boolQuery.put("must", mustClauses);
        }
        
        query.put("bool", boolQuery);
        
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            return mapper.writeValueAsString(query);
        } catch (Exception e) {
            throw new RuntimeException("Failed to build query", e);
        }
    }

    /**
     * Build the final query map for direct usage.
     */
    public Map<String, Object> build() {
        Map<String, Object> query = new HashMap<>();
        
        if (mustClauses.isEmpty()) {
            query.put("match_all", new HashMap<>());
            return query;
        }
        
        Map<String, Object> boolQuery = new HashMap<>();
        boolQuery.put("must", new Object[]{mustClauses});
        query.put("bool", boolQuery);
        
        return query;
    }
}
