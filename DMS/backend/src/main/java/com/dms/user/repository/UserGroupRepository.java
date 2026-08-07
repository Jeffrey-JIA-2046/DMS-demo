package com.dms.user.repository;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Optional;
import java.util.Map;

import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;

import com.dms.repository.BaseOpenSearchRepository;
import com.dms.user.model.UserGroup;
import com.fasterxml.jackson.databind.ObjectMapper;

@Repository
public class UserGroupRepository extends BaseOpenSearchRepository<UserGroup> {

    @Value("${app.opensearch.groups-index:dms-user-groups}")
    private String groupsIndex;

    @Value("${app.opensearch.enabled:false}")
    private boolean openSearchEnabled;

    @Autowired(required = false)
    private DataSource dataSource;

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
        if (!openSearchEnabled && dataSource != null) {
            return findByNameFromMysql(name, false);
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
        String normalized = name.trim();
        if (!openSearchEnabled && dataSource != null) {
            return findByNameFromMysql(normalized, true);
        }
        if (openSearchEnabled) {
            try {
                Optional<UserGroup> fromOpenSearch = super.findAll().stream()
                    .filter(group -> group.getName() != null && group.getName().equalsIgnoreCase(normalized))
                    .findFirst();
                if (fromOpenSearch.isPresent()) {
                    return fromOpenSearch;
                }
            } catch (java.io.IOException ex) {
                if (dataSource == null) {
                    throw new RuntimeException("Failed to find group by name", ex);
                }
            }
            if (dataSource != null) {
                return findByNameFromMysql(normalized, true);
            }
            return Optional.empty();
        }
        if (dataSource != null) {
            return findByNameFromMysql(name, true);
        }
        try {
            Query query = new Query.Builder()
                .match(m -> m.field("name").query(ov -> ov.stringValue(normalized)))
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
        if (!openSearchEnabled && dataSource != null) {
            try {
                return findAllFromMysql();
            } catch (Exception ex) {
                throw new RuntimeException("Failed to list groups", ex);
            }
        }
        if (openSearchEnabled) {
            try {
                List<UserGroup> fromOpenSearch = super.findAll();
                if (fromOpenSearch != null && !fromOpenSearch.isEmpty()) {
                    return fromOpenSearch;
                }
            } catch (java.io.IOException ex) {
                if (dataSource == null) {
                    throw new RuntimeException("Failed to list groups", ex);
                }
            }
            if (dataSource != null) {
                try {
                    return findAllFromMysql();
                } catch (Exception ex) {
                    throw new RuntimeException("Failed to list groups", ex);
                }
            }
            return List.of();
        }
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
        if (!openSearchEnabled && dataSource != null) {
            try {
                return findByIdFromMysql(id);
            } catch (Exception ex) {
                throw new RuntimeException("Failed to find group", ex);
            }
        }
        if (openSearchEnabled) {
            try {
                Optional<UserGroup> fromOpenSearch = super.findById(id);
                if (fromOpenSearch.isPresent()) {
                    return fromOpenSearch;
                }
            } catch (java.io.IOException ex) {
                if (dataSource == null) {
                    throw new RuntimeException("Failed to find group", ex);
                }
            }
            if (dataSource != null) {
                try {
                    return findByIdFromMysql(id);
                } catch (Exception ex) {
                    throw new RuntimeException("Failed to find group", ex);
                }
            }
            return Optional.empty();
        }
        try {
            return super.findById(id);
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to find group", ex);
        }
    }

    public UserGroup save(UserGroup group) {
        if (!openSearchEnabled && dataSource != null) {
            try {
                return saveToMysql(group);
            } catch (Exception ex) {
                throw new RuntimeException("Failed to save group", ex);
            }
        }
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
        if (!openSearchEnabled && dataSource != null) {
            try {
                Long numericId = parseLong(entity.getId());
                if (numericId == null) {
                    return;
                }
                try (Connection conn = dataSource.getConnection()) {
                    try (PreparedStatement ps = conn.prepareStatement("DELETE FROM user_group_members WHERE group_id = ?")) {
                        ps.setLong(1, numericId);
                        ps.executeUpdate();
                    }
                    try (PreparedStatement ps = conn.prepareStatement("DELETE FROM user_groups WHERE id = ?")) {
                        ps.setLong(1, numericId);
                        ps.executeUpdate();
                    }
                }
                return;
            } catch (Exception ex) {
                throw new RuntimeException("Failed to delete group", ex);
            }
        }
        try {
            super.deleteById(entity.getId());
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to delete group", ex);
        }
    }

    private Optional<UserGroup> findByNameFromMysql(String name, boolean ignoreCase) {
        String sql = ignoreCase
            ? "SELECT id, name, description FROM user_groups WHERE LOWER(name)=LOWER(?) LIMIT 1"
            : "SELECT id, name, description FROM user_groups WHERE name=? LIMIT 1";
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, name);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                UserGroup group = mapGroupRow(rs);
                loadMembers(conn, List.of(group));
                return Optional.of(group);
            }
        } catch (Exception ex) {
            throw new RuntimeException("Failed to find group by name", ex);
        }
    }

    private Optional<UserGroup> findByIdFromMysql(String id) throws Exception {
        Long numericId = parseLong(id);
        if (numericId == null) {
            return Optional.empty();
        }
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement("SELECT id, name, description FROM user_groups WHERE id = ?")) {
            ps.setLong(1, numericId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                UserGroup group = mapGroupRow(rs);
                loadMembers(conn, List.of(group));
                return Optional.of(group);
            }
        }
    }

    private List<UserGroup> findAllFromMysql() throws Exception {
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement("SELECT id, name, description FROM user_groups");
             ResultSet rs = ps.executeQuery()) {
            List<UserGroup> groups = new ArrayList<>();
            while (rs.next()) {
                groups.add(mapGroupRow(rs));
            }
            loadMembers(conn, groups);
            return groups;
        }
    }

    private UserGroup saveToMysql(UserGroup group) throws Exception {
        try (Connection conn = dataSource.getConnection()) {
            Long id = parseLong(group.getId());
            if (id == null) {
                try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO user_groups(name, description) VALUES (?, ?)",
                    Statement.RETURN_GENERATED_KEYS)) {
                    ps.setString(1, group.getName());
                    ps.setString(2, group.getDescription());
                    ps.executeUpdate();
                    try (ResultSet keys = ps.getGeneratedKeys()) {
                        if (keys.next()) {
                            id = keys.getLong(1);
                            group.setId(String.valueOf(id));
                        }
                    }
                }
            } else {
                try (PreparedStatement ps = conn.prepareStatement("UPDATE user_groups SET name=?, description=? WHERE id=?")) {
                    ps.setString(1, group.getName());
                    ps.setString(2, group.getDescription());
                    ps.setLong(3, id);
                    ps.executeUpdate();
                }
            }

            if (id != null) {
                try (PreparedStatement ps = conn.prepareStatement("DELETE FROM user_group_members WHERE group_id = ?")) {
                    ps.setLong(1, id);
                    ps.executeUpdate();
                }
                for (String memberId : group.getMemberIds() == null ? java.util.Set.<String>of() : group.getMemberIds()) {
                    Long numericMemberId = parseLong(memberId);
                    if (numericMemberId == null) {
                        continue;
                    }
                    try (PreparedStatement ps = conn.prepareStatement("INSERT INTO user_group_members(user_id, group_id) VALUES (?, ?)") ) {
                        ps.setLong(1, numericMemberId);
                        ps.setLong(2, id);
                        ps.executeUpdate();
                    }
                }
            }

            return findByIdFromMysql(group.getId()).orElse(group);
        }
    }

    private UserGroup mapGroupRow(ResultSet rs) throws Exception {
        UserGroup group = new UserGroup();
        group.setId(String.valueOf(rs.getLong("id")));
        group.setName(rs.getString("name"));
        group.setDescription(rs.getString("description"));
        return group;
    }

    private void loadMembers(Connection conn, List<UserGroup> groups) throws Exception {
        if (groups == null || groups.isEmpty()) {
            return;
        }
        Map<String, UserGroup> index = new HashMap<>();
        for (UserGroup group : groups) {
            if (group != null && StringUtils.hasText(group.getId())) {
                group.getMemberIds().clear();
                index.put(group.getId(), group);
            }
        }
        if (index.isEmpty()) {
            return;
        }
        String placeholders = String.join(",", java.util.Collections.nCopies(index.size(), "?"));
        String sql = "SELECT user_id, group_id FROM user_group_members WHERE group_id IN (" + placeholders + ")";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            int i = 1;
            for (String groupId : index.keySet()) {
                ps.setLong(i++, Long.parseLong(groupId));
            }
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String groupId = String.valueOf(rs.getLong("group_id"));
                    UserGroup group = index.get(groupId);
                    if (group != null) {
                        group.getMemberIds().add(String.valueOf(rs.getLong("user_id")));
                    }
                }
            }
        }
    }

    private Long parseLong(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        try {
            return Long.parseLong(raw);
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
