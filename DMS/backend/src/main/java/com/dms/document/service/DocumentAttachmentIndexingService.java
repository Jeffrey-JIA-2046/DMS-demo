package com.dms.document.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.ErrorCause;
import org.opensearch.client.opensearch._types.Refresh;
import org.opensearch.client.opensearch.core.GetRequest;
import org.opensearch.client.opensearch.core.IndexRequest;
import org.opensearch.client.opensearch.core.DeleteRequest;
import org.opensearch.client.opensearch._types.OpenSearchException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.dms.document.dto.DocumentContentPreviewResponse;
import com.dms.document.model.Document;
import com.dms.document.model.DocumentVersion;

@Service
public class DocumentAttachmentIndexingService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(DocumentAttachmentIndexingService.class);

    private static final Set<String> SUPPORTED_EXTENSIONS = Set.of(
        "pdf", "ppt", "pptx", "xls", "xlsx", "doc", "docx", "txt"
    );

    private final OpenSearchClient openSearchClient;

    @Value("${app.opensearch.enabled:false}")
    private boolean openSearchEnabled;

    @Value("${app.opensearch.attachments-index:dms-attachments}")
    private String attachmentsIndex;

    @Value("${app.opensearch.attachments-pipeline:dms-attachments-pipeline}")
    private String attachmentsPipeline;

    public DocumentAttachmentIndexingService(OpenSearchClient openSearchClient) {
        this.openSearchClient = openSearchClient;
    }

    public void indexAttachment(Document document, DocumentVersion version) {
        if (!openSearchEnabled || document == null || version == null) {
            return;
        }
        if (!supportsAttachmentExtraction(version.getFileName(), version.getContentType())) {
            return;
        }
        if (version.getContent() == null || version.getContent().length == 0) {
            return;
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("document_id", document.getId());
        payload.put("document_version_id", version.getId());
        payload.put("title", document.getTitle());
        payload.put("description", document.getDescription());
        payload.put("owner", document.getOwner());
        payload.put("category", document.getCategory());
        payload.put("folder_id", document.getFolderId());
        payload.put("tags", document.getTags());
        payload.put("file_name", version.getFileName());
        payload.put("content_type", version.getContentType());
        payload.put("size_bytes", version.getSizeBytes());
        payload.put("created_at", version.getCreatedAt());
        payload.put("data", Base64.getEncoder().encodeToString(version.getContent()));
        payload.put("max_chars", 200000);

        try {
            indexAttachmentDocument(version.getId(), payload, true);
        } catch (Exception ex) {
            log.warn(
                "Failed to index attachment content for document {} version {}: {}. Retrying metadata-only indexing.",
                document.getId(),
                version.getId(),
                formatOpenSearchError(ex)
            );
            try {
                payload.remove("data");
                payload.remove("max_chars");
                indexAttachmentDocument(version.getId(), payload, false);
            } catch (Exception retryEx) {
                log.warn(
                    "Attachment metadata-only indexing also failed for document {} version {}: {}",
                    document.getId(),
                    version.getId(),
                    formatOpenSearchError(retryEx)
                );
            }
        }
    }

    public DocumentContentPreviewResponse buildPreview(DocumentVersion version, int maxChars) {
        String contentType = version != null && StringUtils.hasText(version.getContentType())
            ? version.getContentType()
            : "application/octet-stream";
        if (version == null) {
            return new DocumentContentPreviewResponse("unsupported", "text", "", contentType, false, false);
        }

        if (shouldPreferAttachmentExtraction(version.getFileName(), version.getContentType())) {
            Optional<String> preferred = findExtractedAttachmentContent(version.getId(), maxChars);
            if (preferred.isEmpty() && supportsAttachmentExtraction(version.getFileName(), version.getContentType())) {
                indexAttachmentPreview(version);
                preferred = findExtractedAttachmentContent(version.getId(), maxChars);
            }
            if (preferred.isPresent()) {
                String text = sanitizePreviewText(preferred.get());
                boolean truncated = text.length() > maxChars;
                return new DocumentContentPreviewResponse(
                    "ready",
                    "text",
                    truncated ? text.substring(0, maxChars) : text,
                    contentType,
                    truncated,
                    true
                );
            }
        }

        if (isTextLikeContent(version.getContentType(), version.getFileName())) {
            String text = sanitizePreviewText(new String(version.getContent() != null ? version.getContent() : new byte[0], StandardCharsets.UTF_8));
            boolean truncated = text.length() > maxChars;
            return new DocumentContentPreviewResponse(
                "ready",
                "text",
                truncated ? text.substring(0, maxChars) : text,
                contentType,
                truncated,
                true
            );
        }

        Optional<String> extracted = findExtractedAttachmentContent(version.getId(), maxChars);
        if (extracted.isEmpty() && supportsAttachmentExtraction(version.getFileName(), version.getContentType())) {
            indexAttachmentPreview(version);
            extracted = findExtractedAttachmentContent(version.getId(), maxChars);
        }
        if (extracted.isPresent()) {
            String text = sanitizePreviewText(extracted.get());
            boolean truncated = text.length() > maxChars;
            return new DocumentContentPreviewResponse(
                "ready",
                "text",
                truncated ? text.substring(0, maxChars) : text,
                contentType,
                truncated,
                true
            );
        }

        return new DocumentContentPreviewResponse("unsupported", "text", "", contentType, false, false);
    }

    public void deleteAttachmentByVersionId(String versionId) {
        if (!openSearchEnabled || !StringUtils.hasText(versionId)) {
            return;
        }
        try {
            openSearchClient.delete(new DeleteRequest.Builder().index(attachmentsIndex).id(versionId).refresh(Refresh.WaitFor).build());
        } catch (Exception ex) {
            log.debug("Attachment delete skipped for version {}: {}", versionId, ex.getMessage());
        }
    }

    private Optional<String> findExtractedAttachmentContent(String documentVersionId, int maxChars) {
        if (!openSearchEnabled || !StringUtils.hasText(documentVersionId)) {
            return Optional.empty();
        }
        try {
            GetRequest request = new GetRequest.Builder()
                .index(attachmentsIndex)
                .id(documentVersionId)
                .build();

            @SuppressWarnings("unchecked")
            Class<Map<String, Object>> mapClass = (Class<Map<String, Object>>) (Class<?>) Map.class;
            var response = openSearchClient.get(request, mapClass);
            if (!response.found() || response.source() == null) {
                return Optional.empty();
            }
            Object attachmentObj = response.source().get("attachment");
            if (!(attachmentObj instanceof Map<?, ?> attachmentMap)) {
                return Optional.empty();
            }
            Object contentObj = attachmentMap.get("content");
            if (!(contentObj instanceof String content) || !StringUtils.hasText(content)) {
                return Optional.empty();
            }
            return Optional.of(content.length() > maxChars ? content.substring(0, maxChars) : content);
        } catch (Exception ex) {
            log.debug("Attachment preview lookup failed for version {}: {}", documentVersionId, ex.getMessage());
            return Optional.empty();
        }
    }

    private void indexAttachmentPreview(DocumentVersion version) {
        if (version == null || version.getContent() == null || version.getContent().length == 0) {
            return;
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("document_id", version.getDocumentId());
        payload.put("document_version_id", version.getId());
        payload.put("title", version.getFileName());
        payload.put("file_name", version.getFileName());
        payload.put("content_type", version.getContentType());
        payload.put("size_bytes", version.getSizeBytes());
        payload.put("created_at", version.getCreatedAt());
        payload.put("data", Base64.getEncoder().encodeToString(version.getContent()));
        payload.put("max_chars", 200000);

        try {
            indexAttachmentDocument(version.getId(), payload, true);
        } catch (Exception ex) {
            log.debug(
                "On-demand attachment preview indexing failed for version {}: {}",
                version.getId(),
                formatOpenSearchError(ex)
            );
        }
    }

    private void indexAttachmentDocument(String versionId, Map<String, Object> payload, boolean withPipeline) throws IOException {
        IndexRequest.Builder<Map<String, Object>> builder = new IndexRequest.Builder<Map<String, Object>>()
            .index(attachmentsIndex)
            .id(versionId)
            .document(payload)
            .refresh(Refresh.WaitFor);

        if (withPipeline && StringUtils.hasText(attachmentsPipeline)) {
            builder.pipeline(attachmentsPipeline);
        }

        openSearchClient.index(builder.build());
    }

    private String formatOpenSearchError(Exception ex) {
        if (ex instanceof OpenSearchException openSearchException) {
            ErrorCause cause = openSearchException.error();
            if (cause != null) {
                String reason = cause.reason();
                if (StringUtils.hasText(reason)) {
                    return reason;
                }
            }
        }
        return ex.getMessage();
    }

    private String sanitizePreviewText(String text) {
        if (!StringUtils.hasText(text)) {
            return "";
        }

        String normalized = Normalizer.normalize(text, Normalizer.Form.NFKC)
            .replace("\r\n", "\n")
            .replace('\r', '\n')
            .replace("\u0000", "")
            .replace("‹#›", "")
            .replace("┬⌐", "©");

        StringBuilder cleaned = new StringBuilder(normalized.length());
        for (int index = 0; index < normalized.length(); index++) {
            char current = normalized.charAt(index);
            if (current == '\n' || current == '\t' || !Character.isISOControl(current)) {
                cleaned.append(current);
            }
        }

        return cleaned.toString()
            .replaceAll("[ \t]+", " ")
            .replaceAll("(?m)^[| ]+", "")
            .replaceAll("(?m)[ \t]+$", "")
            .replaceAll("\n{3,}", "\n\n")
            .trim();
    }

    private boolean supportsAttachmentExtraction(String fileName, String contentType) {
        if (StringUtils.hasText(contentType)) {
            String normalizedContentType = contentType.trim().toLowerCase(Locale.ROOT);
            List<String> supportedContentTypes = List.of(
                "application/pdf",
                "application/msword",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/vnd.ms-powerpoint",
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                "application/vnd.ms-excel",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "text/plain"
            );
            if (supportedContentTypes.stream().anyMatch(normalizedContentType::contains)) {
                return true;
            }
        }

        if (!StringUtils.hasText(fileName) || !fileName.contains(".")) {
            return false;
        }

        String extension = fileName.substring(fileName.lastIndexOf('.') + 1).trim().toLowerCase(Locale.ROOT);
        return SUPPORTED_EXTENSIONS.contains(extension);
    }

    private boolean isTextLikeContent(String contentType, String fileName) {
        if (StringUtils.hasText(contentType)) {
            String normalizedContentType = contentType.trim().toLowerCase(Locale.ROOT);
            if (normalizedContentType.startsWith("text/")) {
                return true;
            }
            if (normalizedContentType.contains("json") || normalizedContentType.contains("xml") || normalizedContentType.contains("csv") || normalizedContentType.contains("yaml") || normalizedContentType.contains("yml")) {
                return true;
            }
        }
        if (!StringUtils.hasText(fileName) || !fileName.contains(".")) {
            return false;
        }
        String extension = fileName.substring(fileName.lastIndexOf('.') + 1).trim().toLowerCase(Locale.ROOT);
        return "txt".equals(extension) || "csv".equals(extension) || "json".equals(extension) || "xml".equals(extension) || "yaml".equals(extension) || "yml".equals(extension);
    }

    private boolean shouldPreferAttachmentExtraction(String fileName, String contentType) {
        if (StringUtils.hasText(fileName) && fileName.contains(".")) {
            String extension = fileName.substring(fileName.lastIndexOf('.') + 1).trim().toLowerCase(Locale.ROOT);
            if (Set.of("doc", "docx", "ppt", "pptx", "xls", "xlsx", "pdf").contains(extension)) {
                return true;
            }
        }

        if (!StringUtils.hasText(contentType)) {
            return false;
        }

        String normalizedContentType = contentType.trim().toLowerCase(Locale.ROOT);
        return normalizedContentType.contains("pdf")
            || normalizedContentType.contains("msword")
            || normalizedContentType.contains("wordprocessingml")
            || normalizedContentType.contains("ms-powerpoint")
            || normalizedContentType.contains("presentationml")
            || normalizedContentType.contains("ms-excel")
            || normalizedContentType.contains("spreadsheetml");
    }
}