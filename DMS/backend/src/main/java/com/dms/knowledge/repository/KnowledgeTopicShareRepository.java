package com.dms.knowledge.repository;

import java.io.IOException;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.Refresh;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.IndexRequest;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;

import com.dms.knowledge.model.KnowledgeTopicShare;
import com.dms.repository.BaseOpenSearchRepository;
import com.fasterxml.jackson.databind.ObjectMapper;

@Repository
public class KnowledgeTopicShareRepository extends BaseOpenSearchRepository<KnowledgeTopicShare> {

    private static final String ENTITY_TYPE = "share";

    @Value("${app.opensearch.knowledge-index:dms-knowledge}")
    private String knowledgeIndex;

    @Autowired
    public KnowledgeTopicShareRepository(OpenSearchClient openSearchClient, ObjectMapper objectMapper) {
        super(openSearchClient, objectMapper, KnowledgeTopicShare.class);
    }

    @Override
    protected String getIndexName() {
        return knowledgeIndex;
    }

    @Override
    public KnowledgeTopicShare save(KnowledgeTopicShare entity) throws IOException {
        String id = extractId(entity);
        Map<String, Object> payload = objectMapper.convertValue(entity, Map.class);
        payload.put("entity_type", ENTITY_TYPE);

        IndexRequest.Builder<Map<String, Object>> builder = new IndexRequest.Builder<Map<String, Object>>()
            .index(getIndexName())
            .document(payload)
            .refresh(Refresh.WaitFor);
        if (id != null && !id.isBlank()) {
            builder.id(id);
        }

        var response = openSearchClient.index(builder.build());
        if (id == null || id.isBlank()) {
            entity.setId(response.id());
        }
        return entity;
    }

    public List<KnowledgeTopicShare> findByTopicId(String topicId) {
        try {
            Query termQuery = Query.of(q -> q.bool(b -> b
                .must(m1 -> m1.term(t -> t.field("entity_type.keyword").value(v -> v.stringValue(ENTITY_TYPE))))
                .must(m2 -> m2.term(t -> t.field("topic_id.keyword").value(v -> v.stringValue(topicId))))));
            SearchRequest request = new SearchRequest.Builder()
                .index(getIndexName())
                .query(termQuery)
                .size(10000)
                .build();
            
            return search(request);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to query shares", ex);
        }
    }

    public List<KnowledgeTopicShare> findByTopicIdOrderBySharedAtDesc(String topicId) {
        try {
            Query termQuery = Query.of(q -> q.bool(b -> b
                .must(m1 -> m1.term(t -> t.field("entity_type.keyword").value(v -> v.stringValue(ENTITY_TYPE))))
                .must(m2 -> m2.term(t -> t.field("topic_id.keyword").value(v -> v.stringValue(topicId))))));
            SearchRequest request = new SearchRequest.Builder()
                .index(getIndexName())
                .query(termQuery)
                .size(10000)
                .build();

            List<KnowledgeTopicShare> results = search(request);
            results.sort(Comparator.comparing(KnowledgeTopicShare::getSharedAt, Comparator.nullsLast(Comparator.reverseOrder())));
            return results;
        } catch (IOException ex) {
            throw new RuntimeException("Failed to query shares", ex);
        }
    }
}
