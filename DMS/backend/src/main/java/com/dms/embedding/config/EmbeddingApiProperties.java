package com.dms.embedding.config;

import java.net.URI;
import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@ConfigurationProperties(prefix = "app.ai.embedding")
@Validated
public class EmbeddingApiProperties {

    @NotNull
    private URI baseUrl = URI.create("http://localhost:5101");

    @NotBlank
    private String startJobPath = "/embed/jobs";

    @NotNull
    private Duration timeout = Duration.ofSeconds(180);

    public URI getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(URI baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getStartJobPath() {
        return startJobPath;
    }

    public void setStartJobPath(String startJobPath) {
        this.startJobPath = startJobPath;
    }

    public Duration getTimeout() {
        return timeout;
    }

    public void setTimeout(Duration timeout) {
        this.timeout = timeout;
    }

    public URI startJobUri() {
        return baseUrl.resolve(startJobPath);
    }
}