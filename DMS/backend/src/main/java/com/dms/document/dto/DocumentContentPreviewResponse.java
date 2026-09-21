package com.dms.document.dto;

public record DocumentContentPreviewResponse(
    String status,
    String mode,
    String text,
    String contentType,
    boolean truncated,
    boolean supported
) {
}