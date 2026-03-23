package com.dms.knowledge.repository;

import java.io.IOException;
import java.util.Optional;
import java.util.List;
import java.util.Map;

import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.IndexRequest;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;

import com.dms.knowledge.model.KnowledgeTopicMember;
import com.dms.repository.BaseOpenSearchRepository;
import com.fasterxml.jackson.databind.ObjectMapper;

@Repository
public class KnowledgeTopicMemberRepository extends BaseOpenSearchRepository<KnowledgeTopicMember> {

    private static final String ENTITY_TYPE = "member";

    @Value("${app.opensearch.knowledge-index:dms-knowledge}")
    private String knowledgeIndex;

    @Autowired
    public KnowledgeTopicMemberRepository(OpenSearchClient openSearchClient, ObjectMapper objectMapper) {
        super(openSearchClient, objectMapper, KnowledgeTopicMember.class);
    }

    @Override
    protected String getIndexName() {
        return knowledgeIndex;
    }

    @Override
    public KnowledgeTopicMember save(KnowledgeTopicMember entity) throws IOException {
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

    public Optional<KnowledgeTopicMember> findByTopicIdAndUserId(String topicId, String userId) {
        try {
            Query boolQuery = Query.of(q -> q.bool(b -> b
                .must(m1 -> m1.term(t -> t.field("entity_type").value(v -> v.stringValue(ENTITY_TYPE))))
                .must(m2 -> m2.term(t -> t.field("topic_id").value(v -> v.stringValue(topicId))))
                .must(m3 -> m3.term(t -> t.field("user_id").value(v -> v.stringValue(userId))))));
            
            SearchRequest request = new SearchRequest.Builder()
                .index(getIndexName())
                .query(boolQuery)
                .size(1)
                .build();
            
            List<KnowledgeTopicMember> results = search(request);
            return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
        } catch (IOException ex) {
            throw new RuntimeException("Failed to query members", ex);
        }
    }

    public boolean existsByTopicIdAndUserId(String topicId, String userId) {
        return findByTopicIdAndUserId(topicId, userId).isPresent();
    }

    public int countByTopicId(String topicId) {
        try {
            Query termQuery = Query.of(q -> q.bool(b -> b
                .must(m1 -> m1.term(t -> t.field("entity_type").value(v -> v.stringValue(ENTITY_TYPE))))
                .must(m2 -> m2.term(t -> t.field("topic_id").value(v -> v.stringValue(topicId))))));
            SearchRequest request = new SearchRequest.Builder()
                .index(getIndexName())
                .query(termQuery)
                .size(0)
                .build();
            
            return (int) search(request).size();
        } catch (IOException ex) {
            throw new RuntimeException("Failed to count members", ex);
        }
    }

    public List<KnowledgeTopicMember> findByTopicId(String topicId) {
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
            throw new RuntimeException("Failed to query members", ex);
        }
    }

    public List<KnowledgeTopicMember> findByTopicIdOrderByJoinedAtAsc(String topicId) {
        try {
            Query termQuery = Query.of(q -> q.bool(b -> b
                .must(m1 -> m1.term(t -> t.field("entity_type").value(v -> v.stringValue(ENTITY_TYPE))))
                .must(m2 -> m2.term(t -> t.field("topic_id").value(v -> v.stringValue(topicId))))));
            SearchRequest request = new SearchRequest.Builder()
                .index(getIndexName())
                .query(termQuery)
                .sort(s -> s.field(f -> f.field("joined_at").order(SortOrder.Asc)))
                .size(10000)
                .build();
            
            return search(request);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to query members", ex);
        }
    }
}
