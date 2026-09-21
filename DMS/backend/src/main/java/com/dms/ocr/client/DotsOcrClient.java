package com.dms.ocr.client;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.client.HttpStatusCodeException;

import com.dms.exception.AiServiceException;
import com.dms.exception.InvalidDocumentException;
import com.dms.ocr.config.DotsOcrProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class DotsOcrClient {

    private static final String DEFAULT_PROMPT = "prompt_ocr";
    private static final int DEFAULT_CONFIDENCE = 95;

    private final DotsOcrProperties properties;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate;

    public DotsOcrClient(DotsOcrProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        HttpComponentsClientHttpRequestFactory requestFactory = new HttpComponentsClientHttpRequestFactory();
        Duration timeout = safeTimeout(properties.getTimeout());
        int timeoutMs = (int) timeout.toMillis();
        requestFactory.setConnectTimeout(timeoutMs);
        requestFactory.setConnectionRequestTimeout(timeoutMs);
        requestFactory.setReadTimeout(timeoutMs);
        this.restTemplate = new RestTemplate(requestFactory);
    }

    public Map<String, Object> ocrPdf(MultipartFile file, String prompt, Integer confidence) {
        MultipartFile pdf = requirePdf(file);
        try {
            return ocrPdf(pdf.getOriginalFilename(), pdf.getContentType(), pdf.getBytes(), prompt, confidence);
        } catch (IOException ex) {
            throw new AiServiceException("Failed to read uploaded PDF bytes", ex);
        }
    }

    public Map<String, Object> ocrPdf(String fileName, String contentType, byte[] content, String prompt, Integer confidence) {
        requirePdf(fileName, contentType, content);
        String effectivePrompt = StringUtils.hasText(prompt) ? prompt : DEFAULT_PROMPT;
        int effectiveConfidence = normalizeConfidence(confidence);
        String safeFileName = sanitizeFileName(StringUtils.hasText(fileName) ? fileName : "document.pdf");
        String safeContentType = StringUtils.hasText(contentType) ? contentType : MediaType.APPLICATION_PDF_VALUE;

        ByteArrayResource fileResource = new ByteArrayResource(content) {
            @Override
            public String getFilename() {
                return safeFileName;
            }
        };

        HttpHeaders fileHeaders = new HttpHeaders();
        fileHeaders.setContentType(MediaType.parseMediaType(safeContentType));
        fileHeaders.setContentDispositionFormData("file", safeFileName);

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", new HttpEntity<>(fileResource, fileHeaders));
        body.add("prompt", effectivePrompt);
        body.add("confidence", String.valueOf(effectiveConfidence));

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        HttpEntity<MultiValueMap<String, Object>> requestEntity = new HttpEntity<>(body, headers);

        ResponseEntity<String> response;
        try {
            response = restTemplate.exchange(properties.pdfUri(), HttpMethod.POST, requestEntity, String.class);
        } catch (HttpStatusCodeException ex) {
            throw new AiServiceException("Dots OCR request failed (status %d): %s".formatted(ex.getStatusCode().value(), trimBody(ex.getResponseBodyAsString())));
        } catch (ResourceAccessException ex) {
            throw new AiServiceException("Failed to call Dots OCR service", ex);
        }

        if (!response.getStatusCode().is2xxSuccessful()) {
            throw new AiServiceException("Dots OCR request failed (status %d): %s".formatted(response.getStatusCode().value(), trimBody(response.getBody())));
        }

        try {
            return objectMapper.readValue(response.getBody(), new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (IOException ex) {
            throw new AiServiceException("Failed to parse Dots OCR response", ex);
        }
    }

    private MultipartFile requirePdf(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new InvalidDocumentException("A PDF file is required for OCR.");
        }

        String fileName = file.getOriginalFilename();
        boolean extensionLooksPdf = StringUtils.hasText(fileName) && fileName.toLowerCase().endsWith(".pdf");
        String contentType = file.getContentType();
        boolean contentTypeLooksPdf = contentType != null && contentType.toLowerCase().contains("pdf");

        if (!extensionLooksPdf && !contentTypeLooksPdf) {
            throw new InvalidDocumentException("Only PDF files are supported for OCR.");
        }

        return file;
    }

    private void requirePdf(String fileName, String contentType, byte[] content) {
        if (content == null || content.length == 0) {
            throw new InvalidDocumentException("A PDF file is required for OCR.");
        }
        boolean extensionLooksPdf = StringUtils.hasText(fileName) && fileName.toLowerCase().endsWith(".pdf");
        boolean contentTypeLooksPdf = StringUtils.hasText(contentType) && contentType.toLowerCase().contains("pdf");
        if (!extensionLooksPdf && !contentTypeLooksPdf) {
            throw new InvalidDocumentException("Only PDF files are supported for OCR.");
        }
    }

    private byte[] buildMultipartPayload(String boundary, MultipartFile file, String prompt) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        String fileName = StringUtils.hasText(file.getOriginalFilename()) ? file.getOriginalFilename() : "document.pdf";
        String contentType = StringUtils.hasText(file.getContentType()) ? file.getContentType() : MediaType.APPLICATION_PDF_VALUE;

        writeString(output, "--" + boundary + "\r\n");
        writeString(output, "Content-Disposition: form-data; name=\"file\"; filename=\"" + sanitizeFileName(fileName) + "\"\r\n");
        writeString(output, "Content-Type: " + contentType + "\r\n\r\n");
        output.write(file.getBytes());
        writeString(output, "\r\n");

        writeString(output, "--" + boundary + "\r\n");
        writeString(output, "Content-Disposition: form-data; name=\"prompt\"\r\n\r\n");
        writeString(output, prompt);
        writeString(output, "\r\n");

        writeString(output, "--" + boundary + "--\r\n");
        return output.toByteArray();
    }

    private void writeString(ByteArrayOutputStream output, String value) throws IOException {
        output.write(value.getBytes(StandardCharsets.UTF_8));
    }

    private String sanitizeFileName(String fileName) {
        return fileName.replace("\"", "_").replace("\r", "").replace("\n", "");
    }

    private int normalizeConfidence(Integer confidence) {
        if (confidence == null) return DEFAULT_CONFIDENCE;
        return Math.max(0, Math.min(100, confidence));
    }

    private Duration safeTimeout(Duration timeout) {
        return timeout != null ? timeout : Duration.ofMinutes(5);
    }

    private String trimBody(String body) {
        if (!StringUtils.hasText(body)) {
            return "";
        }
        String normalized = body.trim().replaceAll("\\s+", " ");
        if (normalized.length() <= 220) {
            return normalized;
        }
        return normalized.substring(0, 220) + "...";
    }
}
