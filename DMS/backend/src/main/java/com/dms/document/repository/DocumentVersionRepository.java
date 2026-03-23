package com.dms.document.repository;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

import com.dms.document.model.DocumentVersion;
import com.dms.repository.BaseOpenSearchRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opensearch.client.opensearch.OpenSearchClient;

@Repository
public class DocumentVersionRepository extends BaseOpenSearchRepository<DocumentVersion> {

    @Autowired
    public DocumentVersionRepository(OpenSearchClient openSearchClient, ObjectMapper objectMapper) {
        super(openSearchClient, objectMapper, DocumentVersion.class);
    }

    @Override
    protected String getIndexName() {
        return "document-versions";
    }

    /**
     * Find all versions for a document.
     */
    public List<DocumentVersion> findByDocumentId(String documentId) throws IOException {
        // TODO: Implement with proper filtering
        return findAll().stream()
            .filter(v -> documentId.equals(v.getDocumentId()))
            .toList();
    }

    /**
     * Find a specific version by ID and document ID.
     */
    public Optional<DocumentVersion> findByIdAndDocumentId(String id, String documentId) throws IOException {
        return findAll().stream()
            .filter(v -> id.equals(v.getId()) && documentId.equals(v.getDocumentId()))
            .findFirst();
    }

    /**
     * Find the latest version for a document by version number.
     */
    public Optional<DocumentVersion> findFirstByDocumentIdOrderByVersionNumberDesc(String documentId) throws IOException {
        return findAll().stream()
            .filter(v -> documentId.equals(v.getDocumentId()))
            .max(Comparator.comparingInt(DocumentVersion::getVersionNumber));
    }
}
