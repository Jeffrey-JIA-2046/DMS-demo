package com.dms.ocr.repository;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;

import com.dms.ocr.model.DocumentOcrResult;
import com.dms.repository.BaseOpenSearchRepository;
import com.fasterxml.jackson.databind.ObjectMapper;

@Repository
public class DocumentOcrResultRepository extends BaseOpenSearchRepository<DocumentOcrResult> {

    @Value("${app.opensearch.ocr-documents-index:dms-ocr-document}")
    private String ocrDocumentsIndex;

    @Autowired
    public DocumentOcrResultRepository(OpenSearchClient openSearchClient, ObjectMapper objectMapper) {
        super(openSearchClient, objectMapper, DocumentOcrResult.class);
    }

    @Override
    protected String getIndexName() {
        return ocrDocumentsIndex;
    }

    public Optional<DocumentOcrResult> findByDocumentIdAndPromptAndConfidence(String documentId, String prompt, int confidence) throws IOException {
        Optional<DocumentOcrResult> keywordHit = findByFields("document_id.keyword", "prompt.keyword", documentId, prompt, "confidence", confidence);
        if (keywordHit.isPresent()) {
            return keywordHit;
        }
        return findByFields("document_id", "prompt", documentId, prompt, "confidence", confidence);
    }

    private Optional<DocumentOcrResult> findByFields(String documentField, String promptField, String documentId, String prompt, String confidenceField, int confidence) throws IOException {
        Query query = Query.of(q -> q.bool(b -> b
            .must(m1 -> m1.term(t -> t.field(documentField).value(v -> v.stringValue(documentId))))
            .must(m2 -> m2.term(t -> t.field(promptField).value(v -> v.stringValue(prompt))))
            .must(m3 -> m3.term(t -> t.field(confidenceField).value(v -> v.longValue(confidence))))));

        SearchRequest request = new SearchRequest.Builder()
            .index(getIndexName())
            .query(query)
            .size(1)
            .build();

        List<DocumentOcrResult> results = search(request);
        return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
    }
}
