package com.dms.user.repository;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;

import com.dms.repository.BaseOpenSearchRepository;
import com.dms.user.model.UserGroup;
import com.fasterxml.jackson.databind.ObjectMapper;

@Repository
public class UserGroupRepository extends BaseOpenSearchRepository<UserGroup> {

    @Value("${app.opensearch.groups-index:dms-user-groups}")
    private String groupsIndex;

    @Autowired
    public UserGroupRepository(OpenSearchClient openSearchClient, ObjectMapper objectMapper) {
        super(openSearchClient, objectMapper, UserGroup.class);
    }

    @Override
    protected String getIndexName() {
        return groupsIndex;
    }

    public Optional<UserGroup> findByName(String name) {
        if (name == null || name.isBlank()) {
            return Optional.empty();
        }
        try {
            Query query = new Query.Builder()
                .term(t -> t.field("name.keyword").value(ov -> ov.stringValue(name)))
                .build();

            List<UserGroup> results = search(
                new SearchRequest.Builder()
                    .index(getIndexName())
                    .query(query)
                    .size(1)
                    .build()
            );
            return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to find group by name", ex);
        }
    }

    public Optional<UserGroup> findByNameIgnoreCase(String name) {
        if (name == null || name.isBlank()) {
            return Optional.empty();
        }
        try {
            Query query = new Query.Builder()
                .match(m -> m.field("name").query(ov -> ov.stringValue(name)))
                .build();

            List<UserGroup> results = search(
                new SearchRequest.Builder()
                    .index(getIndexName())
                    .query(query)
                    .size(1)
                    .build()
            );
            return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to find group by name", ex);
        }
    }

    public List<UserGroup> findAll() {
        try {
            return super.findAll();
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to list groups", ex);
        }
    }

    public Iterable<UserGroup> findAllById(Iterable<String> ids) {
        if (ids == null) {
            return List.of();
        }
        List<UserGroup> groups = new ArrayList<>();
        for (String id : ids) {
            findById(id).ifPresent(groups::add);
        }
        return groups;
    }

    public Optional<UserGroup> findById(String id) {
        try {
            return super.findById(id);
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to find group", ex);
        }
    }

    public UserGroup save(UserGroup group) {
        try {
            return super.save(group);
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to save group", ex);
        }
    }

    public List<UserGroup> saveAll(List<UserGroup> groups) {
        if (groups == null || groups.isEmpty()) {
            return List.of();
        }
        List<UserGroup> saved = new ArrayList<>(groups.size());
        for (UserGroup group : groups) {
            saved.add(save(group));
        }
        return saved;
    }

    public void delete(UserGroup entity) {
        if (entity == null || entity.getId() == null) {
            return;
        }
        try {
            super.deleteById(entity.getId());
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to delete group", ex);
        }
    }
}
