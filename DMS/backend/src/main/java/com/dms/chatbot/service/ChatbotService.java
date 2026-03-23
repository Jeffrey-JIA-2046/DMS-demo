package com.dms.chatbot.service;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.function.Consumer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.dms.chatbot.client.DeepSeekClient;
import com.dms.chatbot.dto.ChatDocumentHitResponse;
import com.dms.chatbot.dto.ChatDocumentSummaryResponse;
import com.dms.chatbot.dto.ChatSearchRequest;
import com.dms.chatbot.dto.ChatSearchResponse;
import com.dms.chatbot.dto.DocumentAnswerResponse;
import com.dms.chatbot.dto.DocumentQuestionRequest;
import com.dms.chatbot.support.DocumentTextExtractor;
import com.dms.document.model.Document;
import com.dms.document.model.DocumentStatus;
import com.dms.document.model.DocumentVersion;
import com.dms.document.repository.DocumentRepository;
import com.dms.document.repository.DocumentVersionRepository;
import com.dms.exception.ResourceNotFoundException;

@Service
public class ChatbotService {

    private static final Logger log = LoggerFactory.getLogger(ChatbotService.class);

    private static final int MAX_CONTEXT_CHARS = 6000;
    private static final Pattern THINK_PATTERN = Pattern.compile("<think>.*?</think>", Pattern.DOTALL);
    private static final String SEARCH_SYSTEM_PROMPT = "You are a diligent knowledge concierge. Recommend documents succinctly and cite their IDs in square brackets when useful.";
    private static final String SUMMARY_SYSTEM_PROMPT = "You summarize enterprise documents for busy reviewers. Produce 3 tight bullet points.";
    private static final String QA_SYSTEM_PROMPT = "You answer based only on the provided document context. If the answer is missing, say you cannot find it.";

    private final DocumentRepository documentRepository;
    private final DocumentVersionRepository documentVersionRepository;
    private final DeepSeekClient deepSeekClient;
    private final DocumentTextExtractor textExtractor;
    private final Clock clock;

