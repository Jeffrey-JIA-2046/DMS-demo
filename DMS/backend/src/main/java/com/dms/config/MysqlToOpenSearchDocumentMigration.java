package com.dms.config;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.dms.document.model.Document;
import com.dms.document.model.DocumentFolder;
import com.dms.document.model.DocumentFolderPermission;
import com.dms.document.model.DocumentStatus;
import com.dms.document.model.DocumentVersion;
import com.dms.document.model.FolderMetadataField;
import com.dms.document.model.MetadataFieldType;
import com.dms.document.repository.DocumentFolderRepository;
import com.dms.document.repository.DocumentRepository;
import com.dms.document.repository.DocumentVersionRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class MysqlToOpenSearchDocumentMigration {

    private static final Logger log = LoggerFactory.getLogger(MysqlToOpenSearchDocumentMigration.class);

    private final DocumentRepository documentRepository;
    private final DocumentFolderRepository folderRepository;
    private final DocumentVersionRepository versionRepository;
    private final ObjectMapper objectMapper;

    @Autowired(required = false)
    private DataSource dataSource;

    @Value("${app.migration.mysql-to-opensearch.enabled:true}")
    private boolean migrationEnabled;

    @Value("${app.migration.mysql-to-opensearch.force:false}")
    private boolean forceMigration;

    public MysqlToOpenSearchDocumentMigration(
        DocumentRepository documentRepository,
        DocumentFolderRepository folderRepository,
        DocumentVersionRepository versionRepository,
        ObjectMapper objectMapper
    ) {
        this.documentRepository = documentRepository;
        this.folderRepository = folderRepository;
        this.versionRepository = versionRepository;
        this.objectMapper = objectMapper;
    }

    public void migrateIfNeeded() {
        if (!migrationEnabled) {
            return;
        }
        if (dataSource == null) {
            log.debug("Skipping MySQL -> OpenSearch document migration because DataSource is unavailable.");
            return;
        }

        try {
            long currentFolderCount = folderRepository.count();
            long currentDocumentCount = documentRepository.count();
            if (!forceMigration && (currentFolderCount > 0 || currentDocumentCount > 0)) {
                log.debug("Skipping MySQL -> OpenSearch migration (folders={}, documents={}).", currentFolderCount, currentDocumentCount);
                return;
            }
        } catch (Exception ex) {
            log.warn("Unable to evaluate OpenSearch counts before migration: {}", ex.getMessage());
        }

        try (Connection connection = dataSource.getConnection()) {
            String folderTable = findTable(connection, List.of("document_folders", "folders", "dms_document_folders"));
            String documentTable = findTable(connection, List.of("documents", "document", "dms_documents"));
            String versionTable = findTable(connection, List.of("document_versions", "versions", "dms_document_versions"));
            String folderPermissionTable = findTable(connection, List.of("document_folder_permissions", "folder_permissions", "dms_folder_permissions"));

            if (!StringUtils.hasText(folderTable) || !StringUtils.hasText(documentTable)) {
                log.info("Skipping MySQL -> OpenSearch migration: folder/document table not found (folders='{}', documents='{}').", folderTable, documentTable);
                return;
            }

            Map<String, DocumentFolder> foldersById = loadFolders(connection, folderTable);
            if (StringUtils.hasText(folderPermissionTable)) {
                mergeFolderPermissions(connection, folderPermissionTable, foldersById);
            }
            linkFolderHierarchy(foldersById);
            persistFolders(foldersById);

            Map<String, Document> documentsById = loadDocuments(connection, documentTable, foldersById);
            if (StringUtils.hasText(versionTable)) {
                mergeDocumentVersions(connection, versionTable, documentsById);
            } else {
                inferSingleVersionFromDocumentRow(connection, documentTable, documentsById);
            }
            persistDocuments(documentsById);

            log.info("MySQL -> OpenSearch migration completed: {} folders, {} documents.", foldersById.size(), documentsById.size());
        } catch (Exception ex) {
            log.warn("MySQL -> OpenSearch document migration failed: {}", ex.getMessage(), ex);
        }
    }

    private Map<String, DocumentFolder> loadFolders(Connection connection, String tableName) throws Exception {
        Map<String, DocumentFolder> folders = new LinkedHashMap<>();
        Set<String> columns = listColumns(connection, tableName);

        String idColumn = choose(columns, "id", "folder_id");
        String nameColumn = choose(columns, "name", "folder_name", "title");
        String parentIdColumn = choose(columns, "parent_id", "parent_folder_id", "parent");
        String metadataColumn = choose(columns, "metadata_template", "metadata", "template_json");
        String permissionsColumn = choose(columns, "permissions", "folder_permissions", "permissions_json");

        if (!StringUtils.hasText(idColumn) || !StringUtils.hasText(nameColumn)) {
            log.warn("Cannot migrate folders: expected id/name columns are missing in table '{}'.", tableName);
            return folders;
        }

        try (Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery("SELECT * FROM " + tableName)) {
            while (rs.next()) {
                String id = asString(rs.getObject(idColumn));
                if (!StringUtils.hasText(id)) {
                    continue;
                }

                DocumentFolder folder = new DocumentFolder();
                folder.setId(id);
                folder.setName(defaultIfBlank(asString(rs.getObject(nameColumn)), "Untitled"));
                folder.setParentId(asStringOrNull(rs.getObject(parentIdColumn)));

                if (StringUtils.hasText(metadataColumn)) {
                    folder.setMetadataTemplate(parseMetadataTemplate(rs.getObject(metadataColumn)));
                }
                if (StringUtils.hasText(permissionsColumn)) {
                    folder.setPermissions(parseFolderPermissions(rs.getObject(permissionsColumn)));
                }

                folders.put(id, folder);
            }
        }

        return folders;
    }

    private Map<String, Document> loadDocuments(Connection connection, String tableName, Map<String, DocumentFolder> foldersById) throws Exception {
        Map<String, Document> documents = new LinkedHashMap<>();
        Set<String> columns = listColumns(connection, tableName);

        String idColumn = choose(columns, "id", "document_id");
        String titleColumn = choose(columns, "title", "name", "document_name");
        String descriptionColumn = choose(columns, "description", "summary", "details");
        String ownerColumn = choose(columns, "owner", "created_by", "author", "username");
        String categoryColumn = choose(columns, "category", "type");
        String statusColumn = choose(columns, "status", "state");
        String folderIdColumn = choose(columns, "folder_id", "document_folder_id", "folder");
        String approverIdColumn = choose(columns, "approver_id", "approved_by", "approver");
        String tagsColumn = choose(columns, "tags", "tag_list");
        String metadataColumn = choose(columns, "metadata_values", "metadata", "metadata_json");
        String createdAtColumn = choose(columns, "created_at", "created_on", "created_date");
        String updatedAtColumn = choose(columns, "updated_at", "updated_on", "updated_date", "modified_at");
        String approvalRequestedAtColumn = choose(columns, "approval_requested_at", "submitted_at");
        String approvalDecidedAtColumn = choose(columns, "approval_decided_at", "approved_at");

        if (!StringUtils.hasText(idColumn) || !StringUtils.hasText(titleColumn)) {
            log.warn("Cannot migrate documents: expected id/title columns are missing in table '{}'.", tableName);
            return documents;
        }

        try (Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery("SELECT * FROM " + tableName)) {
            while (rs.next()) {
                String id = asString(rs.getObject(idColumn));
                if (!StringUtils.hasText(id)) {
                    continue;
                }

                Document document = new Document();
                document.setId(id);
                document.setTitle(defaultIfBlank(asString(rs.getObject(titleColumn)), "Untitled"));
                document.setDescription(asStringOrNull(rs.getObject(descriptionColumn)));
                document.setOwner(defaultIfBlank(asString(rs.getObject(ownerColumn)), "system"));
                document.setCategory(defaultIfBlank(asString(rs.getObject(categoryColumn)), "General"));
                document.setStatus(parseStatus(asString(rs.getObject(statusColumn))));

                String folderId = asStringOrNull(rs.getObject(folderIdColumn));
                if (StringUtils.hasText(folderId)) {
                    document.setFolderId(folderId);
                    DocumentFolder folder = foldersById.get(folderId);
                    if (folder != null) {
                        document.setFolder(folder);
                    }
                }

                document.setApproverId(asStringOrNull(rs.getObject(approverIdColumn)));
                document.setTags(parseTags(rs.getObject(tagsColumn)));
                document.setMetadataValues(parseMetadataValues(rs.getObject(metadataColumn)));
                document.setCreatedAt(parseInstant(rs.getObject(createdAtColumn)));
                document.setUpdatedAt(parseInstant(rs.getObject(updatedAtColumn)));
                document.setApprovalRequestedAt(parseInstant(rs.getObject(approvalRequestedAtColumn)));
                document.setApprovalDecidedAt(parseInstant(rs.getObject(approvalDecidedAtColumn)));

                documents.put(id, document);
            }
        }

        return documents;
    }

    private void mergeDocumentVersions(Connection connection, String tableName, Map<String, Document> documentsById) throws Exception {
        Set<String> columns = listColumns(connection, tableName);

        String idColumn = choose(columns, "id", "version_id");
        String documentIdColumn = choose(columns, "document_id", "doc_id");
        String versionNumberColumn = choose(columns, "version_number", "version", "revision");
        String fileNameColumn = choose(columns, "file_name", "filename", "name");
        String contentTypeColumn = choose(columns, "content_type", "mime_type", "mime");
        String sizeColumn = choose(columns, "size_bytes", "size", "file_size");
        String contentColumn = choose(columns, "content", "file_content", "blob_data", "data");
        String createdAtColumn = choose(columns, "created_at", "created_on", "uploaded_at");

        if (!StringUtils.hasText(documentIdColumn)) {
            log.warn("Skipping document version migration: table '{}' does not have a document id column.", tableName);
            return;
        }

        try (Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery("SELECT * FROM " + tableName)) {
            while (rs.next()) {
                String documentId = asString(rs.getObject(documentIdColumn));
                Document document = documentsById.get(documentId);
                if (document == null) {
                    continue;
                }

                DocumentVersion version = new DocumentVersion();
                version.setId(defaultIfBlank(asString(rs.getObject(idColumn)), UUID.randomUUID().toString()));
                version.setDocumentId(documentId);
                version.setVersionNumber(parseInt(rs.getObject(versionNumberColumn), document.getVersions().size() + 1));
                version.setFileName(defaultIfBlank(asString(rs.getObject(fileNameColumn)), document.getTitle()));
                version.setContentType(defaultIfBlank(asString(rs.getObject(contentTypeColumn)), "application/octet-stream"));
                byte[] content = asBytes(rs.getObject(contentColumn));
                version.setContent(content);
                long size = parseLong(rs.getObject(sizeColumn), content != null ? content.length : 0L);
                version.setSizeBytes(size);
                version.setCreatedAt(parseInstant(rs.getObject(createdAtColumn)));

                document.getVersions().add(version);
            }
        }
    }

    private void inferSingleVersionFromDocumentRow(Connection connection, String tableName, Map<String, Document> documentsById) throws Exception {
        Set<String> columns = listColumns(connection, tableName);

        String idColumn = choose(columns, "id", "document_id");
        String contentColumn = choose(columns, "content", "file_content", "blob_data", "data");
        if (!StringUtils.hasText(idColumn) || !StringUtils.hasText(contentColumn)) {
            return;
        }

        String fileNameColumn = choose(columns, "file_name", "filename", "name", "title");
        String contentTypeColumn = choose(columns, "content_type", "mime_type", "mime");
        String sizeColumn = choose(columns, "size_bytes", "size", "file_size");
        String createdAtColumn = choose(columns, "created_at", "created_on", "uploaded_at");

        try (Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery("SELECT * FROM " + tableName)) {
            while (rs.next()) {
                String documentId = asString(rs.getObject(idColumn));
                Document document = documentsById.get(documentId);
                if (document == null || !document.getVersions().isEmpty()) {
                    continue;
                }

                byte[] content = asBytes(rs.getObject(contentColumn));
                if (content == null || content.length == 0) {
                    continue;
                }

                DocumentVersion version = new DocumentVersion();
                version.setId(UUID.randomUUID().toString());
                version.setDocumentId(documentId);
                version.setVersionNumber(1);
                version.setFileName(defaultIfBlank(asString(rs.getObject(fileNameColumn)), document.getTitle()));
                version.setContentType(defaultIfBlank(asString(rs.getObject(contentTypeColumn)), "application/octet-stream"));
                version.setContent(content);
                version.setSizeBytes(parseLong(rs.getObject(sizeColumn), content.length));
                version.setCreatedAt(parseInstant(rs.getObject(createdAtColumn)));

                document.getVersions().add(version);
            }
        }
    }

    private void mergeFolderPermissions(Connection connection, String tableName, Map<String, DocumentFolder> foldersById) throws Exception {
        Set<String> columns = listColumns(connection, tableName);

        String folderIdColumn = choose(columns, "folder_id", "document_folder_id");
        String groupIdColumn = choose(columns, "group_id", "user_group_id");
        String groupNameColumn = choose(columns, "group_name", "name");
        String canReadColumn = choose(columns, "can_read", "read_permission", "read_allowed");
        String canWriteColumn = choose(columns, "can_write", "write_permission", "write_allowed");
        String canDeleteColumn = choose(columns, "can_delete", "delete_permission", "delete_allowed");

        if (!StringUtils.hasText(folderIdColumn) || !StringUtils.hasText(groupIdColumn)) {
            return;
        }

        try (Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery("SELECT * FROM " + tableName)) {
            while (rs.next()) {
                String folderId = asString(rs.getObject(folderIdColumn));
                String groupId = asString(rs.getObject(groupIdColumn));
                if (!StringUtils.hasText(folderId) || !StringUtils.hasText(groupId)) {
                    continue;
                }

                DocumentFolder folder = foldersById.get(folderId);
                if (folder == null) {
                    continue;
                }

                DocumentFolderPermission permission = new DocumentFolderPermission();
                permission.setGroupId(groupId);
                permission.setGroupName(asStringOrNull(rs.getObject(groupNameColumn)));
                permission.setCanRead(parseBoolean(rs.getObject(canReadColumn)));
                permission.setCanWrite(parseBoolean(rs.getObject(canWriteColumn)));
                permission.setCanDelete(parseBoolean(rs.getObject(canDeleteColumn)));

                folder.getPermissions().add(permission);
            }
        }
    }

    private void linkFolderHierarchy(Map<String, DocumentFolder> foldersById) {
        Map<String, List<String>> childIdsByParent = new HashMap<>();
        for (DocumentFolder folder : foldersById.values()) {
            String parentId = folder.getParentId();
            if (StringUtils.hasText(parentId)) {
                childIdsByParent.computeIfAbsent(parentId, key -> new ArrayList<>()).add(folder.getId());
                DocumentFolder parent = foldersById.get(parentId);
                if (parent != null) {
                    folder.setParent(parent);
                }
            }
        }

        for (DocumentFolder folder : foldersById.values()) {
            List<String> childIds = childIdsByParent.getOrDefault(folder.getId(), List.of());
            folder.setChildIds(new ArrayList<>(childIds));
        }
    }

    private void persistFolders(Map<String, DocumentFolder> foldersById) {
        List<DocumentFolder> folders = new ArrayList<>(foldersById.values());
        folders.sort(Comparator.comparing(folder -> parentDepth(folder, foldersById)));

        int migrated = 0;
        for (DocumentFolder folder : folders) {
            try {
                folderRepository.save(folder);
                migrated++;
            } catch (Exception ex) {
                log.warn("Failed to migrate folder '{}' ({}): {}", folder.getName(), folder.getId(), ex.getMessage());
            }
        }

        log.info("Migrated {} folder records into OpenSearch.", migrated);
    }

    private void persistDocuments(Map<String, Document> documentsById) {
        int migratedDocuments = 0;
        int migratedVersions = 0;

        for (Document document : documentsById.values()) {
            try {
                List<DocumentVersion> versions = document.getVersions();
                versions.sort((a, b) -> Integer.compare(b.getVersionNumber(), a.getVersionNumber()));
                for (DocumentVersion version : versions) {
                    if (!StringUtils.hasText(version.getDocumentId())) {
                        version.setDocumentId(document.getId());
                    }
                    versionRepository.save(version);
                    migratedVersions++;
                }

                documentRepository.save(document);
                migratedDocuments++;
            } catch (Exception ex) {
                log.warn("Failed to migrate document '{}' ({}): {}", document.getTitle(), document.getId(), ex.getMessage());
            }
        }

        log.info("Migrated {} documents and {} versions into OpenSearch.", migratedDocuments, migratedVersions);
    }

    private int parentDepth(DocumentFolder folder, Map<String, DocumentFolder> foldersById) {
        int depth = 0;
        Set<String> visited = new HashSet<>();
        DocumentFolder current = folder;
        while (current != null && StringUtils.hasText(current.getParentId()) && visited.add(current.getId())) {
            DocumentFolder parent = foldersById.get(current.getParentId());
            if (parent == null) {
                break;
            }
            depth++;
            current = parent;
        }
        return depth;
    }

    private String findTable(Connection connection, List<String> candidates) throws Exception {
        DatabaseMetaData metaData = connection.getMetaData();
        Map<String, String> actualByLowercase = new HashMap<>();

        try (ResultSet tables = metaData.getTables(connection.getCatalog(), null, "%", new String[] { "TABLE" })) {
            while (tables.next()) {
                String table = tables.getString("TABLE_NAME");
                if (table != null) {
                    actualByLowercase.put(table.toLowerCase(Locale.ROOT), table);
                }
            }
        }

        for (String candidate : candidates) {
            String match = actualByLowercase.get(candidate.toLowerCase(Locale.ROOT));
            if (match != null) {
                return match;
            }
        }

        return null;
    }

    private Set<String> listColumns(Connection connection, String tableName) throws Exception {
        Set<String> columns = new HashSet<>();
        try (Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery("SELECT * FROM " + tableName + " WHERE 1 = 0")) {
            ResultSetMetaData metaData = rs.getMetaData();
            for (int i = 1; i <= metaData.getColumnCount(); i++) {
                columns.add(metaData.getColumnName(i).toLowerCase(Locale.ROOT));
            }
        }
        return columns;
    }

    private String choose(Set<String> columns, String... candidates) {
        if (columns == null || columns.isEmpty() || candidates == null) {
            return null;
        }
        for (String candidate : candidates) {
            if (candidate == null) {
                continue;
            }
            String normalized = candidate.toLowerCase(Locale.ROOT);
            if (columns.contains(normalized)) {
                return normalized;
            }
        }
        return null;
    }

    private Instant parseInstant(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Instant instant) {
            return instant;
        }
        if (value instanceof Timestamp timestamp) {
            return timestamp.toInstant();
        }
        try {
            return Instant.parse(String.valueOf(value));
        } catch (Exception ex) {
            return null;
        }
    }

    private DocumentStatus parseStatus(String raw) {
        if (!StringUtils.hasText(raw)) {
            return DocumentStatus.DRAFT;
        }
        String normalized = raw.trim().toUpperCase(Locale.ROOT);
        try {
            return DocumentStatus.valueOf(normalized);
        } catch (IllegalArgumentException ex) {
            return DocumentStatus.DRAFT;
        }
    }

    private Set<String> parseTags(Object value) {
        Set<String> tags = new LinkedHashSet<>();
        if (value == null) {
            return tags;
        }

        if (value instanceof String text) {
            String trimmed = text.trim();
            if (!StringUtils.hasText(trimmed)) {
                return tags;
            }
            if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                try {
                    List<String> values = objectMapper.readValue(trimmed, new TypeReference<List<String>>() {});
                    for (String item : values) {
                        if (StringUtils.hasText(item)) {
                            tags.add(item.trim());
                        }
                    }
                    return tags;
                } catch (Exception ignored) {
                    // fallback to comma-separated parsing
                }
            }
            String[] parts = trimmed.split(",");
            for (String part : parts) {
                if (StringUtils.hasText(part)) {
                    tags.add(part.trim());
                }
            }
            return tags;
        }

        if (value instanceof java.sql.Array sqlArray) {
            try {
                Object[] rawValues = (Object[]) sqlArray.getArray();
                if (rawValues != null) {
                    for (Object item : rawValues) {
                        String text = asStringOrNull(item);
                        if (StringUtils.hasText(text)) {
                            tags.add(text.trim());
                        }
                    }
                }
            } catch (Exception ignored) {
                // leave empty
            }
            return tags;
        }

        return tags;
    }

    private Map<String, String> parseMetadataValues(Object value) {
        if (value == null) {
            return new LinkedHashMap<>();
        }

        if (value instanceof Map<?, ?> map) {
            Map<String, String> normalized = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (entry.getKey() == null) {
                    continue;
                }
                String key = String.valueOf(entry.getKey());
                String val = entry.getValue() != null ? String.valueOf(entry.getValue()) : "";
                normalized.put(key, val);
            }
            return normalized;
        }

        if (value instanceof String text) {
            String trimmed = text.trim();
            if (!StringUtils.hasText(trimmed)) {
                return new LinkedHashMap<>();
            }
            if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
                try {
                    return objectMapper.readValue(trimmed, new TypeReference<Map<String, String>>() {});
                } catch (Exception ignored) {
                    // fallback below
                }
            }
        }

        return new LinkedHashMap<>();
    }

    private List<FolderMetadataField> parseMetadataTemplate(Object value) {
        if (value == null) {
            return new ArrayList<>();
        }

        try {
            if (value instanceof String text && StringUtils.hasText(text)) {
                List<Map<String, Object>> raw = objectMapper.readValue(text, new TypeReference<List<Map<String, Object>>>() {});
                return mapMetadataFields(raw);
            }

            if (value instanceof List<?> list) {
                List<Map<String, Object>> raw = new ArrayList<>();
                for (Object item : list) {
                    if (item instanceof Map<?, ?> map) {
                        Map<String, Object> normalized = new LinkedHashMap<>();
                        for (Map.Entry<?, ?> entry : map.entrySet()) {
                            if (entry.getKey() != null) {
                                normalized.put(String.valueOf(entry.getKey()), entry.getValue());
                            }
                        }
                        raw.add(normalized);
                    }
                }
                return mapMetadataFields(raw);
            }
        } catch (Exception ignored) {
            // ignore malformed templates
        }

        return new ArrayList<>();
    }

    private List<FolderMetadataField> mapMetadataFields(List<Map<String, Object>> raw) {
        List<FolderMetadataField> mapped = new ArrayList<>();
        if (raw == null) {
            return mapped;
        }

        for (Map<String, Object> entry : raw) {
            if (entry == null) {
                continue;
            }

            String key = asStringOrNull(entry.get("key"));
            String label = asStringOrNull(entry.get("label"));
            if (!StringUtils.hasText(key) || !StringUtils.hasText(label)) {
                continue;
            }

            FolderMetadataField field = new FolderMetadataField();
            field.setKey(key.trim());
            field.setLabel(label.trim());
            field.setType(parseMetadataFieldType(asStringOrNull(entry.get("type"))));
            field.setRequired(parseBoolean(entry.get("required")));
            field.setHint(asStringOrNull(entry.get("hint")));
            mapped.add(field);
        }

        return mapped;
    }

    private MetadataFieldType parseMetadataFieldType(String raw) {
        if (!StringUtils.hasText(raw)) {
            return MetadataFieldType.TEXT;
        }
        try {
            return MetadataFieldType.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return MetadataFieldType.TEXT;
        }
    }

    private List<DocumentFolderPermission> parseFolderPermissions(Object value) {
        List<DocumentFolderPermission> permissions = new ArrayList<>();
        if (value == null) {
            return permissions;
        }

        try {
            if (value instanceof String text && StringUtils.hasText(text)) {
                List<Map<String, Object>> raw = objectMapper.readValue(text, new TypeReference<List<Map<String, Object>>>() {});
                return mapPermissions(raw);
            }
            if (value instanceof List<?> list) {
                List<Map<String, Object>> raw = new ArrayList<>();
                for (Object item : list) {
                    if (item instanceof Map<?, ?> map) {
                        Map<String, Object> normalized = new LinkedHashMap<>();
                        for (Map.Entry<?, ?> entry : map.entrySet()) {
                            if (entry.getKey() != null) {
                                normalized.put(String.valueOf(entry.getKey()), entry.getValue());
                            }
                        }
                        raw.add(normalized);
                    }
                }
                return mapPermissions(raw);
            }
        } catch (Exception ignored) {
            // ignore malformed permissions
        }

        return permissions;
    }

    private List<DocumentFolderPermission> mapPermissions(List<Map<String, Object>> raw) {
        List<DocumentFolderPermission> mapped = new ArrayList<>();
        if (raw == null) {
            return mapped;
        }

        for (Map<String, Object> item : raw) {
            if (item == null) {
                continue;
            }

            String groupId = firstNonBlank(
                asStringOrNull(item.get("group_id")),
                asStringOrNull(item.get("groupId"))
            );
            if (!StringUtils.hasText(groupId)) {
                continue;
            }

            DocumentFolderPermission permission = new DocumentFolderPermission();
            permission.setGroupId(groupId);
            permission.setGroupName(firstNonBlank(
                asStringOrNull(item.get("group_name")),
                asStringOrNull(item.get("groupName"))
            ));
            permission.setCanRead(parseBoolean(firstNonNull(item.get("can_read"), item.get("canRead"))));
            permission.setCanWrite(parseBoolean(firstNonNull(item.get("can_write"), item.get("canWrite"))));
            permission.setCanDelete(parseBoolean(firstNonNull(item.get("can_delete"), item.get("canDelete"))));
            mapped.add(permission);
        }

        return mapped;
    }

    private Object firstNonNull(Object first, Object second) {
        return first != null ? first : second;
    }

    private String firstNonBlank(String first, String second) {
        if (StringUtils.hasText(first)) {
            return first;
        }
        return StringUtils.hasText(second) ? second : null;
    }

    private boolean parseBoolean(Object value) {
        if (value == null) {
            return false;
        }
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value instanceof Number number) {
            return number.intValue() != 0;
        }
        String text = String.valueOf(value).trim().toLowerCase(Locale.ROOT);
        return Objects.equals(text, "1")
            || Objects.equals(text, "true")
            || Objects.equals(text, "yes")
            || Objects.equals(text, "y");
    }

    private int parseInt(Object value, int fallback) {
        if (value == null) {
            return fallback;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception ex) {
            return fallback;
        }
    }

    private long parseLong(Object value, long fallback) {
        if (value == null) {
            return fallback;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (Exception ex) {
            return fallback;
        }
    }

    private byte[] asBytes(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof byte[] bytes) {
            return bytes;
        }
        return null;
    }

    private String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private String asStringOrNull(Object value) {
        String text = asString(value);
        if (!StringUtils.hasText(text)) {
            return null;
        }
        return text.trim();
    }

    private String defaultIfBlank(String value, String fallback) {
        return StringUtils.hasText(value) ? value.trim() : fallback;
    }
}
