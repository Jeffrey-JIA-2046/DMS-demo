package com.dms.document.repository;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import javax.sql.DataSource;

import com.dms.document.model.DocumentVersion;
import com.dms.repository.BaseOpenSearchRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opensearch.client.opensearch.OpenSearchClient;

@Repository
public class DocumentVersionRepository extends BaseOpenSearchRepository<DocumentVersion> {

    @Value("${app.opensearch.enabled:false}")
    private boolean openSearchEnabled;

    @Value("${app.opensearch.versions-store-mysql:true}")
    private boolean openSearchVersionsStoreMysql;

    @Autowired(required = false)
    private DataSource dataSource;

    @Autowired
    public DocumentVersionRepository(OpenSearchClient openSearchClient, ObjectMapper objectMapper) {
        super(openSearchClient, objectMapper, DocumentVersion.class);
    }

    @Override
    protected String getIndexName() {
        return "document-versions";
    }

    @Override
    public List<DocumentVersion> findAll() throws IOException {
        if (!useMysqlStorage()) {
            return super.findAll();
        }
        ensureOpenSearchVersionColumnsIfNeeded();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT id, os_version_id, document_id, os_document_id, version_number, file_name, content_type, size_bytes, content, created_at FROM document_versions");
             ResultSet rs = ps.executeQuery()) {
            List<DocumentVersion> versions = new java.util.ArrayList<>();
            while (rs.next()) {
                versions.add(mapVersion(rs));
            }
            return versions;
        } catch (Exception ex) {
            throw new IOException("Failed to read document versions from MySQL", ex);
        }
    }

    @Override
    public Optional<DocumentVersion> findById(String id) throws IOException {
        if (!useMysqlStorage()) {
            return super.findById(id);
        }

        ensureOpenSearchVersionColumnsIfNeeded();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = openSearchEnabled && openSearchVersionsStoreMysql
                 ? conn.prepareStatement("SELECT id, os_version_id, document_id, os_document_id, version_number, file_name, content_type, size_bytes, content, created_at FROM document_versions WHERE os_version_id = ?")
                 : conn.prepareStatement("SELECT id, os_version_id, document_id, os_document_id, version_number, file_name, content_type, size_bytes, content, created_at FROM document_versions WHERE id = ?")) {
            if (openSearchEnabled && openSearchVersionsStoreMysql) {
                ps.setString(1, id);
            } else {
                Long numericId = parseLong(id);
                if (numericId == null) {
                    return Optional.empty();
                }
                ps.setLong(1, numericId);
            }
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(mapVersion(rs));
                }
            }
            return Optional.empty();
        } catch (Exception ex) {
            throw new IOException("Failed to read document version from MySQL", ex);
        }
    }

    @Override
    public DocumentVersion save(DocumentVersion entity) throws IOException {
        if (!useMysqlStorage()) {
            return super.save(entity);
        }

        ensureOpenSearchVersionColumnsIfNeeded();

        try (Connection conn = dataSource.getConnection()) {
            if (openSearchEnabled && openSearchVersionsStoreMysql) {
                String osDocumentId = entity.getDocumentId();
                if (!StringUtils.hasText(osDocumentId) && entity.getDocument() != null) {
                    osDocumentId = entity.getDocument().getId();
                }
                if (!StringUtils.hasText(osDocumentId)) {
                    throw new IOException("Cannot save OpenSearch document version without document ID");
                }

                String osVersionId = entity.getId();
                if (!StringUtils.hasText(osVersionId)) {
                    throw new IOException("Cannot save OpenSearch document version without version ID");
                }

                Long existingNumericId = null;
                try (PreparedStatement check = conn.prepareStatement(
                    "SELECT id FROM document_versions WHERE os_version_id = ?")) {
                    check.setString(1, osVersionId);
                    try (ResultSet rs = check.executeQuery()) {
                        if (rs.next()) {
                            existingNumericId = rs.getLong("id");
                        }
                    }
                }

                if (existingNumericId == null) {
                    try (PreparedStatement ps = conn.prepareStatement(
                        "INSERT INTO document_versions(content, content_type, created_at, file_name, size_bytes, version_number, document_id, os_document_id, os_version_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        Statement.RETURN_GENERATED_KEYS)) {
                        ps.setBytes(1, entity.getContent());
                        ps.setString(2, entity.getContentType());
                        ps.setTimestamp(3, toTimestamp(entity.getCreatedAt()));
                        ps.setString(4, entity.getFileName());
                        ps.setLong(5, entity.getSizeBytes());
                        ps.setInt(6, entity.getVersionNumber());
                        ps.setNull(7, java.sql.Types.BIGINT);
                        ps.setString(8, osDocumentId);
                        ps.setString(9, osVersionId);
                        ps.executeUpdate();
                    }
                } else {
                    try (PreparedStatement ps = conn.prepareStatement(
                        "UPDATE document_versions SET content=?, content_type=?, created_at=?, file_name=?, size_bytes=?, version_number=?, os_document_id=? WHERE os_version_id=?")) {
                        ps.setBytes(1, entity.getContent());
                        ps.setString(2, entity.getContentType());
                        ps.setTimestamp(3, toTimestamp(entity.getCreatedAt()));
                        ps.setString(4, entity.getFileName());
                        ps.setLong(5, entity.getSizeBytes());
                        ps.setInt(6, entity.getVersionNumber());
                        ps.setString(7, osDocumentId);
                        ps.setString(8, osVersionId);
                        ps.executeUpdate();
                    }
                }
                entity.setDocumentId(osDocumentId);
            } else {
                Long docId = parseLong(entity.getDocumentId());
                if (docId == null && entity.getDocument() != null) {
                    docId = parseLong(entity.getDocument().getId());
                }
                if (docId == null) {
                    throw new IOException("Cannot save document version without a numeric document ID");
                }

                Long id = parseLong(entity.getId());
                if (id == null) {
                    try (PreparedStatement ps = conn.prepareStatement(
                        "INSERT INTO document_versions(content, content_type, created_at, file_name, size_bytes, version_number, document_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        Statement.RETURN_GENERATED_KEYS)) {
                        ps.setBytes(1, entity.getContent());
                        ps.setString(2, entity.getContentType());
                        ps.setTimestamp(3, toTimestamp(entity.getCreatedAt()));
                        ps.setString(4, entity.getFileName());
                        ps.setLong(5, entity.getSizeBytes());
                        ps.setInt(6, entity.getVersionNumber());
                        ps.setLong(7, docId);
                        ps.executeUpdate();
                        try (ResultSet keys = ps.getGeneratedKeys()) {
                            if (keys.next()) {
                                entity.setId(String.valueOf(keys.getLong(1)));
                            }
                        }
                    }
                } else {
                    try (PreparedStatement ps = conn.prepareStatement(
                        "UPDATE document_versions SET content=?, content_type=?, created_at=?, file_name=?, size_bytes=?, version_number=?, document_id=? WHERE id=?")) {
                        ps.setBytes(1, entity.getContent());
                        ps.setString(2, entity.getContentType());
                        ps.setTimestamp(3, toTimestamp(entity.getCreatedAt()));
                        ps.setString(4, entity.getFileName());
                        ps.setLong(5, entity.getSizeBytes());
                        ps.setInt(6, entity.getVersionNumber());
                        ps.setLong(7, docId);
                        ps.setLong(8, id);
                        ps.executeUpdate();
                    }
                }
                entity.setDocumentId(String.valueOf(docId));
            }
            return entity;
        } catch (Exception ex) {
            throw new IOException("Failed to save document version into MySQL", ex);
        }
    }

    /**
     * Find all versions for a document.
     */
    public List<DocumentVersion> findByDocumentId(String documentId) throws IOException {
        if (useMysqlStorage()) {
            ensureOpenSearchVersionColumnsIfNeeded();
            try (Connection conn = dataSource.getConnection();
                 PreparedStatement ps = openSearchEnabled && openSearchVersionsStoreMysql
                     ? conn.prepareStatement("SELECT id, os_version_id, document_id, os_document_id, version_number, file_name, content_type, size_bytes, content, created_at FROM document_versions WHERE os_document_id = ? ORDER BY version_number DESC")
                     : conn.prepareStatement("SELECT id, os_version_id, document_id, os_document_id, version_number, file_name, content_type, size_bytes, content, created_at FROM document_versions WHERE document_id = ? ORDER BY version_number DESC")) {
                if (openSearchEnabled && openSearchVersionsStoreMysql) {
                    ps.setString(1, documentId);
                } else {
                    Long numericDocumentId = parseLong(documentId);
                    if (numericDocumentId == null) {
                        return List.of();
                    }
                    ps.setLong(1, numericDocumentId);
                }
                try (ResultSet rs = ps.executeQuery()) {
                    List<DocumentVersion> versions = new java.util.ArrayList<>();
                    while (rs.next()) {
                        versions.add(mapVersion(rs));
                    }
                    return versions;
                }
            } catch (Exception ex) {
                throw new IOException("Failed to find document versions from MySQL", ex);
            }
        }
        return findAll().stream().filter(v -> documentId.equals(v.getDocumentId())).toList();
    }

    /**
     * Find a specific version by ID and document ID.
     */
    public Optional<DocumentVersion> findByIdAndDocumentId(String id, String documentId) throws IOException {
        if (useMysqlStorage()) {
            ensureOpenSearchVersionColumnsIfNeeded();
            try (Connection conn = dataSource.getConnection();
                 PreparedStatement ps = openSearchEnabled && openSearchVersionsStoreMysql
                     ? conn.prepareStatement("SELECT id, os_version_id, document_id, os_document_id, version_number, file_name, content_type, size_bytes, content, created_at FROM document_versions WHERE os_version_id = ? AND os_document_id = ?")
                     : conn.prepareStatement("SELECT id, os_version_id, document_id, os_document_id, version_number, file_name, content_type, size_bytes, content, created_at FROM document_versions WHERE id = ? AND document_id = ?")) {
                if (openSearchEnabled && openSearchVersionsStoreMysql) {
                    ps.setString(1, id);
                    ps.setString(2, documentId);
                } else {
                    Long numericId = parseLong(id);
                    Long numericDocumentId = parseLong(documentId);
                    if (numericId == null || numericDocumentId == null) {
                        return Optional.empty();
                    }
                    ps.setLong(1, numericId);
                    ps.setLong(2, numericDocumentId);
                }
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        return Optional.of(mapVersion(rs));
                    }
                    return Optional.empty();
                }
            } catch (Exception ex) {
                throw new IOException("Failed to find document version from MySQL", ex);
            }
        }
        return findAll().stream()
            .filter(v -> id.equals(v.getId()) && documentId.equals(v.getDocumentId()))
            .findFirst();
    }

    /**
     * Find the latest version for a document by version number.
     */
    public Optional<DocumentVersion> findFirstByDocumentIdOrderByVersionNumberDesc(String documentId) throws IOException {
        if (useMysqlStorage()) {
            List<DocumentVersion> versions = findByDocumentId(documentId);
            return versions.stream().max(Comparator.comparingInt(DocumentVersion::getVersionNumber));
        }
        return findAll().stream()
            .filter(v -> documentId.equals(v.getDocumentId()))
            .max(Comparator.comparingInt(DocumentVersion::getVersionNumber));
    }

    public VersionStorageHealth getStorageHealth() throws IOException {
        if (dataSource == null) {
            return new VersionStorageHealth(0, 0, 0, 0);
        }
        ensureOpenSearchVersionColumnsIfNeeded();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT COUNT(*) AS total_rows, "
                     + "SUM(CASE WHEN os_document_id IS NOT NULL THEN 1 ELSE 0 END) AS os_mapped_rows, "
                     + "SUM(CASE WHEN os_document_id IS NULL THEN 1 ELSE 0 END) AS legacy_rows, "
                     + "SUM(CASE WHEN os_document_id IS NOT NULL AND (os_version_id IS NULL OR os_version_id = '') THEN 1 ELSE 0 END) AS missing_version_id_rows "
                     + "FROM document_versions");
             ResultSet rs = ps.executeQuery()) {
            if (!rs.next()) {
                return new VersionStorageHealth(0, 0, 0, 0);
            }
            return new VersionStorageHealth(
                rs.getLong("total_rows"),
                rs.getLong("os_mapped_rows"),
                rs.getLong("legacy_rows"),
                rs.getLong("missing_version_id_rows")
            );
        } catch (Exception ex) {
            throw new IOException("Failed to read version storage health", ex);
        }
    }

    public List<String> findDistinctOsDocumentIds() throws IOException {
        if (dataSource == null) {
            return List.of();
        }
        ensureOpenSearchVersionColumnsIfNeeded();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT DISTINCT os_document_id FROM document_versions WHERE os_document_id IS NOT NULL AND os_document_id <> ''");
             ResultSet rs = ps.executeQuery()) {
            List<String> ids = new ArrayList<>();
            while (rs.next()) {
                ids.add(rs.getString("os_document_id"));
            }
            return ids;
        } catch (Exception ex) {
            throw new IOException("Failed to read OpenSearch document IDs from version storage", ex);
        }
    }

    public int deleteByOsDocumentId(String osDocumentId) throws IOException {
        if (dataSource == null || !StringUtils.hasText(osDocumentId)) {
            return 0;
        }
        ensureOpenSearchVersionColumnsIfNeeded();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "DELETE FROM document_versions WHERE os_document_id = ?")) {
            ps.setString(1, osDocumentId);
            return ps.executeUpdate();
        } catch (Exception ex) {
            throw new IOException("Failed to delete OpenSearch-mapped version rows", ex);
        }
    }

    private DocumentVersion mapVersion(ResultSet rs) throws Exception {
        DocumentVersion version = new DocumentVersion();
        String openSearchVersionId = readNullableString(rs, "os_version_id");
        if (StringUtils.hasText(openSearchVersionId)) {
            version.setId(openSearchVersionId);
        } else {
            version.setId(String.valueOf(rs.getLong("id")));
        }
        String openSearchDocumentId = readNullableString(rs, "os_document_id");
        if (StringUtils.hasText(openSearchDocumentId)) {
            version.setDocumentId(openSearchDocumentId);
        } else {
            version.setDocumentId(String.valueOf(rs.getLong("document_id")));
        }
        version.setVersionNumber(rs.getInt("version_number"));
        version.setFileName(rs.getString("file_name"));
        version.setContentType(rs.getString("content_type"));
        version.setSizeBytes(rs.getLong("size_bytes"));
        version.setContent(rs.getBytes("content"));
        Timestamp createdAt = rs.getTimestamp("created_at");
        version.setCreatedAt(createdAt == null ? null : createdAt.toInstant());
        return version;
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

    private boolean useMysqlStorage() {
        return dataSource != null && (!openSearchEnabled || openSearchVersionsStoreMysql);
    }

    private void ensureOpenSearchVersionColumnsIfNeeded() throws IOException {
        if (!(openSearchEnabled && openSearchVersionsStoreMysql) || dataSource == null) {
            return;
        }
        try (Connection conn = dataSource.getConnection()) {
            ensureColumnExists(conn, "os_document_id", "ALTER TABLE document_versions ADD COLUMN os_document_id VARCHAR(64) NULL");
            ensureColumnExists(conn, "os_version_id", "ALTER TABLE document_versions ADD COLUMN os_version_id VARCHAR(64) NULL");
            ensureIndexExists(conn, "idx_document_versions_os_document_id", "CREATE INDEX idx_document_versions_os_document_id ON document_versions(os_document_id)");
            ensureIndexExists(conn, "uk_document_versions_os_version_id", "CREATE UNIQUE INDEX uk_document_versions_os_version_id ON document_versions(os_version_id)");
        } catch (Exception ex) {
            throw new IOException("Failed to ensure OpenSearch version columns", ex);
        }
    }

    private void ensureColumnExists(Connection conn, String columnName, String ddl) throws Exception {
        try (PreparedStatement ps = conn.prepareStatement(
            "SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'document_versions' AND column_name = ? LIMIT 1")) {
            ps.setString(1, columnName);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    try (Statement statement = conn.createStatement()) {
                        statement.execute(ddl);
                    }
                }
            }
        }
    }

    private void ensureIndexExists(Connection conn, String indexName, String ddl) throws Exception {
        try (PreparedStatement ps = conn.prepareStatement(
            "SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'document_versions' AND index_name = ? LIMIT 1")) {
            ps.setString(1, indexName);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    try (Statement statement = conn.createStatement()) {
                        statement.execute(ddl);
                    }
                }
            }
        }
    }

    private String readNullableString(ResultSet rs, String columnName) {
        try {
            return rs.getString(columnName);
        } catch (Exception ex) {
            return null;
        }
    }

    public record VersionStorageHealth(
        long totalRows,
        long osMappedRows,
        long legacyRows,
        long missingVersionIdRows
    ) {
    }
}
