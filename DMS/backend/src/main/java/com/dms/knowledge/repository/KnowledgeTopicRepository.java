package com.dms.knowledge.repository;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch._types.Refresh;
import org.opensearch.client.opensearch.core.IndexRequest;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;

import com.dms.knowledge.model.KnowledgeTopic;
import com.dms.repository.BaseOpenSearchRepository;
import com.fasterxml.jackson.databind.ObjectMapper;

@Repository
public class KnowledgeTopicRepository extends BaseOpenSearchRepository<KnowledgeTopic> {

    private static final String ENTITY_TYPE = "topic";

    @Value("${app.opensearch.knowledge-index:dms-knowledge}")
    private String knowledgeIndex;

    @Autowired
    public KnowledgeTopicRepository(OpenSearchClient openSearchClient, ObjectMapper objectMapper) {
        super(openSearchClient, objectMapper, KnowledgeTopic.class);
    }

    @Override
    protected String getIndexName() {
        return knowledgeIndex;
    }

    @Override
    public KnowledgeTopic save(KnowledgeTopic entity) throws IOException {
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

    @Override
    public Optional<KnowledgeTopic> findById(String id) throws IOException {
        Query query = Query.of(q -> q.bool(b -> b
            .must(m1 -> m1.term(t -> t.field("entity_type").value(v -> v.stringValue(ENTITY_TYPE))))
            .must(m2 -> m2.ids(i -> i.values(id)))));

        SearchRequest request = new SearchRequest.Builder()
            .index(getIndexName())
            .query(query)
            .size(1)
            .build();

        List<KnowledgeTopic> results = search(request);
        return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
    }

    @Override
    public Page<KnowledgeTopic> findAll(Pageable pageable) throws IOException {
        Query query = Query.of(q -> q.term(t -> t.field("entity_type").value(v -> v.stringValue(ENTITY_TYPE))));
        SearchRequest.Builder builder = new SearchRequest.Builder()
            .index(getIndexName())
            .query(query);

        var page = search(builder, pageable);
        return new PageImpl<>(page.getContent(), pageable, page.getTotalElements());
    }
}
