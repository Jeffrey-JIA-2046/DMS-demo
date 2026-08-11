package com.dms.workflow.service;

public record AutoActivityResult(
    boolean success,
    String message
) {
    public static AutoActivityResult success(String message) {
        return new AutoActivityResult(true, message);
    }

    public static AutoActivityResult failure(String message) {
        return new AutoActivityResult(false, message);
    }
}
