package com.dms.task.repository;

import java.io.IOException;
import java.sql.Connection;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import javax.sql.DataSource;

import com.dms.task.model.UserTask;
import com.dms.task.model.TaskType;
import com.dms.user.model.AppUser;
import com.dms.repository.BaseOpenSearchRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.OpenSearchException;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch._types.query_dsl.Query;

@Repository
public class UserTaskRepository extends BaseOpenSearchRepository<UserTask> {

    @Value("${app.opensearch.user-tasks-index:dms-user-tasks}")
    private String userTasksIndex;

    @Value("${app.opensearch.enabled:false}")
    private boolean openSearchEnabled;

    @Autowired(required = false)
    private DataSource dataSource;

    @Autowired
    public UserTaskRepository(OpenSearchClient openSearchClient, ObjectMapper objectMapper) {
        super(openSearchClient, objectMapper, UserTask.class);
    }

    @Override
    protected String getIndexName() {
        return userTasksIndex;
    }

    @Override
    public UserTask save(UserTask entity) throws IOException {
        if (openSearchEnabled || dataSource == null) {
            return super.save(entity);
        }
        try (Connection conn = dataSource.getConnection()) {
            Long id = parseLong(entity.getId());
            Long assigneeId = parseLong(entity.getAssigneeId());
            if (assigneeId == null && entity.getAssignee() != null) {
                assigneeId = parseLong(entity.getAssignee().getId());
            }
            Long documentId = parseLong(entity.getDocumentId());

            if (id == null) {
                try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO user_tasks(created_at, description, document_id, document_title, due_date, priority, status, task_type, title, updated_at, workflow_step, assignee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS)) {
                    bindTaskColumns(ps, entity, assigneeId, documentId);
                    ps.executeUpdate();
                    try (ResultSet keys = ps.getGeneratedKeys()) {
                        if (keys.next()) {
                            entity.setId(String.valueOf(keys.getLong(1)));
                        }
                    }
                }
            } else {
                try (PreparedStatement ps = conn.prepareStatement(
                    "UPDATE user_tasks SET created_at=?, description=?, document_id=?, document_title=?, due_date=?, priority=?, status=?, task_type=?, title=?, updated_at=?, workflow_step=?, assignee_id=? WHERE id=?")) {
                    bindTaskColumns(ps, entity, assigneeId, documentId);
                    ps.setLong(13, id);
                    ps.executeUpdate();
                }
            }
            return entity;
        } catch (Exception ex) {
            throw new IOException("Failed to save task into MySQL", ex);
        }
    }

    /**
     * Find tasks assigned to a user.
     */
    public List<UserTask> findByAssigneeUsername(String username) throws IOException {
        if (!openSearchEnabled && dataSource != null) {
            return findByAssigneeUsernameFromMysql(username, false);
        }
        Query query = new Query.Builder()
            .term(t -> t.field("assignee_username.keyword").value(ov -> ov.stringValue(username)))
            .build();
        return searchSafely(
            new SearchRequest.Builder()
                .index(getIndexName())
                .query(query)
                .size(1000)
                .build());
    }

    /**
     * Find tasks assigned to a user, case-insensitive, ordered by due date ascending.
     */
    public List<UserTask> findByAssigneeUsernameIgnoreCaseOrderByDueDateAsc(String username) throws IOException {
        if (!openSearchEnabled && dataSource != null) {
            return findByAssigneeUsernameFromMysql(username, true);
        }
        Query query = new Query.Builder()
            .term(t -> t.field("assignee_username.keyword").value(ov -> ov.stringValue(username)))
            .build();
        return searchSafely(
            new SearchRequest.Builder()
                .index(getIndexName())
                .query(query)
                .sort(s -> s.field(f -> f.field("due_date").order(SortOrder.Asc)))
                .size(1000)
                .build());
    }

    /**
     * Find task for document by type.
     */
    public Optional<UserTask> findByDocumentIdAndTaskType(String documentId, TaskType taskType) throws IOException {
        if (!openSearchEnabled && dataSource != null) {
            Long numericDocumentId = parseLong(documentId);
            if (numericDocumentId == null) {
                return Optional.empty();
            }
            try (Connection conn = dataSource.getConnection();
                 PreparedStatement ps = conn.prepareStatement(
                     "SELECT id, title, description, status, priority, task_type, workflow_step, document_id, document_title, due_date, assignee_id, created_at, updated_at FROM user_tasks WHERE document_id = ? AND task_type = ? LIMIT 1")) {
                ps.setLong(1, numericDocumentId);
                ps.setString(2, taskType.name());
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        return Optional.of(mapTask(rs, conn));
                    }
                    return Optional.empty();
                }
            } catch (Exception ex) {
                throw new IOException("Failed to find task by document and type from MySQL", ex);
            }
        }
        Query query = new Query.Builder()
            .bool(b -> b
                .must(m1 -> m1.term(t -> t.field("document_id.keyword").value(ov -> ov.stringValue(documentId))))
                .must(m2 -> m2.term(t -> t.field("task_type.keyword").value(ov -> ov.stringValue(taskType.name()))))
            )
            .build();

        List<UserTask> results = searchSafely(
            new SearchRequest.Builder()
                .index(getIndexName())
                .query(query)
                .size(1)
                .build());

        return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
    }

    private List<UserTask> findByAssigneeUsernameFromMysql(String username, boolean ignoreCase) throws IOException {
        if (!StringUtils.hasText(username)) {
            return List.of();
        }
        String sql = ignoreCase
            ? "SELECT t.id, t.title, t.description, t.status, t.priority, t.task_type, t.workflow_step, t.document_id, t.document_title, t.due_date, t.assignee_id, t.created_at, t.updated_at FROM user_tasks t JOIN app_users u ON u.id = t.assignee_id WHERE LOWER(u.username) = LOWER(?) ORDER BY t.due_date ASC"
            : "SELECT t.id, t.title, t.description, t.status, t.priority, t.task_type, t.workflow_step, t.document_id, t.document_title, t.due_date, t.assignee_id, t.created_at, t.updated_at FROM user_tasks t JOIN app_users u ON u.id = t.assignee_id WHERE u.username = ? ORDER BY t.due_date ASC";
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, username);
            try (ResultSet rs = ps.executeQuery()) {
                List<UserTask> tasks = new java.util.ArrayList<>();
                while (rs.next()) {
                    tasks.add(mapTask(rs, conn));
                }
                return tasks;
            }
        } catch (Exception ex) {
            throw new IOException("Failed to find tasks by assignee from MySQL", ex);
        }
    }

    private UserTask mapTask(ResultSet rs, Connection conn) throws Exception {
        UserTask task = new UserTask();
        task.setId(String.valueOf(rs.getLong("id")));
        task.setTitle(rs.getString("title"));
        task.setDescription(rs.getString("description"));
        try {
            task.setStatus(com.dms.task.model.TaskStatus.valueOf(rs.getString("status")));
        } catch (Exception ex) {
            task.setStatus(com.dms.task.model.TaskStatus.PENDING);
        }
        try {
            task.setPriority(com.dms.task.model.TaskPriority.valueOf(rs.getString("priority")));
        } catch (Exception ex) {
            task.setPriority(com.dms.task.model.TaskPriority.NORMAL);
        }
        try {
            task.setTaskType(TaskType.valueOf(rs.getString("task_type")));
        } catch (Exception ex) {
            task.setTaskType(TaskType.GENERAL);
        }
        task.setWorkflowStep(rs.getString("workflow_step"));
        long documentId = rs.getLong("document_id");
        if (!rs.wasNull()) {
            task.setDocumentId(String.valueOf(documentId));
        }
        task.setDocumentTitle(rs.getString("document_title"));
        Date dueDate = rs.getDate("due_date");
        task.setDueDate(dueDate == null ? null : dueDate.toLocalDate());
        long assigneeId = rs.getLong("assignee_id");
        if (!rs.wasNull()) {
            task.setAssigneeId(String.valueOf(assigneeId));
            AppUser assignee = loadAssignee(conn, assigneeId);
            if (assignee != null) {
                task.setAssignee(assignee);
            }
        }
        Timestamp createdAt = rs.getTimestamp("created_at");
        task.setCreatedAt(createdAt == null ? null : createdAt.toInstant());
        Timestamp updatedAt = rs.getTimestamp("updated_at");
        task.setUpdatedAt(updatedAt == null ? null : updatedAt.toInstant());
        return task;
    }

    private AppUser loadAssignee(Connection conn, long assigneeId) {
        try (PreparedStatement ps = conn.prepareStatement("SELECT id, username, display_name FROM app_users WHERE id = ?")) {
            ps.setLong(1, assigneeId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return null;
                }
                AppUser user = new AppUser();
                user.setId(String.valueOf(rs.getLong("id")));
                user.setUsername(rs.getString("username"));
                user.setDisplayName(rs.getString("display_name"));
                return user;
            }
        } catch (Exception ex) {
            return null;
        }
    }

    private void bindTaskColumns(PreparedStatement ps, UserTask entity, Long assigneeId, Long documentId) throws Exception {
        ps.setTimestamp(1, toTimestamp(entity.getCreatedAt()));
        ps.setString(2, entity.getDescription());
        if (documentId == null) {
            ps.setNull(3, java.sql.Types.BIGINT);
        } else {
            ps.setLong(3, documentId);
        }
        ps.setString(4, entity.getDocumentTitle());
        ps.setDate(5, entity.getDueDate() == null ? null : Date.valueOf(entity.getDueDate()));
        ps.setString(6, entity.getPriority() != null ? entity.getPriority().name() : null);
        ps.setString(7, entity.getStatus() != null ? entity.getStatus().name() : null);
        ps.setString(8, entity.getTaskType() != null ? entity.getTaskType().name() : null);
        ps.setString(9, entity.getTitle());
        ps.setTimestamp(10, toTimestamp(entity.getUpdatedAt()));
        ps.setString(11, entity.getWorkflowStep());
        if (assigneeId == null) {
            ps.setNull(12, java.sql.Types.BIGINT);
        } else {
            ps.setLong(12, assigneeId);
        }
    }

    private Timestamp toTimestamp(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
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

    private List<UserTask> searchSafely(SearchRequest request) throws IOException {
        try {
            return search(request);
        } catch (OpenSearchException ex) {
            if (isIndexNotFound(ex)) {
                return List.of();
            }
            throw ex;
        }
    }

    private boolean isIndexNotFound(OpenSearchException ex) {
        return ex != null && ex.getMessage() != null && ex.getMessage().contains("index_not_found_exception");
    }
}
