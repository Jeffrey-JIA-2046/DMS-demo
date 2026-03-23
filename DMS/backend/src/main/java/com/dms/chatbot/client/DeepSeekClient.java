package com.dms.chatbot.client;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.dms.chatbot.config.DeepSeekProperties;
import com.dms.exception.AiServiceException;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class DeepSeekClient {

    private static final Logger log = LoggerFactory.getLogger(DeepSeekClient.class);

    private final DeepSeekProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public DeepSeekClient(DeepSeekProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
            .connectTimeout(safeTimeout(properties.getTimeout()))
            .build();
    }

    public String chat(String systemPrompt, String userPrompt) {
        List<ChatMessage> messages = new ArrayList<>();
        if (StringUtils.hasText(systemPrompt)) {
            messages.add(new ChatMessage("system", systemPrompt));
        }
        messages.add(new ChatMessage("user", userPrompt));
        return chat(messages);
    }

    public String chat(List<ChatMessage> messages) {
        if (messages == null || messages.isEmpty()) {
            throw new IllegalArgumentException("At least one message is required for DeepSeek");
        }
        HttpRequest request = buildRequest(messages, false);
        HttpResponse<String> response = send(request);
        if (response.statusCode() >= 400) {
            throw new AiServiceException("DeepSeek request failed (status %d)".formatted(response.statusCode()));
        }
        ChatResponse body = read(response.body());
        if (StringUtils.hasText(body.error())) {
            throw new AiServiceException("DeepSeek error: " + body.error());
        }
        if (body.message() == null || !StringUtils.hasText(body.message().content())) {
            throw new AiServiceException("DeepSeek returned an empty response");
        }
        return body.message().content();
    }

    public void stream(String systemPrompt, String userPrompt, Consumer<String> consumer) {
        List<ChatMessage> messages = new ArrayList<>();
        if (StringUtils.hasText(systemPrompt)) {
            messages.add(new ChatMessage("system", systemPrompt));
        }
        messages.add(new ChatMessage("user", userPrompt));
        stream(messages, consumer);
    }

    public void stream(List<ChatMessage> messages, Consumer<String> consumer) {
        if (messages == null || messages.isEmpty()) {
            throw new IllegalArgumentException("At least one message is required for DeepSeek");
        }
        HttpRequest request = buildRequest(messages, true);
        HttpResponse<InputStream> response = sendStream(request);
        if (response.statusCode() >= 400) {
            throw new AiServiceException("DeepSeek request failed (status %d)".formatted(response.statusCode()));
        }
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!StringUtils.hasText(line)) {
                    continue;
                }
                String payload = line.startsWith("data:") ? line.substring(5).trim() : line.trim();
                if (!StringUtils.hasText(payload) || "[DONE]".equalsIgnoreCase(payload)) {
                    continue;
                }
                ChatResponse chunk = read(payload);
                if (StringUtils.hasText(chunk.error())) {
                    throw new AiServiceException("DeepSeek error: " + chunk.error());
                }
                if (chunk.message() != null && StringUtils.hasText(chunk.message().content())) {
                    consumer.accept(chunk.message().content());
                }
                if (chunk.done()) {
                    break;
                }
            }
        } catch (IOException ex) {
            throw new AiServiceException("Failed to stream DeepSeek response", ex);
        }
    }

    private HttpRequest buildRequest(List<ChatMessage> messages, boolean stream) {
        ChatRequest payload = new ChatRequest(properties.getModel(), messages, stream);
        return HttpRequest.newBuilder()
            .uri(properties.chatUri())
            .timeout(safeTimeout(properties.getTimeout()))
            .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
            .POST(HttpRequest.BodyPublishers.ofString(write(payload), StandardCharsets.UTF_8))
            .build();
    }

    private HttpResponse<String> send(HttpRequest request) {
        try {
            return httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new AiServiceException("DeepSeek request interrupted", ex);
        } catch (IOException ex) {
            throw new AiServiceException("Failed to call DeepSeek", ex);
        }
    }

    private HttpResponse<InputStream> sendStream(HttpRequest request) {
        try {
            return httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new AiServiceException("DeepSeek stream interrupted", ex);
        } catch (IOException ex) {
            throw new AiServiceException("Failed to call DeepSeek", ex);
        }
    }

    private String write(ChatRequest payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (IOException ex) {
            throw new AiServiceException("Failed to serialize DeepSeek request", ex);
        }
    }

    private ChatResponse read(String payload) {
        try {
            return objectMapper.readValue(payload, ChatResponse.class);
        } catch (IOException ex) {
            log.warn("Unable to parse DeepSeek response payload: {}", payload);
            throw new AiServiceException("Failed to parse DeepSeek response", ex);
        }
    }

    private Duration safeTimeout(Duration timeout) {
        return timeout != null ? timeout : Duration.ofSeconds(60);
    }

    public record ChatMessage(String role, String content) {
    }

    private record ChatRequest(String model, List<ChatMessage> messages, boolean stream) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record ChatResponse(ChatMessage message, boolean done, String error) {
    }
}
