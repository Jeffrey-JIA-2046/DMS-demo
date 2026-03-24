package com.dms.document.repository;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import javax.sql.DataSource;

import com.dms.document.model.DocumentVersion;
import com.dms.repository.BaseOpenSearchRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opensearch.client.opensearch.OpenSearchClient;

@Repository
public class DocumentVersionRepository extends BaseOpenSearchRepository<DocumentVersion> {

    @org.springframework.beans.factory.annotation.Value("${app.opensearch.enabled:false}")
    private boolean openSearchEnabled;

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
        if (openSearchEnabled || dataSource == null) {
            return super.findAll();
        }
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT id, document_id, version_number, file_name, content_type, size_bytes, content, created_at FROM document_versions");
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
        if (openSearchEnabled || dataSource == null) {
            return super.findById(id);
        }
        Long numericId = parseLong(id);
        if (numericId == null) {
            return Optional.empty();
        }
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT id, document_id, version_number, file_name, content_type, size_bytes, content, created_at FROM document_versions WHERE id = ?")) {
            ps.setLong(1, numericId);
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
        if (openSearchEnabled || dataSource == null) {
            return super.save(entity);
        }
        Long docId = parseLong(entity.getDocumentId());
        if (docId == null && entity.getDocument() != null) {
            docId = parseLong(entity.getDocument().getId());
        }
        if (docId == null) {
            throw new IOException("Cannot save document version without a numeric document ID");
        }

        try (Connection conn = dataSource.getConnection()) {
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
            return entity;
        } catch (Exception ex) {
            throw new IOException("Failed to save document version into MySQL", ex);
        }
    }

    /**
     * Find all versions for a document.
     */
    public List<DocumentVersion> findByDocumentId(String documentId) throws IOException {
        if (!openSearchEnabled && dataSource != null) {
            Long numericDocumentId = parseLong(documentId);
            if (numericDocumentId == null) {
                return List.of();
            }
            try (Connection conn = dataSource.getConnection();
                 PreparedStatement ps = conn.prepareStatement(
                     "SELECT id, document_id, version_number, file_name, content_type, size_bytes, content, created_at FROM document_versions WHERE document_id = ? ORDER BY version_number DESC")) {
                ps.setLong(1, numericDocumentId);
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
        if (!openSearchEnabled && dataSource != null) {
            Long numericId = parseLong(id);
            Long numericDocumentId = parseLong(documentId);
            if (numericId == null || numericDocumentId == null) {
                return Optional.empty();
            }
            try (Connection conn = dataSource.getConnection();
                 PreparedStatement ps = conn.prepareStatement(
                     "SELECT id, document_id, version_number, file_name, content_type, size_bytes, content, created_at FROM document_versions WHERE id = ? AND document_id = ?")) {
                ps.setLong(1, numericId);
                ps.setLong(2, numericDocumentId);
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
        if (!openSearchEnabled && dataSource != null) {
            List<DocumentVersion> versions = findByDocumentId(documentId);
            return versions.stream().max(Comparator.comparingInt(DocumentVersion::getVersionNumber));
        }
        return findAll().stream()
            .filter(v -> documentId.equals(v.getDocumentId()))
            .max(Comparator.comparingInt(DocumentVersion::getVersionNumber));
    }

    private DocumentVersion mapVersion(ResultSet rs) throws Exception {
        DocumentVersion version = new DocumentVersion();
        version.setId(String.valueOf(rs.getLong("id")));
        version.setDocumentId(String.valueOf(rs.getLong("document_id")));
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
}
