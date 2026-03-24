package com.dms.user.repository;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;

import com.dms.user.model.AppUser;
import com.dms.repository.BaseOpenSearchRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.springframework.util.StringUtils;

@Repository
public class AppUserRepository extends BaseOpenSearchRepository<AppUser> {

    @Value("${app.opensearch.users-index:dms-app-users}")
    private String usersIndex;

    @Value("${app.opensearch.enabled:false}")
    private boolean openSearchEnabled;

    @Autowired
    public AppUserRepository(OpenSearchClient openSearchClient, ObjectMapper objectMapper) {
        super(openSearchClient, objectMapper, AppUser.class);
    }

    @Autowired(required = false)
    private DataSource dataSource;

    @Override
    protected String getIndexName() {
        return usersIndex;
    }

    /**
     * Find user by username.
     */
    public Optional<AppUser> findByUsername(String username) throws IOException {
        if (!openSearchEnabled && dataSource != null) {
            return findByUsernameFromMysql(username, false);
        }
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
        if (!openSearchEnabled && dataSource != null) {
            return findByUsernameFromMysql(username, true);
        }
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

    // Fallback to MySQL if OpenSearch lookup fails or returns no results
    public Optional<AppUser> findByUsernameIgnoreCaseWithFallback(String username) {
        if (!openSearchEnabled && dataSource != null) {
            return findByUsernameFromMysqlUnchecked(username, true);
        }

        try {
            Optional<AppUser> fromOs = findByUsernameIgnoreCase(username);
            if (fromOs.isPresent()) {
                return fromOs;
            }
        } catch (IOException ex) {
            // ignore and try JDBC
        }

        if (dataSource == null) {
            return Optional.empty();
        }

        try (Connection conn = dataSource.getConnection()) {
            try (PreparedStatement ps = conn.prepareStatement("SELECT id, username, display_name, password, user_password, role FROM app_users WHERE username = ? LIMIT 1")) {
                ps.setString(1, username);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) {
                        return Optional.empty();
                    }
                    AppUser user = mapUserRow(rs);
                    hydrateMembership(conn, List.of(user));
                    return Optional.of(user);
                }
            }
        } catch (Exception ex) {
            return Optional.empty();
        }
    }

    /**
     * Find users in given groups.
     */
    public List<AppUser> findByGroupIdsIn(String... groupIds) throws IOException {
        if (!openSearchEnabled && dataSource != null) {
            return findByGroupIdsInFromMysql(groupIds);
        }
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
        if (!openSearchEnabled && dataSource != null) {
            return findByGroupIdsInFromMysql(groupIds.toArray(String[]::new));
        }
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

    @Override
    public List<AppUser> findAll() throws IOException {
        if (openSearchEnabled || dataSource == null) {
            return super.findAll();
        }
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement("SELECT id, username, display_name, password, user_password, role FROM app_users");
             ResultSet rs = ps.executeQuery()) {
            List<AppUser> users = new ArrayList<>();
            while (rs.next()) {
                users.add(mapUserRow(rs));
            }
            hydrateMembership(conn, users);
            return users;
        } catch (Exception ex) {
            throw new IOException("Failed to read users from MySQL", ex);
        }
    }

    @Override
    public Optional<AppUser> findById(String id) throws IOException {
        if (openSearchEnabled || dataSource == null) {
            return super.findById(id);
        }
        Long numericId = parseLong(id);
        if (numericId == null) {
            return Optional.empty();
        }
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement("SELECT id, username, display_name, password, user_password, role FROM app_users WHERE id = ?")) {
            ps.setLong(1, numericId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                AppUser user = mapUserRow(rs);
                hydrateMembership(conn, List.of(user));
                return Optional.of(user);
            }
        } catch (Exception ex) {
            throw new IOException("Failed to read user from MySQL", ex);
        }
    }

    @Override
    public AppUser save(AppUser entity) throws IOException {
        if (openSearchEnabled || dataSource == null) {
            return super.save(entity);
        }
        try (Connection conn = dataSource.getConnection()) {
            Long id = parseLong(entity.getId());
            if (id == null) {
                try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO app_users(display_name, role, username, user_password, password) VALUES (?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS)) {
                    ps.setString(1, entity.getDisplayName());
                    ps.setString(2, entity.getRole() != null ? entity.getRole().name() : null);
                    ps.setString(3, entity.getUsername());
                    ps.setString(4, entity.getUserPassword());
                    ps.setString(5, entity.getPassword());
                    ps.executeUpdate();
                    try (ResultSet keys = ps.getGeneratedKeys()) {
                        if (keys.next()) {
                            id = keys.getLong(1);
                            entity.setId(String.valueOf(id));
                        }
                    }
                }
            } else {
                try (PreparedStatement ps = conn.prepareStatement(
                    "UPDATE app_users SET display_name=?, role=?, username=?, user_password=?, password=? WHERE id=?")) {
                    ps.setString(1, entity.getDisplayName());
                    ps.setString(2, entity.getRole() != null ? entity.getRole().name() : null);
                    ps.setString(3, entity.getUsername());
                    ps.setString(4, entity.getUserPassword());
                    ps.setString(5, entity.getPassword());
                    ps.setLong(6, id);
                    ps.executeUpdate();
                }
            }

            if (id != null) {
                try (PreparedStatement ps = conn.prepareStatement("DELETE FROM user_group_members WHERE user_id = ?")) {
                    ps.setLong(1, id);
                    ps.executeUpdate();
                }
                Set<String> groupIds = entity.getGroupIds() == null ? Set.of() : entity.getGroupIds();
                for (String groupId : groupIds) {
                    Long numericGroupId = parseLong(groupId);
                    if (numericGroupId == null) {
                        continue;
                    }
                    try (PreparedStatement ps = conn.prepareStatement("INSERT INTO user_group_members(user_id, group_id) VALUES (?, ?)") ) {
                        ps.setLong(1, id);
                        ps.setLong(2, numericGroupId);
                        ps.executeUpdate();
                    }
                }
            }

            return findById(entity.getId()).orElse(entity);
        } catch (Exception ex) {
            throw new IOException("Failed to save user into MySQL", ex);
        }
    }

    @Override
    public void deleteById(String id) throws IOException {
        if (openSearchEnabled || dataSource == null) {
            super.deleteById(id);
            return;
        }
        Long numericId = parseLong(id);
        if (numericId == null) {
            return;
        }
        try (Connection conn = dataSource.getConnection()) {
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM user_group_members WHERE user_id = ?")) {
                ps.setLong(1, numericId);
                ps.executeUpdate();
            }
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM app_users WHERE id = ?")) {
                ps.setLong(1, numericId);
                ps.executeUpdate();
            }
        } catch (Exception ex) {
            throw new IOException("Failed to delete user from MySQL", ex);
        }
    }

    private Optional<AppUser> findByUsernameFromMysql(String username, boolean ignoreCase) throws IOException {
        if (!StringUtils.hasText(username) || dataSource == null) {
            return Optional.empty();
        }
        String sql = ignoreCase
            ? "SELECT id, username, display_name, password, user_password, role FROM app_users WHERE LOWER(username)=LOWER(?) LIMIT 1"
            : "SELECT id, username, display_name, password, user_password, role FROM app_users WHERE username=? LIMIT 1";
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, username);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                AppUser user = mapUserRow(rs);
                hydrateMembership(conn, List.of(user));
                return Optional.of(user);
            }
        } catch (Exception ex) {
            throw new IOException("Failed to find user by username from MySQL", ex);
        }
    }

    private Optional<AppUser> findByUsernameFromMysqlUnchecked(String username, boolean ignoreCase) {
        try {
            return findByUsernameFromMysql(username, ignoreCase);
        } catch (IOException ex) {
            return Optional.empty();
        }
    }

    private List<AppUser> findByGroupIdsInFromMysql(String... groupIds) throws IOException {
        if (groupIds == null || groupIds.length == 0 || dataSource == null) {
            return List.of();
        }

        List<Long> numericGroupIds = new ArrayList<>();
        for (String groupId : groupIds) {
            Long value = parseLong(groupId);
            if (value != null) {
                numericGroupIds.add(value);
            }
        }
        if (numericGroupIds.isEmpty()) {
            return List.of();
        }

        String placeholders = String.join(",", java.util.Collections.nCopies(numericGroupIds.size(), "?"));
        String sql = "SELECT DISTINCT u.id, u.username, u.display_name, u.password, u.user_password, u.role " +
            "FROM app_users u JOIN user_group_members m ON m.user_id = u.id WHERE m.group_id IN (" + placeholders + ")";

        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            for (int i = 0; i < numericGroupIds.size(); i++) {
                ps.setLong(i + 1, numericGroupIds.get(i));
            }
            try (ResultSet rs = ps.executeQuery()) {
                List<AppUser> users = new ArrayList<>();
                while (rs.next()) {
                    users.add(mapUserRow(rs));
                }
                hydrateMembership(conn, users);
                return users;
            }
        } catch (Exception ex) {
            throw new IOException("Failed to find users by group IDs from MySQL", ex);
        }
    }

    private AppUser mapUserRow(ResultSet rs) throws Exception {
        AppUser user = new AppUser();
        user.setId(String.valueOf(rs.getLong("id")));
        user.setUsername(rs.getString("username"));
        user.setDisplayName(rs.getString("display_name"));
        user.setPassword(rs.getString("password"));
        user.setUserPassword(rs.getString("user_password"));
        try {
            String role = rs.getString("role");
            if (role != null) {
                user.setRole(com.dms.security.Role.valueOf(role));
            }
        } catch (Exception ignored) {
        }
        return user;
    }

    private void hydrateMembership(Connection conn, List<AppUser> users) throws Exception {
        if (users == null || users.isEmpty()) {
            return;
        }

        Map<String, AppUser> userById = new HashMap<>();
        for (AppUser user : users) {
            if (user != null && StringUtils.hasText(user.getId())) {
                user.setGroupIds(new HashSet<>());
                user.setGroups(new HashSet<>());
                userById.put(user.getId(), user);
            }
        }
        if (userById.isEmpty()) {
            return;
        }

        Map<String, com.dms.user.model.UserGroup> groups = new HashMap<>();
        try (PreparedStatement ps = conn.prepareStatement("SELECT id, name, description FROM user_groups");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                com.dms.user.model.UserGroup group = new com.dms.user.model.UserGroup();
                String groupId = String.valueOf(rs.getLong("id"));
                group.setId(groupId);
                group.setName(rs.getString("name"));
                group.setDescription(rs.getString("description"));
                groups.put(groupId, group);
            }
        }

        String placeholders = String.join(",", java.util.Collections.nCopies(userById.size(), "?"));
        String sql = "SELECT user_id, group_id FROM user_group_members WHERE user_id IN (" + placeholders + ")";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            int index = 1;
            for (String userId : userById.keySet()) {
                ps.setLong(index++, Long.parseLong(userId));
            }
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String userId = String.valueOf(rs.getLong("user_id"));
                    String groupId = String.valueOf(rs.getLong("group_id"));
                    AppUser user = userById.get(userId);
                    com.dms.user.model.UserGroup group = groups.get(groupId);
                    if (user != null && group != null) {
                        user.getGroupIds().add(groupId);
                        user.getGroups().add(group);
                        group.getMemberIds().add(userId);
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
