package com.dms.workflow.repository;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

import com.dms.workflow.model.WorkflowActivity;
import com.dms.workflow.model.WorkflowCategoryBinding;
import com.dms.workflow.model.WorkflowConnection;
import com.dms.workflow.model.WorkflowInstance;
import com.dms.workflow.model.WorkflowInstanceStatus;
import com.dms.workflow.model.WorkflowStepLog;
import com.dms.workflow.model.WorkflowTemplate;
import com.dms.workflow.model.WorkflowTemplateLifecycle;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Repository
public class WorkflowRepository {

    @Autowired(required = false)
    private DataSource dataSource;

    private final ObjectMapper objectMapper;

    private final Map<String, WorkflowTemplate> templatesInMemory = new ConcurrentHashMap<>();
    private final Map<String, WorkflowCategoryBinding> bindingsInMemory = new ConcurrentHashMap<>();
    private final Map<String, WorkflowInstance> instancesInMemory = new ConcurrentHashMap<>();
    private final AtomicLong bindingCounter = new AtomicLong(1);

    public WorkflowRepository(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public List<WorkflowTemplate> findAllTemplates() throws IOException {
        if (dataSource == null) {
            List<WorkflowTemplate> all = new ArrayList<>(templatesInMemory.values());
            all.sort(Comparator.comparing(WorkflowTemplate::getName, String.CASE_INSENSITIVE_ORDER));
            return all;
        }

        ensureTables();
        List<WorkflowTemplate> templates = new ArrayList<>();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement("""
                   SELECT id, template_group_id, name, description, published, version_no, lifecycle_status, based_on_template_id,
                       created_by, created_at, updated_at, published_at,
                        activities_json, connections_json
                   FROM workflow_templates
                  ORDER BY updated_at DESC, name ASC
                 """);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                templates.add(mapTemplate(rs));
            }
        } catch (Exception ex) {
            throw new IOException("Failed to read workflow templates", ex);
        }
        return templates;
    }

    public Optional<WorkflowTemplate> findTemplateById(String id) throws IOException {
        if (dataSource == null) {
            return Optional.ofNullable(templatesInMemory.get(id));
        }

        ensureTables();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement("""
                   SELECT id, template_group_id, name, description, published, version_no, lifecycle_status, based_on_template_id,
                       created_by, created_at, updated_at, published_at,
                        activities_json, connections_json
                   FROM workflow_templates
                  WHERE id = ?
                  LIMIT 1
                 """)) {
            ps.setString(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(mapTemplate(rs));
                }
            }
        } catch (Exception ex) {
            throw new IOException("Failed to read workflow template", ex);
        }
        return Optional.empty();
    }

    public WorkflowTemplate saveTemplate(WorkflowTemplate template) throws IOException {
        if (dataSource == null) {
            templatesInMemory.put(template.getId(), template);
            return template;
        }

        ensureTables();
        try (Connection conn = dataSource.getConnection()) {
            try (PreparedStatement ps = conn.prepareStatement("""
                INSERT INTO workflow_templates(id, template_group_id, name, description, published, version_no, lifecycle_status, based_on_template_id,
                                               created_by, created_at, updated_at, published_at, activities_json, connections_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    template_group_id = VALUES(template_group_id),
                    name = VALUES(name),
                    description = VALUES(description),
                    published = VALUES(published),
                    version_no = VALUES(version_no),
                    lifecycle_status = VALUES(lifecycle_status),
                    based_on_template_id = VALUES(based_on_template_id),
                    created_by = VALUES(created_by),
                    created_at = VALUES(created_at),
                    updated_at = VALUES(updated_at),
                    published_at = VALUES(published_at),
                    activities_json = VALUES(activities_json),
                    connections_json = VALUES(connections_json)
                """)) {
                ps.setString(1, template.getId());
                ps.setString(2, template.getTemplateGroupId());
                ps.setString(3, template.getName());
                ps.setString(4, template.getDescription());
                ps.setBoolean(5, template.isPublished());
                ps.setInt(6, template.getVersionNumber());
                WorkflowTemplateLifecycle lifecycle = template.getLifecycleStatus() != null
                    ? template.getLifecycleStatus()
                    : WorkflowTemplateLifecycle.DRAFT;
                ps.setString(7, lifecycle.name());
                ps.setString(8, template.getBasedOnTemplateId());
                ps.setString(9, template.getCreatedBy());
                ps.setTimestamp(10, toTimestamp(template.getCreatedAt()));
                ps.setTimestamp(11, toTimestamp(template.getUpdatedAt()));
                ps.setTimestamp(12, toTimestamp(template.getPublishedAt()));
                ps.setString(13, objectMapper.writeValueAsString(template.getActivities()));
                ps.setString(14, objectMapper.writeValueAsString(template.getConnections()));
                ps.executeUpdate();
            }
        } catch (Exception ex) {
            throw new IOException("Failed to save workflow template", ex);
        }

        return template;
    }

    public List<WorkflowCategoryBinding> findAllBindings() throws IOException {
        if (dataSource == null) {
            List<WorkflowCategoryBinding> all = new ArrayList<>(bindingsInMemory.values());
            all.sort(Comparator.comparing(WorkflowCategoryBinding::getCategory, String.CASE_INSENSITIVE_ORDER));
            return all;
        }

        ensureTables();
        List<WorkflowCategoryBinding> bindings = new ArrayList<>();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement("""
                 SELECT id, category, template_id, active, created_at, updated_at
                   FROM workflow_category_bindings
                  ORDER BY category ASC, id ASC
                 """);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                bindings.add(mapBinding(rs));
            }
        } catch (Exception ex) {
            throw new IOException("Failed to read workflow bindings", ex);
        }
        return bindings;
    }

    public Optional<WorkflowCategoryBinding> findActiveBindingByCategory(String category) throws IOException {
        if (dataSource == null) {
            return bindingsInMemory.values().stream()
                .filter(binding -> binding.isActive() && binding.getCategory() != null && binding.getCategory().equalsIgnoreCase(category))
                .findFirst();
        }

        ensureTables();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement("""
                 SELECT id, category, template_id, active, created_at, updated_at
                   FROM workflow_category_bindings
                  WHERE active = TRUE AND LOWER(category) = LOWER(?)
                  ORDER BY updated_at DESC, id DESC
                  LIMIT 1
                 """)) {
            ps.setString(1, category);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(mapBinding(rs));
                }
            }
        } catch (Exception ex) {
            throw new IOException("Failed to read workflow binding by category", ex);
        }
        return Optional.empty();
    }

    public WorkflowCategoryBinding saveBinding(WorkflowCategoryBinding binding) throws IOException {
        if (dataSource == null) {
            if (binding.getId() == null || binding.getId().isBlank()) {
                binding.setId(String.valueOf(bindingCounter.getAndIncrement()));
            }
            bindingsInMemory.put(binding.getId(), binding);
            return binding;
        }

        ensureTables();
        try (Connection conn = dataSource.getConnection()) {
            Long parsedId = parseLong(binding.getId());
            if (parsedId == null) {
                try (PreparedStatement ps = conn.prepareStatement("""
                    INSERT INTO workflow_category_bindings(category, template_id, active, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS)) {
                    ps.setString(1, binding.getCategory());
                    ps.setString(2, binding.getTemplateId());
                    ps.setBoolean(3, binding.isActive());
                    ps.setTimestamp(4, toTimestamp(binding.getCreatedAt()));
                    ps.setTimestamp(5, toTimestamp(binding.getUpdatedAt()));
                    ps.executeUpdate();
                    try (ResultSet keys = ps.getGeneratedKeys()) {
                        if (keys.next()) {
                            binding.setId(String.valueOf(keys.getLong(1)));
                        }
                    }
                }
                return binding;
            }

            try (PreparedStatement ps = conn.prepareStatement("""
                UPDATE workflow_category_bindings
                   SET category = ?, template_id = ?, active = ?, created_at = ?, updated_at = ?
                 WHERE id = ?
                """)) {
                ps.setString(1, binding.getCategory());
                ps.setString(2, binding.getTemplateId());
                ps.setBoolean(3, binding.isActive());
                ps.setTimestamp(4, toTimestamp(binding.getCreatedAt()));
                ps.setTimestamp(5, toTimestamp(binding.getUpdatedAt()));
                ps.setLong(6, parsedId);
                ps.executeUpdate();
            }
        } catch (Exception ex) {
            throw new IOException("Failed to save workflow binding", ex);
        }
        return binding;
    }

    public void deleteBinding(String id) throws IOException {
        if (dataSource == null) {
            bindingsInMemory.remove(id);
            return;
        }

        ensureTables();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement("DELETE FROM workflow_category_bindings WHERE id = ?")) {
            ps.setLong(1, Long.parseLong(id));
            ps.executeUpdate();
        } catch (Exception ex) {
            throw new IOException("Failed to delete workflow binding", ex);
        }
    }

    public WorkflowInstance saveInstance(WorkflowInstance instance) throws IOException {
        if (dataSource == null) {
            instancesInMemory.put(instance.getId(), instance);
            return instance;
        }

        ensureTables();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement("""
                 INSERT INTO workflow_instances(id, document_id, template_id, template_name, status, current_activity_id, started_at, ended_at, steps_json)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    document_id = VALUES(document_id),
                    template_id = VALUES(template_id),
                    template_name = VALUES(template_name),
                    status = VALUES(status),
                    current_activity_id = VALUES(current_activity_id),
                    started_at = VALUES(started_at),
                    ended_at = VALUES(ended_at),
                    steps_json = VALUES(steps_json)
                 """)) {
            ps.setString(1, instance.getId());
            ps.setString(2, instance.getDocumentId());
            ps.setString(3, instance.getTemplateId());
            ps.setString(4, instance.getTemplateName());
            ps.setString(5, instance.getStatus() != null ? instance.getStatus().name() : WorkflowInstanceStatus.RUNNING.name());
            ps.setString(6, instance.getCurrentActivityId());
            ps.setTimestamp(7, toTimestamp(instance.getStartedAt()));
            ps.setTimestamp(8, toTimestamp(instance.getEndedAt()));
            ps.setString(9, objectMapper.writeValueAsString(instance.getSteps()));
            ps.executeUpdate();
        } catch (Exception ex) {
            throw new IOException("Failed to save workflow instance", ex);
        }

        return instance;
    }

    public Optional<WorkflowInstance> findInstanceById(String id) throws IOException {
        if (dataSource == null) {
            return Optional.ofNullable(instancesInMemory.get(id));
        }

        ensureTables();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement("""
                 SELECT id, document_id, template_id, template_name, status, current_activity_id, started_at, ended_at, steps_json
                   FROM workflow_instances
                  WHERE id = ?
                  LIMIT 1
                 """)) {
            ps.setString(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(mapInstance(rs));
                }
            }
        } catch (Exception ex) {
            throw new IOException("Failed to read workflow instance", ex);
        }
        return Optional.empty();
    }

    public List<WorkflowInstance> findInstancesByDocumentId(String documentId) throws IOException {
        if (dataSource == null) {
            return instancesInMemory.values().stream()
                .filter(instance -> documentId.equals(instance.getDocumentId()))
                .sorted(Comparator.comparing(WorkflowInstance::getStartedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
        }

        ensureTables();
        List<WorkflowInstance> instances = new ArrayList<>();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement("""
                 SELECT id, document_id, template_id, template_name, status, current_activity_id, started_at, ended_at, steps_json
                   FROM workflow_instances
                  WHERE document_id = ?
                  ORDER BY started_at DESC, id DESC
                 """)) {
            ps.setString(1, documentId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    instances.add(mapInstance(rs));
                }
            }
        } catch (Exception ex) {
            throw new IOException("Failed to read workflow instances by document", ex);
        }
        return instances;
    }

    private WorkflowTemplate mapTemplate(ResultSet rs) throws Exception {
        WorkflowTemplate template = new WorkflowTemplate();
        template.setId(rs.getString("id"));
        template.setTemplateGroupId(rs.getString("template_group_id"));
        template.setName(rs.getString("name"));
        template.setDescription(rs.getString("description"));
        template.setPublished(rs.getBoolean("published"));
        template.setVersionNumber(rs.getInt("version_no"));
        String lifecycle = rs.getString("lifecycle_status");
        if (lifecycle != null && !lifecycle.isBlank()) {
            try {
                template.setLifecycleStatus(WorkflowTemplateLifecycle.valueOf(lifecycle));
            } catch (IllegalArgumentException ignored) {
                template.setLifecycleStatus(template.isPublished() ? WorkflowTemplateLifecycle.PUBLISHED : WorkflowTemplateLifecycle.DRAFT);
            }
        } else {
            template.setLifecycleStatus(template.isPublished() ? WorkflowTemplateLifecycle.PUBLISHED : WorkflowTemplateLifecycle.DRAFT);
        }
        template.setBasedOnTemplateId(rs.getString("based_on_template_id"));
        template.setCreatedBy(rs.getString("created_by"));
        template.setCreatedAt(toInstant(rs.getTimestamp("created_at")));
        template.setUpdatedAt(toInstant(rs.getTimestamp("updated_at")));
        template.setPublishedAt(toInstant(rs.getTimestamp("published_at")));

        String activitiesJson = rs.getString("activities_json");
        if (activitiesJson != null && !activitiesJson.isBlank()) {
            template.setActivities(objectMapper.readValue(activitiesJson, new TypeReference<List<WorkflowActivity>>() {}));
        } else {
            template.setActivities(List.of());
        }

        String connectionsJson = rs.getString("connections_json");
        if (connectionsJson != null && !connectionsJson.isBlank()) {
            template.setConnections(objectMapper.readValue(connectionsJson, new TypeReference<List<WorkflowConnection>>() {}));
        } else {
            template.setConnections(List.of());
        }

        return template;
    }

    private WorkflowCategoryBinding mapBinding(ResultSet rs) throws Exception {
        WorkflowCategoryBinding binding = new WorkflowCategoryBinding();
        binding.setId(String.valueOf(rs.getLong("id")));
        binding.setCategory(rs.getString("category"));
        binding.setTemplateId(rs.getString("template_id"));
        binding.setActive(rs.getBoolean("active"));
        binding.setCreatedAt(toInstant(rs.getTimestamp("created_at")));
        binding.setUpdatedAt(toInstant(rs.getTimestamp("updated_at")));
        return binding;
    }

    private WorkflowInstance mapInstance(ResultSet rs) throws Exception {
        WorkflowInstance instance = new WorkflowInstance();
        instance.setId(rs.getString("id"));
        instance.setDocumentId(rs.getString("document_id"));
        instance.setTemplateId(rs.getString("template_id"));
        instance.setTemplateName(rs.getString("template_name"));

        String status = rs.getString("status");
        if (status != null && !status.isBlank()) {
            instance.setStatus(WorkflowInstanceStatus.valueOf(status));
        }

        instance.setCurrentActivityId(rs.getString("current_activity_id"));
        instance.setStartedAt(toInstant(rs.getTimestamp("started_at")));
        instance.setEndedAt(toInstant(rs.getTimestamp("ended_at")));

        String stepsJson = rs.getString("steps_json");
        if (stepsJson != null && !stepsJson.isBlank()) {
            instance.setSteps(objectMapper.readValue(stepsJson, new TypeReference<List<WorkflowStepLog>>() {}));
        } else {
            instance.setSteps(List.of());
        }

        return instance;
    }

    private Instant toInstant(Timestamp timestamp) {
        return timestamp != null ? timestamp.toInstant() : null;
    }

    private Timestamp toTimestamp(Instant instant) {
        return instant != null ? Timestamp.from(instant) : null;
    }

    private Long parseLong(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private synchronized void ensureTables() throws IOException {
        try (Connection conn = dataSource.getConnection(); Statement st = conn.createStatement()) {
            st.execute("""
                CREATE TABLE IF NOT EXISTS workflow_templates (
                    id VARCHAR(64) PRIMARY KEY,
                    template_group_id VARCHAR(64) NULL,
                    name VARCHAR(160) NOT NULL,
                    description VARCHAR(800) NULL,
                    published BOOLEAN NOT NULL DEFAULT FALSE,
                    version_no INT NOT NULL DEFAULT 0,
                    lifecycle_status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
                    based_on_template_id VARCHAR(64) NULL,
                    created_by VARCHAR(120) NULL,
                    created_at TIMESTAMP NULL,
                    updated_at TIMESTAMP NULL,
                    published_at TIMESTAMP NULL,
                    activities_json LONGTEXT NOT NULL,
                    connections_json LONGTEXT NOT NULL
                )
                """);

            st.execute("""
                CREATE TABLE IF NOT EXISTS workflow_category_bindings (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    category VARCHAR(128) NOT NULL,
                    template_id VARCHAR(64) NOT NULL,
                    active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMP NULL,
                    updated_at TIMESTAMP NULL
                )
                """);

            st.execute("""
                CREATE TABLE IF NOT EXISTS workflow_instances (
                    id VARCHAR(64) PRIMARY KEY,
                    document_id VARCHAR(64) NOT NULL,
                    template_id VARCHAR(64) NOT NULL,
                    template_name VARCHAR(160) NULL,
                    status VARCHAR(32) NOT NULL,
                    current_activity_id VARCHAR(64) NULL,
                    started_at TIMESTAMP NULL,
                    ended_at TIMESTAMP NULL,
                    steps_json LONGTEXT NOT NULL
                )
                """);

            createIndexIfMissing(st, "CREATE INDEX idx_workflow_binding_category ON workflow_category_bindings(category)");
            createIndexIfMissing(st, "CREATE INDEX idx_workflow_instances_document ON workflow_instances(document_id)");
            createIndexIfMissing(st, "CREATE INDEX idx_workflow_templates_group ON workflow_templates(template_group_id)");
            createIndexIfMissing(st, "CREATE INDEX idx_workflow_templates_lifecycle ON workflow_templates(lifecycle_status)");

            addColumnIfMissing(st, "ALTER TABLE workflow_templates ADD COLUMN template_group_id VARCHAR(64) NULL");
            addColumnIfMissing(st, "ALTER TABLE workflow_templates ADD COLUMN version_no INT NOT NULL DEFAULT 0");
            addColumnIfMissing(st, "ALTER TABLE workflow_templates ADD COLUMN lifecycle_status VARCHAR(24) NOT NULL DEFAULT 'DRAFT'");
            addColumnIfMissing(st, "ALTER TABLE workflow_templates ADD COLUMN based_on_template_id VARCHAR(64) NULL");

            try (PreparedStatement normalize = conn.prepareStatement("""
                UPDATE workflow_templates
                   SET template_group_id = COALESCE(template_group_id, id),
                       lifecycle_status = CASE
                           WHEN lifecycle_status IS NULL OR lifecycle_status = '' THEN CASE WHEN published = TRUE THEN 'PUBLISHED' ELSE 'DRAFT' END
                           ELSE lifecycle_status
                       END
                """)) {
                normalize.executeUpdate();
            }
        } catch (Exception ex) {
            throw new IOException("Failed to ensure workflow tables", ex);
        }
    }

    private void createIndexIfMissing(Statement statement, String sql) {
        try {
            statement.execute(sql);
        } catch (Exception ignored) {
            // Index may already exist.
        }
    }

    private void addColumnIfMissing(Statement statement, String sql) {
        try {
            statement.execute(sql);
        } catch (Exception ignored) {
            // Column may already exist.
        }
    }
}
