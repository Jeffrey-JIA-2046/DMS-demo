package com.dms.user.repository;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;

import com.dms.user.model.AppUser;
import com.dms.repository.BaseOpenSearchRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch._types.query_dsl.Query;

@Repository
public class AppUserRepository extends BaseOpenSearchRepository<AppUser> {

    @Value("${app.opensearch.users-index:dms-app-users}")
    private String usersIndex;

    @Autowired
    public AppUserRepository(OpenSearchClient openSearchClient, ObjectMapper objectMapper) {
        super(openSearchClient, objectMapper, AppUser.class);
    }

    @Override
    protected String getIndexName() {
        return usersIndex;
    }

    /**
     * Find user by username.
     */
    public Optional<AppUser> findByUsername(String username) throws IOException {
        Query query = new Query.Builder()
            .term(t -> t.field("username.keyword").value(ov -> ov.stringValue(username)))
            .build();

        List<AppUser> results = search(
            new SearchRequest.Builder()
                .index(getIndexName())
                .query(query)
                .size(1)
                .build()
        );

        return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
    }

    /**
     * Find user by username (case insensitive).
     */
    public Optional<AppUser> findByUsernameIgnoreCase(String username) throws IOException {
        Query query = new Query.Builder()
            .match(m -> m.field("username").query(ov -> ov.stringValue(username)))
            .build();

        List<AppUser> results = search(
            new SearchRequest.Builder()
                .index(getIndexName())
                .query(query)
                .size(1)
                .build()
        );

        return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
    }

    /**
     * Find users in given groups.
     */
    public List<AppUser> findByGroupIdsIn(String... groupIds) throws IOException {
        List<Query> termQueries = new ArrayList<>();
        for (String groupId : groupIds) {
            termQueries.add(new Query.Builder()
                .term(t -> t.field("group_ids").value(ov -> ov.stringValue(groupId)))
                .build());
        }

        Query query = new Query.Builder()
            .bool(b -> b.should(termQueries))
            .build();

        return search(
            new SearchRequest.Builder()
                .index(getIndexName())
                .query(query)
                .size(1000)
                .build()
        );
    }

    /**
     * Find distinct users by group IDs.
     */
    public List<AppUser> findDistinctByGroupIds(Set<String> groupIds) throws IOException {
        List<Query> termQueries = new ArrayList<>();
        for (String groupId : groupIds) {
            termQueries.add(new Query.Builder()
                .term(t -> t.field("group_ids").value(ov -> ov.stringValue(groupId)))
                .build());
        }

        Query query = new Query.Builder()
            .bool(b -> b.should(termQueries))
            .build();

        return search(
            new SearchRequest.Builder()
                .index(getIndexName())
                .query(query)
                .size(1000)
                .build()
        );
    }

    public List<AppUser> saveAll(List<AppUser> users) throws IOException {
        List<AppUser> saved = new ArrayList<>();
        if (users == null) {
            return saved;
        }
        for (AppUser user : users) {
            saved.add(save(user));
        }
        return saved;
    }

    public void delete(AppUser entity) throws IOException {
        if (entity != null && entity.getId() != null) {
            deleteById(entity.getId());
        }
    }
}
