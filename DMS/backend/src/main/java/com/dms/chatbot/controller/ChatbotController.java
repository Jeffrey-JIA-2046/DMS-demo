package com.dms.chatbot.controller;

import java.io.IOException;
import java.util.concurrent.CompletableFuture;

import org.springframework.http.MediaType;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyEmitter;

import com.dms.chatbot.dto.ChatDocumentSummaryResponse;
import com.dms.chatbot.dto.ChatSearchRequest;
import com.dms.chatbot.dto.ChatSearchResponse;
import com.dms.chatbot.dto.DocumentAnswerResponse;
import com.dms.chatbot.dto.DocumentQuestionRequest;
import com.dms.chatbot.service.ChatbotDocumentIndexService;
import com.dms.chatbot.service.ChatbotDocumentIndexService.HousekeepingResult;
import com.dms.chatbot.service.ChatbotService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/chatbot")
public class ChatbotController {

    private final ChatbotService chatbotService;
    private final ChatbotDocumentIndexService chatbotDocumentIndexService;

    public ChatbotController(ChatbotService chatbotService,
                             ChatbotDocumentIndexService chatbotDocumentIndexService) {
        this.chatbotService = chatbotService;
        this.chatbotDocumentIndexService = chatbotDocumentIndexService;
    }

    @PostMapping("/search")
    public ChatSearchResponse search(@Valid @RequestBody ChatSearchRequest request) {
        return chatbotService.searchDocuments(request);
    }

    @PostMapping("/documents/{documentId}/summary")
    public ChatDocumentSummaryResponse summarize(@PathVariable String documentId) {
        return chatbotService.summarizeDocument(documentId);
    }

    @PostMapping("/documents/{documentId}/qa")
    public DocumentAnswerResponse askQuestion(
        @PathVariable String documentId,
        @Valid @RequestBody DocumentQuestionRequest request
    ) {
        return chatbotService.answerQuestion(documentId, request);
    }

    @PostMapping(value = "/documents/{documentId}/summary/stream", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseBodyEmitter streamSummary(@PathVariable String documentId) {
        ResponseBodyEmitter emitter = new ResponseBodyEmitter(0L);
        CompletableFuture.runAsync(() -> {
            try {
                chatbotService.streamDocumentSummary(documentId, chunk -> sendChunk(emitter, chunk));
                emitter.complete();
            } catch (Exception ex) {
                emitter.completeWithError(ex);
            }
        });
        return emitter;
    }

    @PostMapping(value = "/documents/{documentId}/qa/stream", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseBodyEmitter streamAnswer(
        @PathVariable String documentId,
        @Valid @RequestBody DocumentQuestionRequest request
    ) {
        ResponseBodyEmitter emitter = new ResponseBodyEmitter(0L);
        CompletableFuture.runAsync(() -> {
            try {
                chatbotService.streamDocumentAnswer(documentId, request, chunk -> sendChunk(emitter, chunk));
                emitter.complete();
            } catch (Exception ex) {
                emitter.completeWithError(ex);
            }
        });
        return emitter;
    }

    private void sendChunk(ResponseBodyEmitter emitter, String chunk) {
        if (!StringUtils.hasText(chunk)) {
            return;
        }
        try {
            emitter.send(chunk, MediaType.TEXT_PLAIN);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to stream chunk", ex);
        }
    }

    /**
     * POST /api/chatbot/index/housekeeping
     *
     * Scans the dms-documents-chatbot index and removes any entries whose document
     * ID no longer exists in dms-documents. Returns a summary of how many entries
     * were scanned and deleted.
     */
    @PostMapping("/index/housekeeping")
    public HousekeepingResult runHousekeeping() {
        return chatbotDocumentIndexService.runHousekeeping();
    }
}
