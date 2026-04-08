package com.dms.document.repository;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import javax.sql.DataSource;

import com.dms.document.model.DocumentFolder;
import com.dms.document.model.DocumentFolderPermission;
import com.dms.document.model.FolderMetadataField;
import com.dms.document.model.MetadataFieldType;
import com.dms.repository.BaseOpenSearchRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opensearch.client.opensearch.OpenSearchClient;

@Repository
public class DocumentFolderRepository extends BaseOpenSearchRepository<DocumentFolder> {

    @Value("${app.opensearch.folders-index:dms-document-folders}")
    private String foldersIndex;

    @Value("${app.opensearch.enabled:false}")
    private boolean openSearchEnabled;

    @Autowired(required = false)
    private DataSource dataSource;

    @Autowired
    public DocumentFolderRepository(OpenSearchClient openSearchClient, ObjectMapper objectMapper) {
        super(openSearchClient, objectMapper, DocumentFolder.class);
    }

    @PostConstruct
    public void ensureSchema() {
        if (dataSource == null) return;
        try (Connection conn = dataSource.getConnection()) {
            // Add code_table_code column to folder_metadata_fields if not yet present
            try (ResultSet cols = conn.getMetaData().getColumns(null, null, "folder_metadata_fields", "code_table_code")) {
                if (!cols.next()) {
                    try (Statement st = conn.createStatement()) {
                        st.execute("ALTER TABLE folder_metadata_fields ADD COLUMN code_table_code VARCHAR(64) NULL");
                    }
                }
            }
        } catch (Exception ex) {
            // Non-fatal: table may not exist yet (created on first folder save)
        }
    }

    @Override
    protected String getIndexName() {
        return foldersIndex;
    }

    @Override
    public List<DocumentFolder> findAll() throws IOException {
        if (openSearchEnabled || dataSource == null) {
            return super.findAll();
        }

        try (Connection conn = dataSource.getConnection()) {
            Map<String, DocumentFolder> byId = new HashMap<>();
            try (PreparedStatement ps = conn.prepareStatement("SELECT id, name, parent_id FROM document_folders");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    DocumentFolder folder = new DocumentFolder();
                    folder.setId(String.valueOf(rs.getLong("id")));
                    folder.setName(rs.getString("name"));
                    long parentId = rs.getLong("parent_id");
                    if (!rs.wasNull()) {
                        folder.setParentId(String.valueOf(parentId));
                    }
                    byId.put(folder.getId(), folder);
                }
            }

            try (PreparedStatement ps = conn.prepareStatement(
                "SELECT p.folder_id, p.group_id, g.name, p.can_read, p.can_write, p.can_delete " +
                    "FROM folder_group_permissions p LEFT JOIN user_groups g ON g.id = p.group_id");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String folderId = String.valueOf(rs.getLong("folder_id"));
                    DocumentFolder folder = byId.get(folderId);
                    if (folder == null) {
                        continue;
                    }
                    DocumentFolderPermission permission = new DocumentFolderPermission();
                    permission.setFolder(folder);
                    permission.setGroupId(String.valueOf(rs.getLong("group_id")));
                    permission.setGroupName(rs.getString("name"));
                    permission.setCanRead(rs.getBoolean("can_read"));
                    permission.setCanWrite(rs.getBoolean("can_write"));
                    permission.setCanDelete(rs.getBoolean("can_delete"));
                    folder.getPermissions().add(permission);
                }
            }

