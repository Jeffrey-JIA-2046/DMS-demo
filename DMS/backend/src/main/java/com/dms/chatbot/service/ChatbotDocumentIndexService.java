package com.dms.chatbot.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.OpenSearchException;
import org.opensearch.client.opensearch._types.Refresh;
import org.opensearch.client.opensearch.core.DeleteRequest;
import org.opensearch.client.opensearch.core.DeleteByQueryRequest;
import org.opensearch.client.opensearch.core.GetResponse;
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

    @Value("${app.opensearch.chatbot-chunks-index:dms-documents-chatbot-chunks}")
    private String chatbotChunksIndex;

    @Value("${app.opensearch.chatbot-chunks-title-embedding-index:dms-documents-chatbot-chunks-a}")
    private String chatbotChunksTitleEmbeddingIndex;

    @Value("${app.opensearch.chatbot-title-vector-field:chatbot_title_embedding}")
    private String chatbotTitleVectorField;

    @Value("${app.opensearch.chatbot-content-vector-field:chatbot_ocr_content_embedding}")
    private String chatbotContentVectorField;

    @Value("${app.opensearch.chatbot-content-field:ocr_content}")
    private String chatbotContentField;

    @Value("${app.opensearch.chatbot-chunk-title-vector-field:title_embedding}")
    private String chatbotChunkTitleVectorField;

    @Value("${app.opensearch.chatbot-chunk-content-vector-field:chatbot_ocr_content_embedding}")
    private String chatbotChunkContentVectorField;

    @Value("${app.opensearch.chatbot-chunk-content-field:ocr_content}")
    private String chatbotChunkContentField;

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

        try {
            DeleteByQueryRequest chunkDeleteRequest = new DeleteByQueryRequest.Builder()
                .index(chatbotChunksIndex)
                .query(q -> q.term(t -> t.field("document_id").value(v -> v.stringValue(documentId))))
                .refresh(true)
                .build();
            openSearchClient.deleteByQuery(chunkDeleteRequest);
            log.debug("Deleted chatbot chunk index entries for document {}", documentId);
        } catch (OpenSearchException ex) {
            if (ex.getMessage() != null && ex.getMessage().contains("index_not_found_exception")) {
                log.debug("Chatbot chunk index '{}' not found while deleting {}", chatbotChunksIndex, documentId);
            } else {
                log.warn("Could not delete chatbot chunk index entries for document {}: {}", documentId, ex.getMessage());
            }
        } catch (Exception ex) {
            log.warn("Could not delete chatbot chunk index entries for document {}: {}", documentId, ex.getMessage());
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

            // Also cleanup chunk index by document_id to keep behavior aligned with main chatbot index.
            ChunkHousekeepingResult chunkResult = runChunkHousekeeping();

            return new HousekeepingResult(scanned, deleted, orphanIds, chunkResult.scanned(), chunkResult.deleted());

        } catch (OpenSearchException ex) {
            if (ex.getMessage() != null && ex.getMessage().contains("index_not_found_exception")) {
                log.info("Chatbot index '{}' does not exist yet – nothing to housekeep.", chatbotDocumentsIndex);
                return new HousekeepingResult(0, 0, List.of(), 0, 0);
            }
            throw new RuntimeException("Housekeeping failed while scanning chatbot index", ex);
        } catch (Exception ex) {
            throw new RuntimeException("Housekeeping failed while scanning chatbot index", ex);
        }
    }

    private ChunkHousekeepingResult runChunkHousekeeping() {
        int scannedChunks = 0;
        int deletedChunks = 0;

        try {
            SearchRequest chunkSearchRequest = new SearchRequest.Builder()
                .index(chatbotChunksIndex)
                .source(s -> s.filter(f -> f.includes("document_id")))
                .size(HOUSEKEEPING_BATCH_SIZE)
                .build();

            SearchResponse<Map> response = openSearchClient.search(chunkSearchRequest, Map.class);
            List<Hit<Map>> hits = response.hits().hits();

            for (Hit<Map> hit : hits) {
                Map source = hit.source();
                if (source == null) {
                    continue;
                }
                Object docIdObj = source.get("document_id");
                String documentId = docIdObj != null ? String.valueOf(docIdObj) : null;
                if (documentId == null || documentId.isBlank()) {
                    continue;
                }

                scannedChunks++;
                try {
                    if (documentRepository.findById(documentId).isEmpty()) {
                        DeleteRequest deleteRequest = new DeleteRequest.Builder()
                            .index(chatbotChunksIndex)
                            .id(hit.id())
                            .refresh(Refresh.WaitFor)
                            .build();
                        openSearchClient.delete(deleteRequest);
                        deletedChunks++;
                    }
                } catch (Exception ex) {
                    log.warn("Chunk housekeeping: failed while processing chunk {}: {}", hit.id(), ex.getMessage());
                }
            }

            log.info("Chatbot chunk index housekeeping complete: scanned={}, deleted={}", scannedChunks, deletedChunks);
            return new ChunkHousekeepingResult(scannedChunks, deletedChunks);
        } catch (OpenSearchException ex) {
            if (ex.getMessage() != null && ex.getMessage().contains("index_not_found_exception")) {
                log.info("Chatbot chunk index '{}' does not exist yet – nothing to housekeep.", chatbotChunksIndex);
                return new ChunkHousekeepingResult(0, 0);
            }
            log.warn("Chunk housekeeping failed: {}", ex.getMessage());
            return new ChunkHousekeepingResult(scannedChunks, deletedChunks);
        } catch (Exception ex) {
            log.warn("Chunk housekeeping failed: {}", ex.getMessage());
            return new ChunkHousekeepingResult(scannedChunks, deletedChunks);
        }
    }

    private record ChunkHousekeepingResult(int scanned, int deleted) {}

    public record HousekeepingResult(int scanned, int deleted, List<String> deletedIds, int chunkScanned, int chunkDeleted) {}

    public ChunkVectorBackfillResult runChunkTitleEmbeddingBackfill(boolean dryRun) {
        int scanned = 0;
        int missingTitleEmbedding = 0;
        int missingContentEmbedding = 0;
        int updatedTitleEmbedding = 0;
        int updatedContentEmbedding = 0;
        int failed = 0;
        List<String> updatedChunkIds = new ArrayList<>();
        Map<String, DocumentVectors> documentVectorCache = new HashMap<>();

        try {
            int from = 0;
            while (true) {
                SearchRequest request = new SearchRequest.Builder()
                    .index(chatbotChunksTitleEmbeddingIndex)
                    .from(from)
                    .size(HOUSEKEEPING_BATCH_SIZE)
                    .query(q -> q.bool(b -> b
                        .must(m -> m.exists(e -> e.field("document_id")))
                        .should(s -> s.bool(sb -> sb.mustNot(mn -> mn.exists(e -> e.field(chatbotChunkTitleVectorField)))))
                        .should(s -> s.bool(sb -> sb.mustNot(mn -> mn.exists(e -> e.field(chatbotChunkContentVectorField)))))
                        .minimumShouldMatch("1")))
                    .build();

                SearchResponse<Map> response = openSearchClient.search(request, Map.class);
                List<Hit<Map>> hits = response.hits().hits();
                if (hits == null || hits.isEmpty()) {
                    break;
                }

                for (Hit<Map> hit : hits) {
                    scanned++;
                    String chunkId = hit.id();
                    Map source = hit.source();
                    if (source == null) {
                        failed++;
                        continue;
                    }
                    Object documentIdObj = source.get("document_id");
                    String documentId = documentIdObj != null ? String.valueOf(documentIdObj) : null;
                    if (documentId == null || documentId.isBlank()) {
                        failed++;
                        continue;
                    }

                    try {
                        DocumentVectors vectors = documentVectorCache.get(documentId);
                        if (vectors == null) {
                            vectors = resolveDocumentVectors(documentId);
                            documentVectorCache.put(documentId, vectors);
                        }

                        boolean hasTitleEmbedding = vectors.titleEmbedding() != null && !vectors.titleEmbedding().isEmpty();
                        boolean hasContentEmbedding = vectors.contentEmbedding() != null && !vectors.contentEmbedding().isEmpty();
                        if (!hasTitleEmbedding) {
                            missingTitleEmbedding++;
                        }
                        if (!hasContentEmbedding) {
                            missingContentEmbedding++;
                        }
                        if (!hasTitleEmbedding && !hasContentEmbedding) {
                            continue;
                        }

                        boolean writeTitle = !hasField(source, chatbotChunkTitleVectorField) && hasTitleEmbedding;
                        boolean writeContent = !hasField(source, chatbotChunkContentVectorField) && hasContentEmbedding;
                        if (!writeTitle && !writeContent) {
                            continue;
                        }

                        if (!dryRun) {
                            Map<String, Object> patch = new HashMap<>();
                            if (writeTitle) {
                                patch.put(chatbotChunkTitleVectorField, vectors.titleEmbedding());
                            }
                            if (writeContent) {
                                patch.put(chatbotChunkContentVectorField, vectors.contentEmbedding());
                            }
                            openSearchClient.update(u -> u
                                    .index(chatbotChunksTitleEmbeddingIndex)
                                    .id(chunkId)
                                    .doc(patch)
                                    .refresh(Refresh.True),
                                Map.class);
                        }

                        if (writeTitle) {
                            updatedTitleEmbedding++;
                        }
                        if (writeContent) {
                            updatedContentEmbedding++;
                        }
                        updatedChunkIds.add(chunkId);
                    } catch (Exception ex) {
                        failed++;
                        log.warn("Chunk vector backfill failed for chunk {}: {}", chunkId, ex.getMessage());
                    }
                }

                if (hits.size() < HOUSEKEEPING_BATCH_SIZE) {
                    break;
                }
                from += HOUSEKEEPING_BATCH_SIZE;
            }

            return new ChunkVectorBackfillResult(
                chatbotChunksTitleEmbeddingIndex,
                dryRun,
                scanned,
                missingTitleEmbedding,
                missingContentEmbedding,
                updatedTitleEmbedding,
                updatedContentEmbedding,
                failed,
                updatedChunkIds
            );
        } catch (OpenSearchException ex) {
            if (ex.getMessage() != null && ex.getMessage().contains("index_not_found_exception")) {
                return new ChunkVectorBackfillResult(
                    chatbotChunksTitleEmbeddingIndex,
                    dryRun,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    List.of()
                );
            }
            throw new RuntimeException("Chunk vector backfill failed", ex);
        } catch (Exception ex) {
            throw new RuntimeException("Chunk vector backfill failed", ex);
        }
    }

    public ChunkOcrContentBackfillResult runChunkOcrContentBackfill(boolean dryRun) {
        int scanned = 0;
        int missingDocumentContent = 0;
        int updated = 0;
        int failed = 0;
        List<String> updatedChunkIds = new ArrayList<>();
        Map<String, String> contentCache = new HashMap<>();

        try {
            int from = 0;
            while (true) {
                SearchRequest request = new SearchRequest.Builder()
                    .index(chatbotChunksTitleEmbeddingIndex)
                    .from(from)
                    .size(HOUSEKEEPING_BATCH_SIZE)
                    .query(q -> q.bool(b -> b
                        .must(m -> m.exists(e -> e.field("document_id")))
                        .mustNot(mn -> mn.exists(e -> e.field(chatbotChunkContentField)))))
                    .build();

                SearchResponse<Map> response = openSearchClient.search(request, Map.class);
                List<Hit<Map>> hits = response.hits().hits();
                if (hits == null || hits.isEmpty()) {
                    break;
                }

                for (Hit<Map> hit : hits) {
                    scanned++;
                    String chunkId = hit.id();
                    Map source = hit.source();
                    if (source == null) {
                        failed++;
                        continue;
                    }

                    Object documentIdObj = source.get("document_id");
                    String documentId = documentIdObj != null ? String.valueOf(documentIdObj) : null;
                    if (documentId == null || documentId.isBlank()) {
                        failed++;
                        continue;
                    }

                    try {
                        String content = contentCache.get(documentId);
                        if (content == null) {
                            content = resolveDocumentContent(documentId);
                            if (content != null && !content.isBlank()) {
                                contentCache.put(documentId, content);
                            }
                        }

                        if (content == null || content.isBlank()) {
                            missingDocumentContent++;
                            continue;
                        }

                        if (!dryRun) {
                            Map<String, Object> patch = new HashMap<>();
                            patch.put(chatbotChunkContentField, content);
                            openSearchClient.update(u -> u
                                    .index(chatbotChunksTitleEmbeddingIndex)
                                    .id(chunkId)
                                    .doc(patch)
                                    .refresh(Refresh.True),
                                Map.class);
                        }

                        updated++;
                        updatedChunkIds.add(chunkId);
                    } catch (Exception ex) {
                        failed++;
                        log.warn("Chunk ocr_content backfill failed for chunk {}: {}", chunkId, ex.getMessage());
                    }
                }

                if (hits.size() < HOUSEKEEPING_BATCH_SIZE) {
                    break;
                }
                from += HOUSEKEEPING_BATCH_SIZE;
            }

            return new ChunkOcrContentBackfillResult(
                chatbotChunksTitleEmbeddingIndex,
                dryRun,
                scanned,
                missingDocumentContent,
                updated,
                failed,
                updatedChunkIds
            );
        } catch (OpenSearchException ex) {
            if (ex.getMessage() != null && ex.getMessage().contains("index_not_found_exception")) {
                return new ChunkOcrContentBackfillResult(
                    chatbotChunksTitleEmbeddingIndex,
                    dryRun,
                    0,
                    0,
                    0,
                    0,
                    List.of()
                );
            }
            throw new RuntimeException("Chunk ocr_content backfill failed", ex);
        } catch (Exception ex) {
            throw new RuntimeException("Chunk ocr_content backfill failed", ex);
        }
    }

    private DocumentVectors resolveDocumentVectors(String documentId) {
        try {
            GetResponse<Map> response = openSearchClient.get(g -> g
                    .index(chatbotDocumentsIndex)
                    .id(documentId),
                Map.class);
            if (response == null || !response.found()) {
                return new DocumentVectors(null, null);
            }

            Map source = response.source();
            if (source == null) {
                return new DocumentVectors(null, null);
            }

            List<Double> titleVector = readVector(source, chatbotTitleVectorField);
            List<Double> contentVector = readVector(source, chatbotContentVectorField);
            return new DocumentVectors(titleVector, contentVector);
        } catch (OpenSearchException ex) {
            if (ex.getMessage() != null && ex.getMessage().contains("not_found")) {
                return new DocumentVectors(null, null);
            }
            throw ex;
        } catch (Exception ex) {
            throw new RuntimeException("Failed to resolve vectors for document " + documentId, ex);
        }
    }

    private boolean hasField(Map source, String field) {
        if (source == null || field == null || field.isBlank()) {
            return false;
        }
        return source.containsKey(field);
    }

    private String resolveDocumentContent(String documentId) {
        try {
            GetResponse<Map> response = openSearchClient.get(g -> g
                    .index(chatbotDocumentsIndex)
                    .id(documentId),
                Map.class);
            if (response == null || !response.found()) {
                return null;
            }

            Map source = response.source();
            if (source == null) {
                return null;
            }

            Object contentObj = source.get(chatbotContentField);
            if (contentObj == null) {
                return null;
            }
            String content = String.valueOf(contentObj);
            return content.isBlank() ? null : content;
        } catch (OpenSearchException ex) {
            if (ex.getMessage() != null && ex.getMessage().contains("not_found")) {
                return null;
            }
            throw ex;
        } catch (Exception ex) {
            throw new RuntimeException("Failed to resolve content for document " + documentId, ex);
        }
    }

    @SuppressWarnings("unchecked")
    private List<Double> readVector(Map source, String field) {
        if (source == null || field == null || field.isBlank()) {
            return null;
        }
        Object value = source.get(field);
        if (value == null) {
            return null;
        }
        if (!(value instanceof List<?> raw)) {
            return null;
        }

        List<Double> vector = new ArrayList<>(raw.size());
        for (Object item : raw) {
            if (item instanceof Number n) {
                vector.add(n.doubleValue());
            }
        }
        return vector;
    }

    public record ChunkVectorBackfillResult(
        String index,
        boolean dryRun,
        int scanned,
        int missingTitleEmbedding,
        int missingContentEmbedding,
        int updatedTitleEmbedding,
        int updatedContentEmbedding,
        int failed,
        List<String> updatedChunkIds
    ) {}

    public record ChunkOcrContentBackfillResult(
        String index,
        boolean dryRun,
        int scanned,
        int missingDocumentContent,
        int updated,
        int failed,
        List<String> updatedChunkIds
    ) {}

    private record DocumentVectors(List<Double> titleEmbedding, List<Double> contentEmbedding) {}
}
