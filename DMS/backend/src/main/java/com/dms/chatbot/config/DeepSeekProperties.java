package com.dms.chatbot.config;

import java.net.URI;
import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@ConfigurationProperties(prefix = "app.ai.deepseek")
@Validated
public class DeepSeekProperties {

    @NotNull
    private URI baseUrl = URI.create("http://localhost:11434");

    @NotBlank
    private String chatPath = "/api/chat";

    @NotBlank
    private String model = "deepseek-r1:1.5b";

    @NotNull
    private Duration timeout = Duration.ofSeconds(60);

    public URI getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(URI baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getChatPath() {
        return chatPath;
    }

    public void setChatPath(String chatPath) {
        this.chatPath = chatPath;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public Duration getTimeout() {
        return timeout;
    }

    public void setTimeout(Duration timeout) {
        this.timeout = timeout;
    }

    public URI chatUri() {
        return baseUrl.resolve(chatPath);
    }
}
