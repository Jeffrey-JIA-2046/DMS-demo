package com.dms.knowledge.repository;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.IndexRequest;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;

import com.dms.knowledge.model.KnowledgeTopicUpload;
import com.dms.repository.BaseOpenSearchRepository;
import com.fasterxml.jackson.databind.ObjectMapper;

@Repository
public class KnowledgeTopicUploadRepository extends BaseOpenSearchRepository<KnowledgeTopicUpload> {

    private static final String ENTITY_TYPE = "upload";

    @Value("${app.opensearch.knowledge-index:dms-knowledge}")
    private String knowledgeIndex;

    @Autowired
    public KnowledgeTopicUploadRepository(OpenSearchClient openSearchClient, ObjectMapper objectMapper) {
        super(openSearchClient, objectMapper, KnowledgeTopicUpload.class);
    }

    @Override
    protected String getIndexName() {
        return knowledgeIndex;
    }

    @Override
    public KnowledgeTopicUpload save(KnowledgeTopicUpload entity) throws IOException {
        String id = extractId(entity);
        Map<String, Object> payload = objectMapper.convertValue(entity, Map.class);
        payload.put("entity_type", ENTITY_TYPE);

        IndexRequest.Builder<Map<String, Object>> builder = new IndexRequest.Builder<Map<String, Object>>()
            .index(getIndexName())
            .document(payload);
        if (id != null && !id.isBlank()) {
            builder.id(id);
        }

        var response = openSearchClient.index(builder.build());
        if (id == null || id.isBlank()) {
            entity.setId(response.id());
        }
        return entity;
    }

    @Override
    public Optional<KnowledgeTopicUpload> findById(String id) throws IOException {
        Query query = Query.of(q -> q.bool(b -> b
            .must(m1 -> m1.term(t -> t.field("entity_type").value(v -> v.stringValue(ENTITY_TYPE))))
            .must(m2 -> m2.term(t -> t.field("id").value(v -> v.stringValue(id))))));
        SearchRequest request = new SearchRequest.Builder()
            .index(getIndexName())
            .query(query)
            .size(1)
            .build();
        List<KnowledgeTopicUpload> results = search(request);
        return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
    }

    public List<KnowledgeTopicUpload> findByTopicId(String topicId) {
        try {
            Query termQuery = Query.of(q -> q.bool(b -> b
                .must(m1 -> m1.term(t -> t.field("entity_type").value(v -> v.stringValue(ENTITY_TYPE))))
                .must(m2 -> m2.term(t -> t.field("topic_id").value(v -> v.stringValue(topicId))))));
            SearchRequest request = new SearchRequest.Builder()
                .index(getIndexName())
                .query(termQuery)
                .size(10000)
                .build();
            
            return search(request);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to query uploads", ex);
        }
    }

    public Optional<KnowledgeTopicUpload> findByIdAndTopicId(String id, String topicId) {
        try {
            Optional<KnowledgeTopicUpload> found = findById(id);
            if (found.isPresent() && found.get().getTopicId().equals(topicId)) {
                return found;
            }
            return Optional.empty();
        } catch (IOException ex) {
            throw new RuntimeException("Failed to query upload", ex);
        }
    }

    public List<KnowledgeTopicUpload> findByTopicIdOrderByUploadedAtDesc(String topicId) {
        try {
            Query termQuery = Query.of(q -> q.bool(b -> b
                .must(m1 -> m1.term(t -> t.field("entity_type").value(v -> v.stringValue(ENTITY_TYPE))))
                .must(m2 -> m2.term(t -> t.field("topic_id").value(v -> v.stringValue(topicId))))));
            SearchRequest request = new SearchRequest.Builder()
                .index(getIndexName())
                .query(termQuery)
                .sort(s -> s.field(f -> f.field("uploaded_at").order(SortOrder.Desc)))
                .size(10000)
                .build();
            
            return search(request);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to query uploads", ex);
        }
    }
}