            try (PreparedStatement ps = conn.prepareStatement(
                "SELECT folder_id, field_key, field_label, field_type, is_required, field_hint, code_table_code " +
                    "FROM folder_metadata_fields ORDER BY folder_id, field_order");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String folderId = String.valueOf(rs.getLong("folder_id"));
                    DocumentFolder folder = byId.get(folderId);
                    if (folder == null) {
                        continue;
                    }
                    FolderMetadataField field = new FolderMetadataField();
                    field.setKey(rs.getString("field_key"));
                    field.setLabel(rs.getString("field_label"));
                    try {
                        field.setType(MetadataFieldType.valueOf(rs.getString("field_type")));
                    } catch (Exception ex) {
                        field.setType(MetadataFieldType.TEXT);
                    }
                    field.setRequired(rs.getBoolean("is_required"));
                    field.setHint(rs.getString("field_hint"));
                    try {
                        field.setCodeTableCode(rs.getString("code_table_code"));
                    } catch (Exception ex) {
                        // column may not yet exist on older schemas
                    }
                    folder.getMetadataTemplate().add(field);
                }
            }

            for (DocumentFolder folder : byId.values()) {
                String parentId = folder.getParentId();
                if (StringUtils.hasText(parentId)) {
                    DocumentFolder parent = byId.get(parentId);
                    if (parent != null) {
                        folder.setParent(parent);
                        parent.getChildIds().add(folder.getId());
                    }
                }
            }

            return new ArrayList<>(byId.values());
        } catch (Exception ex) {
            throw new IOException("Failed to read folders from MySQL", ex);
        }
    }

    @Override
    public java.util.Optional<DocumentFolder> findById(String id) throws IOException {
        if (openSearchEnabled || dataSource == null) {
            return super.findById(id);
        }
        return findAll().stream().filter(folder -> id.equals(folder.getId())).findFirst();
    }

    @Override
    public DocumentFolder save(DocumentFolder entity) throws IOException {
        if (openSearchEnabled || dataSource == null) {
            return super.save(entity);
        }

        try (Connection conn = dataSource.getConnection()) {
            Long id = parseLong(entity.getId());
            Long parentId = parseLong(entity.getParentId());
            if (parentId == null && entity.getParent() != null) {
                parentId = parseLong(entity.getParent().getId());
            }

            if (id == null) {
                try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO document_folders(name, parent_id) VALUES (?, ?)",
                    Statement.RETURN_GENERATED_KEYS)) {
                    ps.setString(1, entity.getName());
                    if (parentId == null) {
                        ps.setNull(2, java.sql.Types.BIGINT);
                    } else {
                        ps.setLong(2, parentId);
                    }
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
                    "UPDATE document_folders SET name=?, parent_id=? WHERE id=?")) {
                    ps.setString(1, entity.getName());
                    if (parentId == null) {
                        ps.setNull(2, java.sql.Types.BIGINT);
                    } else {
                        ps.setLong(2, parentId);
                    }
                    ps.setLong(3, id);
                    ps.executeUpdate();
                }
            }

            if (id != null) {
                try (PreparedStatement deletePerms = conn.prepareStatement("DELETE FROM folder_group_permissions WHERE folder_id = ?")) {
                    deletePerms.setLong(1, id);
                    deletePerms.executeUpdate();
                }

                List<DocumentFolderPermission> permissions = entity.getPermissions() == null ? List.of() : entity.getPermissions();
                for (DocumentFolderPermission permission : permissions) {
                    Long groupId = parseLong(permission.getGroupId());
                    if (groupId == null && permission.getGroup() != null) {
                        groupId = parseLong(permission.getGroup().getId());
                    }
                    if (groupId == null) {
                        continue;
                    }
                    try (PreparedStatement insert = conn.prepareStatement(
                        "INSERT INTO folder_group_permissions(folder_id, group_id, can_read, can_write, can_delete) VALUES (?, ?, ?, ?, ?)")) {
                        insert.setLong(1, id);
                        insert.setLong(2, groupId);
                        insert.setBoolean(3, permission.isCanRead());
                        insert.setBoolean(4, permission.isCanWrite());
                        insert.setBoolean(5, permission.isCanDelete());
                        insert.executeUpdate();
                    }
                }

                try (PreparedStatement deleteTemplate = conn.prepareStatement("DELETE FROM folder_metadata_fields WHERE folder_id = ?")) {
                    deleteTemplate.setLong(1, id);
                    deleteTemplate.executeUpdate();
                }

                List<FolderMetadataField> template = entity.getMetadataTemplate() == null ? List.of() : entity.getMetadataTemplate();
                for (int i = 0; i < template.size(); i++) {
                    FolderMetadataField field = template.get(i);
                    try (PreparedStatement insert = conn.prepareStatement(
                        "INSERT INTO folder_metadata_fields(folder_id, field_hint, field_key, field_label, is_required, field_type, field_order, code_table_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")) {
                        insert.setLong(1, id);
                        insert.setString(2, field.getHint());
                        insert.setString(3, field.getKey());
                        insert.setString(4, field.getLabel());
                        insert.setBoolean(5, field.isRequired());
                        insert.setString(6, field.getType() != null ? field.getType().name() : MetadataFieldType.TEXT.name());
                        insert.setInt(7, i);
                        insert.setString(8, field.getCodeTableCode());
                        insert.executeUpdate();
                    }
                }
            }

            return findById(entity.getId()).orElse(entity);
        } catch (Exception ex) {
            throw new IOException("Failed to save folder into MySQL", ex);
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
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM folder_group_permissions WHERE folder_id = ?")) {
                ps.setLong(1, numericId);
                ps.executeUpdate();
            }
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM folder_metadata_fields WHERE folder_id = ?")) {
                ps.setLong(1, numericId);
                ps.executeUpdate();
            }
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM document_folders WHERE id = ?")) {
                ps.setLong(1, numericId);
                ps.executeUpdate();
            }
        } catch (Exception ex) {
            throw new IOException("Failed to delete folder from MySQL", ex);
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

    /**
     * Find root folders (no parent).
     */
    public List<DocumentFolder> findByParentIdIsNull() throws IOException {
        return findAll().stream()
            .filter(f -> f.getParentId() == null)
            .toList();
    }

    /**
     * Find folders by parent ID.
     */
    public List<DocumentFolder> findByParentId(String parentId) throws IOException {
        return findAll().stream()
            .filter(f -> parentId.equals(f.getParentId()))
            .toList();
    }

    /**
     * Check if root folder with name exists (case insensitive).
     */
    public boolean existsByParentIsNullAndNameIgnoreCase(String name) throws IOException {
        return findAll().stream()
            .anyMatch(f -> f.getParentId() == null && name.equalsIgnoreCase(f.getName()));
    }

    /**
     * Check if root folder with name exists, excluding a specific ID (case insensitive).
     */
    public boolean existsByParentIsNullAndNameIgnoreCaseAndIdNot(String name, String id) throws IOException {
        return findAll().stream()
            .anyMatch(f -> f.getParentId() == null && name.equalsIgnoreCase(f.getName()) && !id.equals(f.getId()));
    }

    /**
     * Check if folder with name exists under parent (case insensitive).
     */
    public boolean existsByParentIdAndNameIgnoreCase(String parentId, String name) throws IOException {
        return findAll().stream()
            .anyMatch(f -> parentId.equals(f.getParentId()) && name.equalsIgnoreCase(f.getName()));
    }

    /**
     * Check if folder with name exists under parent, excluding a specific ID (case insensitive).
     */
    public boolean existsByParentIdAndNameIgnoreCaseAndIdNot(String parentId, String name, String id) throws IOException {
        return findAll().stream()
            .anyMatch(f -> parentId.equals(f.getParentId()) && name.equalsIgnoreCase(f.getName()) && !id.equals(f.getId()));
    }
}
