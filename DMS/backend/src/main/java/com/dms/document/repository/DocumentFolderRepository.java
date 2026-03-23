package com.dms.document.repository;

import java.io.IOException;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;

import com.dms.document.model.DocumentFolder;
import com.dms.repository.BaseOpenSearchRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opensearch.client.opensearch.OpenSearchClient;

@Repository
public class DocumentFolderRepository extends BaseOpenSearchRepository<DocumentFolder> {

    @Value("${app.opensearch.folders-index:dms-document-folders}")
    private String foldersIndex;

    @Autowired
    public DocumentFolderRepository(OpenSearchClient openSearchClient, ObjectMapper objectMapper) {
        super(openSearchClient, objectMapper, DocumentFolder.class);
    }

    @Override
    protected String getIndexName() {
        return foldersIndex;
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
