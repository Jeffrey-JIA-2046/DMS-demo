package com.dms.retention.dto;

public record RetentionSweepResponse(
    int scannedDocuments,
    int disposedDocuments
) {}
