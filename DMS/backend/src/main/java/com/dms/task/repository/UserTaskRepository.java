package com.dms.task.repository;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;

import com.dms.task.model.UserTask;
import com.dms.task.model.TaskType;
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

    @Autowired
    public UserTaskRepository(OpenSearchClient openSearchClient, ObjectMapper objectMapper) {
        super(openSearchClient, objectMapper, UserTask.class);
    }

    @Override
    protected String getIndexName() {
        return userTasksIndex;
    }

    /**
     * Find tasks assigned to a user.
     */
    public List<UserTask> findByAssigneeUsername(String username) throws IOException {
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
