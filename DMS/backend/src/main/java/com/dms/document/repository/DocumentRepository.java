package com.dms.document.repository;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import javax.sql.DataSource;

import com.dms.document.model.Document;
import com.dms.document.model.DocumentApprovalNote;
import com.dms.document.model.DocumentStatus;
import com.dms.document.model.DocumentVersion;
import com.dms.user.model.AppUser;
import com.dms.user.model.UserGroup;
import com.dms.repository.BaseOpenSearchRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.Refresh;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.UpdateRequest;

@Repository
public class DocumentRepository extends BaseOpenSearchRepository<Document> {

    @Value("${app.opensearch.documents-index:dms-documents}")
    private String documentsIndex;

    @Value("${app.opensearch.enabled:false}")
    private boolean openSearchEnabled;

    @Autowired(required = false)
    private DataSource dataSource;

    private volatile boolean statusColumnChecked;
    private volatile boolean supervisorColumnChecked;
    private volatile boolean reviewerColumnChecked;

    @Autowired
    public DocumentRepository(OpenSearchClient openSearchClient, ObjectMapper objectMapper) {
        super(openSearchClient, objectMapper, Document.class);
    }

    @Override
    protected String getIndexName() {
        return documentsIndex;
    }

    /**
     * Always writes extraction fields directly to OpenSearch, regardless of the
     * openSearchEnabled flag. These fields do not exist as MySQL columns so they
     * must never go through the MySQL save path.
     */
    public void updateExtractionFields(
        String documentId,
        boolean hasDataExtraction,
        Map<String, Object> extractedJson,
        String extractionFormType,
        Instant extractionSavedAt
    ) throws IOException {
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("has_data_extraction", hasDataExtraction);
        doc.put("extracted_json", extractedJson != null ? extractedJson : Map.of());
        doc.put("extraction_form_type", extractionFormType);
        doc.put("extraction_saved_at", extractionSavedAt != null ? extractionSavedAt.toString() : null);

        UpdateRequest<Map<String, Object>, Map<String, Object>> request =
            new UpdateRequest.Builder<Map<String, Object>, Map<String, Object>>()
                .index(documentsIndex)
                .id(documentId)
                .doc(doc)
                .refresh(Refresh.WaitFor)
                .build();

        @SuppressWarnings("unchecked")
        Class<Map<String, Object>> mapClass = (Class<Map<String, Object>>) (Class<?>) Map.class;
        openSearchClient.update(request, mapClass);
    }

    @Override
    public List<Document> findAll() throws IOException {
        if (openSearchEnabled || dataSource == null) {
            // Exclude raw file content bytes from the list query — this field is
            // only needed for downloads, which go through findById (GET) instead.
            SearchRequest request = new SearchRequest.Builder()
                .index(getIndexName())
                .size(10000)
                .source(s -> s.filter(f -> f.excludes("versions.content")))
                .build();
            SearchResponse<Document> response = openSearchClient.search(request, Document.class);
            return extractHits(response);
        }

        try (Connection conn = dataSource.getConnection()) {
            ensureSupervisorColumn(conn);
            ensureReviewerColumn(conn);
            List<Document> documents = new ArrayList<>();
            Map<String, Document> byId = new HashMap<>();

            try (PreparedStatement ps = conn.prepareStatement(
                "SELECT id, title, description, owner, category, status, folder_id, approver_id, reviewer_id, supervisor_id, created_at, updated_at, approval_requested_at, approval_decided_at FROM documents");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Document document = new Document();
                    String id = String.valueOf(rs.getLong("id"));
                    document.setId(id);
                    document.setTitle(rs.getString("title"));
                    document.setDescription(rs.getString("description"));
                    document.setOwner(rs.getString("owner"));
                    document.setCategory(rs.getString("category"));
                    try {
                        String rawStatus = rs.getString("status");
                        document.setStatus(rawStatus == null ? DocumentStatus.DRAFT : DocumentStatus.valueOf(rawStatus));
                    } catch (Exception ex) {
                        document.setStatus(DocumentStatus.DRAFT);
                    }
                    long folderId = rs.getLong("folder_id");
                    if (!rs.wasNull()) {
                        document.setFolderId(String.valueOf(folderId));
                    }
                    long approverId = rs.getLong("approver_id");
                    if (!rs.wasNull()) {
                        document.setApproverId(String.valueOf(approverId));
                    }
                    long reviewerId = rs.getLong("reviewer_id");
                    if (!rs.wasNull()) {
                        document.setReviewerId(String.valueOf(reviewerId));
                    }
                    long supervisorId = rs.getLong("supervisor_id");
                    if (!rs.wasNull()) {
                        document.setSupervisorId(String.valueOf(supervisorId));
                    }
                    document.setCreatedAt(toInstant(rs.getTimestamp("created_at")));
                    document.setUpdatedAt(toInstant(rs.getTimestamp("updated_at")));
                    document.setApprovalRequestedAt(toInstant(rs.getTimestamp("approval_requested_at")));
                    document.setApprovalDecidedAt(toInstant(rs.getTimestamp("approval_decided_at")));
                    documents.add(document);
                    byId.put(id, document);
                }
            }

            if (documents.isEmpty()) {
                return documents;
            }

            Map<String, com.dms.document.model.DocumentFolder> folderMap = loadFolders(conn);
            Map<String, AppUser> userMap = loadUsers(conn);

            for (Document document : documents) {
                if (StringUtils.hasText(document.getFolderId())) {
                    document.setFolder(folderMap.get(document.getFolderId()));
                }
                if (StringUtils.hasText(document.getApproverId())) {
                    document.setApprover(userMap.get(document.getApproverId()));
                }
                if (StringUtils.hasText(document.getReviewerId())) {
                    document.setReviewer(userMap.get(document.getReviewerId()));
                }
                if (StringUtils.hasText(document.getSupervisorId())) {
                    document.setSupervisor(userMap.get(document.getSupervisorId()));
                }
            }

            try (PreparedStatement ps = conn.prepareStatement(
                "SELECT document_id, tag FROM document_tags");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Document document = byId.get(String.valueOf(rs.getLong("document_id")));
                    if (document != null && rs.getString("tag") != null) {
                        document.getTags().add(rs.getString("tag"));
                    }
                }
            }

