package com.dms.extraction.config;

import java.net.URI;
import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@ConfigurationProperties(prefix = "app.ai.extraction")
@Validated
public class ExtractionApiProperties {

    @NotNull
    private URI baseUrl = URI.create("http://localhost:5001");

    @NotBlank
    private String extractPath = "/extract";

    @NotNull
    private Duration timeout = Duration.ofSeconds(180);

    public URI getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(URI baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getExtractPath() {
        return extractPath;
    }

    public void setExtractPath(String extractPath) {
        this.extractPath = extractPath;
    }

    public Duration getTimeout() {
        return timeout;
    }

    public void setTimeout(Duration timeout) {
        this.timeout = timeout;
    }

    public URI extractUri() {
        return baseUrl.resolve(extractPath);
    }
}