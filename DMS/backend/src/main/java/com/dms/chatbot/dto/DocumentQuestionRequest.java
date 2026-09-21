package com.dms.chatbot.dto;

import jakarta.validation.constraints.NotBlank;

public record DocumentQuestionRequest(@NotBlank(message = "Question cannot be empty") String question) {
}
