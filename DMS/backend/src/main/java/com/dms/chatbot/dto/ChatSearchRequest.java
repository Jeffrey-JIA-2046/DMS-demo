package com.dms.chatbot.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record ChatSearchRequest(
    @NotBlank(message = "Prompt is required") String prompt,
    @Min(value = 1, message = "Limit must be at least 1")
    @Max(value = 8, message = "Limit must be 8 or fewer")
    Integer limit
) {
    public int resolvedLimit() {
        int candidate = limit != null ? limit : 5;
        return Math.max(1, Math.min(8, candidate));
    }
}
