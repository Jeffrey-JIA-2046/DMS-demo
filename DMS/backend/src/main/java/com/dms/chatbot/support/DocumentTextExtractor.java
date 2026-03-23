package com.dms.chatbot.support;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Optional;

import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.dms.document.model.DocumentVersion;

@Component
public class DocumentTextExtractor {

    private static final int SAMPLE_LIMIT = 512;

    public Optional<String> extract(DocumentVersion version, int maxCharacters) {
        if (version == null) {
            return Optional.empty();
        }
        byte[] content = version.getContent();
        if (content == null || content.length == 0) {
            return Optional.empty();
        }
        if (isLikelyBinary(version.getContentType(), content)) {
            return Optional.empty();
        }
        String text = new String(content, StandardCharsets.UTF_8);
        if (text.length() > maxCharacters) {
            return Optional.of(text.substring(0, maxCharacters));
        }
        return Optional.of(text);
    }

    private boolean isLikelyBinary(String contentType, byte[] content) {
        if (StringUtils.hasText(contentType)) {
            String type = contentType.toLowerCase(Locale.ROOT);
            if (type.startsWith("text/") || type.contains("json") || type.contains("xml") || type.contains("csv") || type.contains("yaml")) {
                return false;
            }
            if (type.contains("pdf") || type.contains("zip") || type.contains("msword") || type.contains("octet-stream")) {
                return true;
            }
        }
        int sample = Math.min(content.length, SAMPLE_LIMIT);
        int controlChars = 0;
        for (int i = 0; i < sample; i++) {
            byte value = content[i];
            if (value == 0) {
                return true;
            }
            if (value < 0x09 || (value > 0x0D && value < 0x20)) {
                controlChars++;
            }
        }
        return controlChars > sample * 0.3;
    }
}