            try (PreparedStatement ps = conn.prepareStatement(
                "SELECT document_id, field_key, field_value FROM document_metadata_values");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Document document = byId.get(String.valueOf(rs.getLong("document_id")));
                    if (document != null) {
                        document.getMetadataValues().put(rs.getString("field_key"), rs.getString("field_value"));
                    }
                }
            }

            try (PreparedStatement ps = conn.prepareStatement(
                "SELECT id, document_id, version_number, file_name, content_type, size_bytes, content, created_at FROM document_versions ORDER BY document_id, version_number DESC");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Document document = byId.get(String.valueOf(rs.getLong("document_id")));
                    if (document == null) {
                        continue;
                    }
                    DocumentVersion version = new DocumentVersion();
                    version.setId(String.valueOf(rs.getLong("id")));
                    version.setDocumentId(document.getId());
                    version.setDocument(document);
                    version.setVersionNumber(rs.getInt("version_number"));
                    version.setFileName(rs.getString("file_name"));
                    version.setContentType(rs.getString("content_type"));
                    version.setSizeBytes(rs.getLong("size_bytes"));
                    version.setContent(rs.getBytes("content"));
                    version.setCreatedAt(toInstant(rs.getTimestamp("created_at")));
                    document.getVersions().add(version);
                }
            }

            try (PreparedStatement ps = conn.prepareStatement(
                "SELECT id, document_id, author_id, note, created_at FROM document_approval_notes ORDER BY created_at ASC");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Document document = byId.get(String.valueOf(rs.getLong("document_id")));
                    if (document == null) {
                        continue;
                    }
                    DocumentApprovalNote note = new DocumentApprovalNote();
                    note.setId(String.valueOf(rs.getLong("id")));
                    note.setDocumentId(document.getId());
                    note.setNote(rs.getString("note"));
                    note.setCreatedAt(toInstant(rs.getTimestamp("created_at")));
                    long authorId = rs.getLong("author_id");
                    if (!rs.wasNull()) {
                        note.setAuthor(userMap.get(String.valueOf(authorId)));
                    }
                    document.getApprovalNotes().add(note);
                }
            }

            return documents;
        } catch (Exception ex) {
            throw new IOException("Failed to read documents from MySQL", ex);
        }
    }

    @Override
    public java.util.Optional<Document> findById(String id) throws IOException {
        if (openSearchEnabled || dataSource == null) {
            SearchRequest request = new SearchRequest.Builder()
                .index(getIndexName())
                .size(1)
                .query(q -> q.ids(i -> i.values(id)))
                .source(s -> s.filter(f -> f.excludes("versions.content")))
                .build();
            SearchResponse<Document> response = openSearchClient.search(request, Document.class);
            return extractHits(response).stream().findFirst();
        }
        return findAll().stream().filter(document -> id.equals(document.getId())).findFirst();
    }

    @Override
    public Document save(Document entity) throws IOException {
        if (openSearchEnabled || dataSource == null) {
            String id = entity != null ? entity.getId() : null;
            @SuppressWarnings("unchecked")
            Map<String, Object> payload = objectMapper.convertValue(entity, Map.class);
            stripVersionContentForOpenSearch(payload);

            var response = openSearchClient.index(i -> {
                var builder = i.index(documentsIndex).document(payload).refresh(Refresh.WaitFor);
                if (id != null && !id.isBlank()) {
                    builder.id(id);
                }
                return builder;
            });

            if ((id == null || id.isBlank()) && entity != null) {
                entity.setId(response.id());
            }
            return entity;
        }

        try (Connection conn = dataSource.getConnection()) {
            ensureStatusColumnSupportsRejected(conn);
            ensureSupervisorColumn(conn);
            ensureReviewerColumn(conn);

            Long id = parseLong(entity.getId());
            Long folderId = parseLong(entity.getFolderId());
            if (folderId == null && entity.getFolder() != null) {
                folderId = parseLong(entity.getFolder().getId());
            }
            Long approverId = parseLong(entity.getApproverId());
            if (approverId == null && entity.getApprover() != null) {
                approverId = parseLong(entity.getApprover().getId());
            }
            Long reviewerId = parseLong(entity.getReviewerId());
            if (reviewerId == null && entity.getReviewer() != null) {
                reviewerId = parseLong(entity.getReviewer().getId());
            }
            Long supervisorId = parseLong(entity.getSupervisorId());
            if (supervisorId == null && entity.getSupervisor() != null) {
                supervisorId = parseLong(entity.getSupervisor().getId());
            }

            if (id == null) {
                try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO documents(category, created_at, description, owner, status, title, updated_at, folder_id, approval_decided_at, approval_requested_at, approver_id, reviewer_id, supervisor_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS)) {
                    applyDocumentColumns(ps, entity, folderId, approverId, reviewerId, supervisorId);
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
                    "UPDATE documents SET category=?, created_at=?, description=?, owner=?, status=?, title=?, updated_at=?, folder_id=?, approval_decided_at=?, approval_requested_at=?, approver_id=?, reviewer_id=?, supervisor_id=? WHERE id=?")) {
                    applyDocumentColumns(ps, entity, folderId, approverId, reviewerId, supervisorId);
                    ps.setLong(14, id);
                    ps.executeUpdate();
                }
            }

            if (id != null) {
                try (PreparedStatement ps = conn.prepareStatement("DELETE FROM document_versions WHERE document_id=?")) {
                    ps.setLong(1, id);
                    ps.executeUpdate();
                }
                for (DocumentVersion version : entity.getVersions() == null ? List.<DocumentVersion>of() : entity.getVersions()) {
                    Long versionId = parseLong(version.getId());
                    if (versionId == null) {
                        try (PreparedStatement ps = conn.prepareStatement(
                            "INSERT INTO document_versions(content, content_type, created_at, file_name, size_bytes, version_number, document_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
                            Statement.RETURN_GENERATED_KEYS)) {
                            ps.setBytes(1, version.getContent());
                            ps.setString(2, version.getContentType());
                            ps.setTimestamp(3, toTimestamp(version.getCreatedAt()));
                            ps.setString(4, version.getFileName());
                            ps.setLong(5, version.getSizeBytes());
                            ps.setInt(6, version.getVersionNumber());
                            ps.setLong(7, id);
                            ps.executeUpdate();
                            try (ResultSet keys = ps.getGeneratedKeys()) {
                                if (keys.next()) {
                                    version.setId(String.valueOf(keys.getLong(1)));
                                }
                            }
                        }
                    } else {
                        try (PreparedStatement ps = conn.prepareStatement(
                            "INSERT INTO document_versions(id, content, content_type, created_at, file_name, size_bytes, version_number, document_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)") ) {
                            ps.setLong(1, versionId);
                            ps.setBytes(2, version.getContent());
                            ps.setString(3, version.getContentType());
                            ps.setTimestamp(4, toTimestamp(version.getCreatedAt()));
                            ps.setString(5, version.getFileName());
                            ps.setLong(6, version.getSizeBytes());
                            ps.setInt(7, version.getVersionNumber());
                            ps.setLong(8, id);
                            ps.executeUpdate();
                        }
                    }
                    version.setDocumentId(String.valueOf(id));
                }

                try (PreparedStatement ps = conn.prepareStatement("DELETE FROM document_tags WHERE document_id=?")) {
                    ps.setLong(1, id);
                    ps.executeUpdate();
                }
                for (String tag : entity.getTags() == null ? Set.<String>of() : entity.getTags()) {
                    try (PreparedStatement ps = conn.prepareStatement("INSERT INTO document_tags(document_id, tag) VALUES (?, ?)")) {
                        ps.setLong(1, id);
                        ps.setString(2, tag);
                        ps.executeUpdate();
                    }
                }

                try (PreparedStatement ps = conn.prepareStatement("DELETE FROM document_metadata_values WHERE document_id=?")) {
                    ps.setLong(1, id);
                    ps.executeUpdate();
                }
                for (Map.Entry<String, String> entry : entity.getMetadataValues() == null
                    ? Map.<String, String>of().entrySet()
                    : entity.getMetadataValues().entrySet()) {
                    try (PreparedStatement ps = conn.prepareStatement(
                        "INSERT INTO document_metadata_values(document_id, field_value, field_key) VALUES (?, ?, ?)")) {
                        ps.setLong(1, id);
                        ps.setString(2, entry.getValue());
                        ps.setString(3, entry.getKey());
                        ps.executeUpdate();
                    }
                }

                try (PreparedStatement ps = conn.prepareStatement("DELETE FROM document_approval_notes WHERE document_id=?")) {
                    ps.setLong(1, id);
                    ps.executeUpdate();
                }
                for (DocumentApprovalNote note : entity.getApprovalNotes() == null ? List.<DocumentApprovalNote>of() : entity.getApprovalNotes()) {
                    Long noteId = parseLong(note.getId());
                    Long authorId = note.getAuthor() != null ? parseLong(note.getAuthor().getId()) : null;
                    if (noteId == null) {
                        try (PreparedStatement ps = conn.prepareStatement(
                            "INSERT INTO document_approval_notes(created_at, note, author_id, document_id) VALUES (?, ?, ?, ?)",
                            Statement.RETURN_GENERATED_KEYS)) {
                            ps.setTimestamp(1, toTimestamp(note.getCreatedAt()));
                            ps.setString(2, note.getNote());
                            if (authorId == null) {
                                ps.setNull(3, java.sql.Types.BIGINT);
                            } else {
                                ps.setLong(3, authorId);
                            }
                            ps.setLong(4, id);
                            ps.executeUpdate();
                            try (ResultSet keys = ps.getGeneratedKeys()) {
                                if (keys.next()) {
                                    note.setId(String.valueOf(keys.getLong(1)));
                                }
                            }
                        }
                    } else {
                        try (PreparedStatement ps = conn.prepareStatement(
                            "INSERT INTO document_approval_notes(id, created_at, note, author_id, document_id) VALUES (?, ?, ?, ?, ?)") ) {
                            ps.setLong(1, noteId);
                            ps.setTimestamp(2, toTimestamp(note.getCreatedAt()));
                            ps.setString(3, note.getNote());
                            if (authorId == null) {
                                ps.setNull(4, java.sql.Types.BIGINT);
                            } else {
                                ps.setLong(4, authorId);
                            }
                            ps.setLong(5, id);
                            ps.executeUpdate();
                        }
                    }
                    note.setDocumentId(String.valueOf(id));
                }
            }

            return findById(entity.getId()).orElse(entity);
        } catch (Exception ex) {
            throw new IOException("Failed to save document into MySQL", ex);
        }
    }

    @SuppressWarnings("unchecked")
    private void stripVersionContentForOpenSearch(Map<String, Object> payload) {
        if (payload == null) {
            return;
        }
        Object versionsObj = payload.get("versions");
        if (!(versionsObj instanceof List<?> versions)) {
            return;
        }
        for (Object item : versions) {
            if (!(item instanceof Map<?, ?> rawMap)) {
                continue;
            }
            Map<String, Object> version = (Map<String, Object>) rawMap;
            version.remove("content");
        }
    }

    @Override
    public void deleteById(String id) throws IOException {
        if (openSearchEnabled || dataSource == null) {
            cleanupVersionStorageForDocument(id);
            super.deleteById(id);
            return;
        }
        Long numericId = parseLong(id);
        if (numericId == null) {
            return;
        }
        try (Connection conn = dataSource.getConnection()) {
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM document_versions WHERE document_id=?")) {
                ps.setLong(1, numericId);
                ps.executeUpdate();
            }
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM document_tags WHERE document_id=?")) {
                ps.setLong(1, numericId);
                ps.executeUpdate();
            }
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM document_metadata_values WHERE document_id=?")) {
                ps.setLong(1, numericId);
                ps.executeUpdate();
            }
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM document_approval_notes WHERE document_id=?")) {
                ps.setLong(1, numericId);
                ps.executeUpdate();
            }
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM documents WHERE id=?")) {
                ps.setLong(1, numericId);
                ps.executeUpdate();
            }
        } catch (Exception ex) {
            throw new IOException("Failed to delete document from MySQL", ex);
        }
    }

    private void cleanupVersionStorageForDocument(String documentId) throws IOException {
        if (dataSource == null || !StringUtils.hasText(documentId)) {
            return;
        }
        Long numericId = parseLong(documentId);
        try (Connection conn = dataSource.getConnection()) {
            try (PreparedStatement ps = conn.prepareStatement(
                "DELETE FROM document_versions WHERE os_document_id = ?" + (numericId != null ? " OR document_id = ?" : ""))) {
                ps.setString(1, documentId);
                if (numericId != null) {
                    ps.setLong(2, numericId);
                }
                ps.executeUpdate();
            }
        } catch (Exception ex) {
            throw new IOException("Failed to cleanup document versions from MySQL", ex);
        }
    }

    /**
     * Find documents by owner.
     */
    public List<Document> findByOwner(String owner) throws IOException {
        return findAll().stream().filter(d -> owner != null && owner.equalsIgnoreCase(d.getOwner())).toList();
    }

    /**
     * Find documents by folder ID.
     */
    public List<Document> findByFolderId(String folderId) throws IOException {
        return findAll().stream().filter(d -> folderId != null && folderId.equals(d.getFolderId())).toList();
    }

    /**
     * Find documents by status.
     */
    public List<Document> findByStatus(String status) throws IOException {
        return findAll().stream()
            .filter(d -> d.getStatus() != null && status != null && d.getStatus().name().equalsIgnoreCase(status))
            .toList();
    }

    private void applyDocumentColumns(PreparedStatement ps, Document entity, Long folderId, Long approverId, Long reviewerId, Long supervisorId) throws Exception {
        ps.setString(1, entity.getCategory());
        ps.setTimestamp(2, toTimestamp(entity.getCreatedAt()));
        ps.setString(3, entity.getDescription());
        ps.setString(4, entity.getOwner());
        ps.setString(5, entity.getStatus() != null ? entity.getStatus().name() : DocumentStatus.DRAFT.name());
        ps.setString(6, entity.getTitle());
        ps.setTimestamp(7, toTimestamp(entity.getUpdatedAt()));
        if (folderId == null) {
            ps.setNull(8, java.sql.Types.BIGINT);
        } else {
            ps.setLong(8, folderId);
        }
        ps.setTimestamp(9, toTimestamp(entity.getApprovalDecidedAt()));
        ps.setTimestamp(10, toTimestamp(entity.getApprovalRequestedAt()));
        if (approverId == null) {
            ps.setNull(11, Types.BIGINT);
        } else {
            ps.setLong(11, approverId);
        }
        if (reviewerId == null) {
            ps.setNull(12, Types.BIGINT);
        } else {
            ps.setLong(12, reviewerId);
        }
        if (supervisorId == null) {
            ps.setNull(13, Types.BIGINT);
        } else {
            ps.setLong(13, supervisorId);
        }
    }

    private void ensureReviewerColumn(Connection conn) throws Exception {
        if (reviewerColumnChecked) {
            return;
        }

        synchronized (this) {
            if (reviewerColumnChecked) {
                return;
            }
            try (PreparedStatement ps = conn.prepareStatement(
                "SELECT 1 FROM information_schema.columns "
                    + "WHERE table_schema = DATABASE() AND table_name = 'documents' AND column_name = 'reviewer_id' LIMIT 1");
                 ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    try (Statement statement = conn.createStatement()) {
                        statement.execute("ALTER TABLE documents ADD COLUMN reviewer_id BIGINT NULL");
                    }
                }
            }
            reviewerColumnChecked = true;
        }
    }

    private void ensureSupervisorColumn(Connection conn) throws Exception {
        if (supervisorColumnChecked) {
            return;
        }

        synchronized (this) {
            if (supervisorColumnChecked) {
                return;
            }
            try (PreparedStatement ps = conn.prepareStatement(
                "SELECT 1 FROM information_schema.columns "
                    + "WHERE table_schema = DATABASE() AND table_name = 'documents' AND column_name = 'supervisor_id' LIMIT 1");
                 ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    try (Statement statement = conn.createStatement()) {
                        statement.execute("ALTER TABLE documents ADD COLUMN supervisor_id BIGINT NULL");
                    }
                }
            }
            supervisorColumnChecked = true;
        }
    }

    private void ensureStatusColumnSupportsRejected(Connection conn) throws Exception {
        if (statusColumnChecked) {
            return;
        }

        synchronized (this) {
            if (statusColumnChecked) {
                return;
            }

            try (PreparedStatement ps = conn.prepareStatement(
                "SELECT data_type, column_type, character_maximum_length "
                    + "FROM information_schema.columns "
                    + "WHERE table_schema = DATABASE() AND table_name = 'documents' AND column_name = 'status'");
                 ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    statusColumnChecked = true;
                    return;
                }

                String dataType = rs.getString("data_type");
                String columnType = rs.getString("column_type");
                int maxLength = rs.getInt("character_maximum_length");
                boolean hasLength = !rs.wasNull();

                if ("enum".equalsIgnoreCase(dataType)) {
                    String normalized = columnType == null ? "" : columnType.toUpperCase();
                    if (!normalized.contains("'REJECTED'")) {
                        try (Statement statement = conn.createStatement()) {
                            statement.execute(
                                "ALTER TABLE documents MODIFY COLUMN status "
                                    + "ENUM('DRAFT','ACTIVE','REJECTED','ARCHIVED') NOT NULL DEFAULT 'DRAFT'");
                        }
                    }
                } else if (("varchar".equalsIgnoreCase(dataType) || "char".equalsIgnoreCase(dataType))
                    && hasLength && maxLength < DocumentStatus.REJECTED.name().length()) {
                    try (Statement statement = conn.createStatement()) {
                        statement.execute(
                            "ALTER TABLE documents MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'DRAFT'");
                    }
                }
            }

            statusColumnChecked = true;
        }
    }

    private Timestamp toTimestamp(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }

    private Instant toInstant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
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

    private Map<String, com.dms.document.model.DocumentFolder> loadFolders(Connection conn) throws Exception {
        Map<String, com.dms.document.model.DocumentFolder> folders = new HashMap<>();
        try (PreparedStatement ps = conn.prepareStatement("SELECT id, name, parent_id FROM document_folders");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                com.dms.document.model.DocumentFolder folder = new com.dms.document.model.DocumentFolder();
                String id = String.valueOf(rs.getLong("id"));
                folder.setId(id);
                folder.setName(rs.getString("name"));
                long parentId = rs.getLong("parent_id");
                if (!rs.wasNull()) {
                    folder.setParentId(String.valueOf(parentId));
                }
                folders.put(id, folder);
            }
        }
        for (com.dms.document.model.DocumentFolder folder : folders.values()) {
            if (StringUtils.hasText(folder.getParentId())) {
                com.dms.document.model.DocumentFolder parent = folders.get(folder.getParentId());
                if (parent != null) {
                    folder.setParent(parent);
                    parent.getChildIds().add(folder.getId());
                }
            }
        }
        return folders;
    }

    private Map<String, AppUser> loadUsers(Connection conn) throws Exception {
        Map<String, AppUser> users = new HashMap<>();
        try (PreparedStatement ps = conn.prepareStatement("SELECT id, username, display_name, password, user_password, role FROM app_users");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                AppUser user = new AppUser();
                String id = String.valueOf(rs.getLong("id"));
                user.setId(id);
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
                users.put(id, user);
            }
        }

        Map<String, UserGroup> groups = new HashMap<>();
        try (PreparedStatement ps = conn.prepareStatement("SELECT id, name, description FROM user_groups");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                UserGroup group = new UserGroup();
                String id = String.valueOf(rs.getLong("id"));
                group.setId(id);
                group.setName(rs.getString("name"));
                group.setDescription(rs.getString("description"));
                groups.put(id, group);
            }
        }

        try (PreparedStatement ps = conn.prepareStatement("SELECT user_id, group_id FROM user_group_members");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                String userId = String.valueOf(rs.getLong("user_id"));
                String groupId = String.valueOf(rs.getLong("group_id"));
                AppUser user = users.get(userId);
                UserGroup group = groups.get(groupId);
                if (user != null && group != null) {
                    user.getGroupIds().add(groupId);
                    user.getGroups().add(group);
                    group.getMemberIds().add(userId);
                }
            }
        }

        return users;
    }
}
