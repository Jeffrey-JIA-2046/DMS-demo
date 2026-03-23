package com.dms.ocr.config;

import java.net.URI;
import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@ConfigurationProperties(prefix = "app.ocr.dots")
@Validated
public class DotsOcrProperties {

    @NotNull
    private URI baseUrl = URI.create("http://172.29.199.200:9000");

    @NotBlank
    private String pdfPath = "/ocr/pdf";

    @NotNull
    private Duration timeout = Duration.ofSeconds(180);

    public URI getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(URI baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getPdfPath() {
        return pdfPath;
    }

    public void setPdfPath(String pdfPath) {
        this.pdfPath = pdfPath;
    }

    public Duration getTimeout() {
        return timeout;
    }

    public void setTimeout(Duration timeout) {
        this.timeout = timeout;
    }

    public URI pdfUri() {
        return baseUrl.resolve(pdfPath);
    }
}
