package com.dms.knowledge.repository;

import java.io.IOException;
import java.util.Optional;
import java.util.Map;

import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.Refresh;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.IndexRequest;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;

import com.dms.knowledge.model.KnowledgeTopicStar;
import com.dms.repository.BaseOpenSearchRepository;
import com.fasterxml.jackson.databind.ObjectMapper;

@Repository
public class KnowledgeTopicStarRepository extends BaseOpenSearchRepository<KnowledgeTopicStar> {

    private static final String ENTITY_TYPE = "star";

    @Value("${app.opensearch.knowledge-index:dms-knowledge}")
    private String knowledgeIndex;

    @Autowired
    public KnowledgeTopicStarRepository(OpenSearchClient openSearchClient, ObjectMapper objectMapper) {
        super(openSearchClient, objectMapper, KnowledgeTopicStar.class);
    }

    @Override
    protected String getIndexName() {
        return knowledgeIndex;
    }

    @Override
    public KnowledgeTopicStar save(KnowledgeTopicStar entity) throws IOException {
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

    public Optional<KnowledgeTopicStar> findByTopicIdAndUserId(String topicId, String userId) {
        try {
            Query boolQuery = Query.of(q -> q.bool(b -> b
                .must(m1 -> m1.term(t -> t.field("entity_type.keyword").value(v -> v.stringValue(ENTITY_TYPE))))
                .must(m2 -> m2.term(t -> t.field("topic_id.keyword").value(v -> v.stringValue(topicId))))
                .must(m3 -> m3.term(t -> t.field("user_id.keyword").value(v -> v.stringValue(userId))))));
            
            SearchRequest request = new SearchRequest.Builder()
                .index(getIndexName())
                .query(boolQuery)
                .size(1)
                .build();
            
            var results = search(request);
            return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
        } catch (IOException ex) {
            throw new RuntimeException("Failed to query stars", ex);
        }
    }

    public boolean existsByTopicIdAndUserId(String topicId, String userId) {
        return findByTopicIdAndUserId(topicId, userId).isPresent();
    }

    public int countByTopicId(String topicId) {
        try {
            Query termQuery = Query.of(q -> q.bool(b -> b
                .must(m1 -> m1.term(t -> t.field("entity_type.keyword").value(v -> v.stringValue(ENTITY_TYPE))))
                .must(m2 -> m2.term(t -> t.field("topic_id.keyword").value(v -> v.stringValue(topicId))))));
            SearchRequest request = new SearchRequest.Builder()
                .index(getIndexName())
                .query(termQuery)
                .size(0)
                .build();

            return (int) openSearchClient.search(request, KnowledgeTopicStar.class).hits().total().value();
        } catch (IOException ex) {
            throw new RuntimeException("Failed to count stars", ex);
        }
    }

    public void delete(KnowledgeTopicStar entity) {
        try {
            if (entity.getId() != null) {
                deleteById(entity.getId());
            }
        } catch (IOException ex) {
            throw new RuntimeException("Failed to delete star", ex);
        }
    }
}
