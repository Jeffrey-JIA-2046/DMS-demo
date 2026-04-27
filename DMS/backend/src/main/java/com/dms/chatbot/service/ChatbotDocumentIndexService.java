package com.dms.chatbot.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.OpenSearchException;
import org.opensearch.client.opensearch._types.Refresh;
import org.opensearch.client.opensearch.core.DeleteRequest;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.dms.document.repository.DocumentRepository;

/**
 * Manages document lifecycle operations on the chatbot vector index
 * (dms-documents-chatbot). The index is primarily populated by the Python
 * embedding API; this service handles the delete side so that removing a
 * document from the DMS also removes its embedding entry.
 */
@Service
public class ChatbotDocumentIndexService {

    private static final Logger log = LoggerFactory.getLogger(ChatbotDocumentIndexService.class);
    private static final int HOUSEKEEPING_BATCH_SIZE = 500;

    private final OpenSearchClient openSearchClient;
    private final DocumentRepository documentRepository;

    @Value("${app.opensearch.chatbot-documents-index:dms-documents-chatbot}")
    private String chatbotDocumentsIndex;

    public ChatbotDocumentIndexService(OpenSearchClient openSearchClient,
                                       DocumentRepository documentRepository) {
        this.openSearchClient = openSearchClient;
        this.documentRepository = documentRepository;
    }

    /**
     * Deletes the embedding document for the given DMS document ID from the
     * chatbot index. The Python embedding API stores each document using its
     * UUID as the OpenSearch document ID, so a direct delete-by-ID is sufficient.
     *
     * <p>Errors are logged as warnings rather than thrown so that a missing
     * or already-deleted entry does not block the overall document deletion.
     */
    public void deleteDocument(String documentId) {
        if (documentId == null || documentId.isBlank()) {
            return;
        }
        try {
            DeleteRequest request = new DeleteRequest.Builder()
                .index(chatbotDocumentsIndex)
                .id(documentId)
                .refresh(Refresh.WaitFor)
                .build();
            openSearchClient.delete(request);
            log.debug("Deleted chatbot index entry for document {}", documentId);
        } catch (OpenSearchException ex) {
            // A 404 means the document was never embedded – treat as success.
            if (ex.getMessage() != null && ex.getMessage().contains("not_found")) {
                log.debug("Chatbot index entry not found for document {} (already absent)", documentId);
            } else {
                log.warn("Could not delete chatbot index entry for document {}: {}", documentId, ex.getMessage());
            }
        } catch (Exception ex) {
            log.warn("Could not delete chatbot index entry for document {}: {}", documentId, ex.getMessage());
        }
    }

    /**
     * Scans every entry in {@code dms-documents-chatbot} and removes any whose
     * document ID no longer exists in the primary {@code dms-documents} index.
     *
     * @return a summary describing how many entries were scanned and deleted.
     */
    public HousekeepingResult runHousekeeping() {
        List<String> orphanIds = new ArrayList<>();
        int scanned = 0;

        try {
            // Retrieve all chatbot index document IDs in one pass (ID only, no source).
            SearchRequest searchRequest = new SearchRequest.Builder()
                .index(chatbotDocumentsIndex)
                .source(s -> s.fetch(false))
                .size(HOUSEKEEPING_BATCH_SIZE)
                .build();

            SearchResponse<Map> response = openSearchClient.search(searchRequest, Map.class);
            List<Hit<Map>> hits = response.hits().hits();

            for (Hit<Map> hit : hits) {
                String id = hit.id();
                if (id == null || id.isBlank()) {
                    continue;
                }
                scanned++;
                try {
                    if (documentRepository.findById(id).isEmpty()) {
                        orphanIds.add(id);
                    }
                } catch (Exception ex) {
                    log.warn("Could not verify document existence for id {}: {}", id, ex.getMessage());
                }
            }

            // Delete orphans.
            int deleted = 0;
            for (String orphanId : orphanIds) {
                try {
                    DeleteRequest deleteRequest = new DeleteRequest.Builder()
                        .index(chatbotDocumentsIndex)
                        .id(orphanId)
                        .refresh(Refresh.WaitFor)
                        .build();
                    openSearchClient.delete(deleteRequest);
                    deleted++;
                    log.info("Housekeeping: removed orphaned chatbot index entry {}", orphanId);
                } catch (Exception ex) {
                    log.warn("Housekeeping: failed to delete chatbot index entry {}: {}", orphanId, ex.getMessage());
                }
            }

            log.info("Chatbot index housekeeping complete: scanned={}, deleted={}", scanned, deleted);
            return new HousekeepingResult(scanned, deleted, orphanIds);

        } catch (OpenSearchException ex) {
            if (ex.getMessage() != null && ex.getMessage().contains("index_not_found_exception")) {
                log.info("Chatbot index '{}' does not exist yet – nothing to housekeep.", chatbotDocumentsIndex);
                return new HousekeepingResult(0, 0, List.of());
            }
            throw new RuntimeException("Housekeeping failed while scanning chatbot index", ex);
        } catch (Exception ex) {
            throw new RuntimeException("Housekeeping failed while scanning chatbot index", ex);
        }
    }

    public record HousekeepingResult(int scanned, int deleted, List<String> deletedIds) {}
}