    public ChatbotService(
        DocumentRepository documentRepository,
        DocumentVersionRepository documentVersionRepository,
        DeepSeekClient deepSeekClient,
        DocumentTextExtractor textExtractor,
        Clock clock
    ) {
        this.documentRepository = documentRepository;
        this.documentVersionRepository = documentVersionRepository;
        this.deepSeekClient = deepSeekClient;
        this.textExtractor = textExtractor;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public ChatSearchResponse searchDocuments(ChatSearchRequest request) {
        try {
            // TODO: Implement proper search with filtering by status
            // For now, return active documents with basic filtering
            var page = documentRepository.findAll(
                PageRequest.of(0, request.resolvedLimit(), Sort.by(Sort.Direction.DESC, "updated_at"))
            );

            List<ChatDocumentHitResponse> hits = page.getContent().stream()
                .map(this::toHit)
                .toList();

            String overview = hits.isEmpty()
                ? "No documents matched that prompt."
                : buildOverview(request.prompt(), hits);

            return new ChatSearchResponse(request.prompt(), Instant.now(clock), overview, hits);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to search documents", ex);
        }
    }

    @Transactional(readOnly = true)
    public ChatDocumentSummaryResponse summarizeDocument(String documentId) {
        try {
            Document document = findDocument(documentId);
            DocumentVersion version = documentVersionRepository.findFirstByDocumentIdOrderByVersionNumberDesc(String.valueOf(documentId))
                .orElse(null);
            String context = buildDocumentContext(document, version);
            String summaryPrompt = "Document context:\n" + context + "\nSummarize this file in no more than three bullet points.";
            String summary = clean(deepSeekClient.chat(SUMMARY_SYSTEM_PROMPT, summaryPrompt));
            return new ChatDocumentSummaryResponse(document.getId(), document.getTitle(), summary, Instant.now(clock));
        } catch (IOException ex) {
            throw new RuntimeException("Failed to summarize document", ex);
        }
    }

    @Transactional(readOnly = true)
    public DocumentAnswerResponse answerQuestion(String documentId, DocumentQuestionRequest request) {
        try {
            Document document = findDocument(documentId);
            DocumentVersion version = documentVersionRepository.findFirstByDocumentIdOrderByVersionNumberDesc(String.valueOf(documentId))
                .orElseThrow(() -> new ResourceNotFoundException("No versions found for document"));
            String context = buildDocumentContext(document, version);
            String question = request.question().trim();
            String prompt = "Document context:\n" + context + "\nQuestion: " + question + "\nAnswer:";
            String answer = clean(deepSeekClient.chat(QA_SYSTEM_PROMPT, prompt));
            return new DocumentAnswerResponse(document.getId(), document.getTitle(), answer, Instant.now(clock));
        } catch (IOException ex) {
            throw new RuntimeException("Failed to answer question", ex);
        }
    }

    @Transactional(readOnly = true)
    public void streamDocumentSummary(String documentId, Consumer<String> consumer) {
        try {
            Document document = findDocument(documentId);
            DocumentVersion version = documentVersionRepository.findFirstByDocumentIdOrderByVersionNumberDesc(String.valueOf(documentId))
                .orElse(null);
            String context = buildDocumentContext(document, version);
            String prompt = "Document context:\n" + context + "\nSummarize this file in no more than three bullet points.";
            streamPrompt(SUMMARY_SYSTEM_PROMPT, prompt, consumer);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to stream document summary", ex);
        }
    }

    @Transactional(readOnly = true)
    public void streamDocumentAnswer(String documentId, DocumentQuestionRequest request, Consumer<String> consumer) {
        try {
            Document document = findDocument(documentId);
            DocumentVersion version = documentVersionRepository.findFirstByDocumentIdOrderByVersionNumberDesc(String.valueOf(documentId))
                .orElseThrow(() -> new ResourceNotFoundException("No versions found for document"));
            String context = buildDocumentContext(document, version);
            String question = request.question().trim();
            String prompt = "Document context:\n" + context + "\nQuestion: " + question + "\nAnswer:";
            streamPrompt(QA_SYSTEM_PROMPT, prompt, consumer);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to stream document answer", ex);
        }
    }

    private ChatDocumentHitResponse toHit(Document document) {
        return new ChatDocumentHitResponse(
            document.getId(),
            document.getTitle(),
            document.getOwner(),
            document.getCategory(),
            document.getStatus() != null ? document.getStatus().name() : null,
            buildSnippet(document),
            document.getUpdatedAt()
        );
    }

    private String buildOverview(String prompt, List<ChatDocumentHitResponse> hits) {
        var contextLines = hits.stream()
            .map(hit -> "[" + hit.documentId() + "] " + safe(hit.title()) + " — " + safe(hit.snippet()))
            .collect(Collectors.joining("\n"));
        String overviewPrompt = "User prompt: " + prompt + "\nDocuments:\n" + contextLines +
            "\nRecommend the best matches in 2 sentences.";
        try {
            return clean(deepSeekClient.chat(SEARCH_SYSTEM_PROMPT, overviewPrompt));
        } catch (RuntimeException ex) {
            log.warn("Failed to build AI overview: {}", ex.getMessage());
            return "Documents ready. AI overview unavailable right now.";
        }
    }

    private String buildSnippet(Document document) {
        if (StringUtils.hasText(document.getDescription())) {
            return truncate(document.getDescription(), 220);
        }
        Map<String, String> metadata = document.getMetadataValues();
        if (metadata != null && !metadata.isEmpty()) {
            return metadata.entrySet().stream()
                .limit(2)
                .map(entry -> entry.getKey() + ": " + entry.getValue())
                .collect(Collectors.joining(" · "));
        }
        Set<String> tags = document.getTags();
        if (tags != null && !tags.isEmpty()) {
            return "Tags: " + tags.stream().limit(3).collect(Collectors.joining(", "));
        }
        return "No description available";
    }

    private String buildDocumentContext(Document document, DocumentVersion version) {
        StringBuilder builder = new StringBuilder();
        builder.append("Title: ").append(safe(document.getTitle())).append('\n');
        if (StringUtils.hasText(document.getDescription())) {
            builder.append("Description: ").append(document.getDescription()).append('\n');
        }
        if (StringUtils.hasText(document.getOwner())) {
            builder.append("Owner: ").append(document.getOwner()).append('\n');
        }
        if (StringUtils.hasText(document.getCategory())) {
            builder.append("Category: ").append(document.getCategory()).append('\n');
        }
        if (document.getStatus() != null) {
            builder.append("Status: ").append(document.getStatus().name()).append('\n');
        }
        Set<String> tags = document.getTags();
        if (tags != null && !tags.isEmpty()) {
            builder.append("Tags: ").append(String.join(", ", tags)).append('\n');
        }
        Map<String, String> metadata = document.getMetadataValues();
        if (metadata != null && !metadata.isEmpty()) {
            builder.append("Metadata:\n");
            metadata.forEach((key, value) -> builder.append("- ").append(key).append(": ").append(value).append('\n'));
        }
        if (version != null) {
            textExtractor.extract(version, MAX_CONTEXT_CHARS)
                .ifPresent(text -> builder.append("Content preview:\n").append(text).append('\n'));
            builder.append("File name: ").append(safe(version.getFileName())).append('\n');
            builder.append("Content type: ").append(safe(version.getContentType())).append('\n');
        }
        return builder.toString();
    }

    private Document findDocument(String id) {
        try {
            if (id == null) {
                throw new ResourceNotFoundException("Document not found");
            }
            return documentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
        } catch (IOException ex) {
            throw new RuntimeException("Failed to retrieve document", ex);
        }
    }

    private void streamPrompt(String systemPrompt, String userPrompt, Consumer<String> consumer) {
        StreamAccumulator accumulator = new StreamAccumulator();
        deepSeekClient.stream(systemPrompt, userPrompt, chunk -> {
            String delta = accumulator.append(chunk);
            if (StringUtils.hasText(delta)) {
                consumer.accept(delta);
            }
        });
    }

    private String clean(String raw) {
        if (!StringUtils.hasText(raw)) {
            return "";
        }
        return removeReasoning(raw).trim();
    }

    private String removeReasoning(String value) {
        if (!StringUtils.hasText(value)) {
            return "";
        }
        return THINK_PATTERN.matcher(value).replaceAll("");
    }

    private String truncate(String value, int maxChars) {
        if (!StringUtils.hasText(value) || value.length() <= maxChars) {
            return value;
        }
        return value.substring(0, Math.max(0, maxChars - 3)) + "...";
    }

    private String safe(String value) {
        return value != null ? value : "";
    }

    private final class StreamAccumulator {
        private final StringBuilder raw = new StringBuilder();
        private int deliveredLength;

        String append(String chunk) {
            raw.append(chunk);
            String cleaned = removeReasoning(raw.toString());
            if (cleaned.length() <= deliveredLength) {
                return "";
            }
            String delta = cleaned.substring(deliveredLength);
            deliveredLength = cleaned.length();
            return delta;
        }
    }
}
