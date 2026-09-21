package com.dms.document.service;

import java.io.IOException;
import java.util.List;

import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.Conflicts;
import org.opensearch.client.opensearch._types.OpenSearchException;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.UpdateByQueryRequest;
import org.opensearch.client.opensearch.core.UpdateByQueryResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class DocumentVersionsContentHousekeepingService {

    private final OpenSearchClient openSearchClient;

    @Value("${app.opensearch.documents-index:dms-documents}")
    private String documentsIndex;

    public DocumentVersionsContentHousekeepingService(OpenSearchClient openSearchClient) {
        this.openSearchClient = openSearchClient;
    }

    public VersionsContentHousekeepingResult run(boolean dryRun) {
        try {
            long matchedBefore = countDocsWithVersionContent();
            if (dryRun) {
                return new VersionsContentHousekeepingResult(
                    documentsIndex,
                    true,
                    matchedBefore,
                    0L,
                    matchedBefore,
                    0L,
                    0L,
                    List.of()
                );
            }

            UpdateByQueryRequest request = new UpdateByQueryRequest.Builder()
                .index(documentsIndex)
                .query(q -> q.exists(e -> e.field("versions.content")))
                .conflicts(Conflicts.Proceed)
                .refresh(true)
                .script(s -> s.inline(i -> i
                    .lang("painless")
                    .source(
                        "if (ctx._source.containsKey('versions') && ctx._source.versions != null) {"
                            + " for (def v : ctx._source.versions) {"
                            + "   if (v != null && v.containsKey('content')) { v.remove('content'); }"
                            + " }"
                            + "}"
                    )
                ))
                .build();

            UpdateByQueryResponse response = openSearchClient.updateByQuery(request);
            long remaining = countDocsWithVersionContent();

            return new VersionsContentHousekeepingResult(
                documentsIndex,
                false,
                matchedBefore,
                safeLong(response.updated()),
                remaining,
                safeLong(response.versionConflicts()),
                response.failures() == null ? 0L : response.failures().size(),
                response.failures() == null
                    ? List.of()
                    : response.failures().stream().map(Object::toString).toList()
            );
        } catch (OpenSearchException ex) {
            if (ex.getMessage() != null && ex.getMessage().contains("index_not_found_exception")) {
                return new VersionsContentHousekeepingResult(documentsIndex, dryRun, 0L, 0L, 0L, 0L, 0L, List.of());
            }
            throw new RuntimeException("OpenSearch versions.content housekeeping failed", ex);
        } catch (IOException ex) {
            throw new RuntimeException("OpenSearch versions.content housekeeping failed", ex);
        }
    }

    private long countDocsWithVersionContent() throws IOException {
        SearchRequest request = new SearchRequest.Builder()
            .index(documentsIndex)
            .size(0)
            .query(q -> q.exists(e -> e.field("versions.content")))
            .build();

        SearchResponse<Object> response = openSearchClient.search(request, Object.class);
        if (response.hits() == null || response.hits().total() == null) {
            return 0L;
        }
        return response.hits().total().value();
    }

    private long safeLong(Long value) {
        return value == null ? 0L : value;
    }

    public record VersionsContentHousekeepingResult(
        String index,
        boolean dryRun,
        long matchedBefore,
        long updated,
        long remaining,
        long versionConflicts,
        long failureCount,
        List<String> failures
    ) {
    }
}