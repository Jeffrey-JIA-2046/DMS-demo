package com.dms.workflow.service;

public interface AutoActivity {
    String key();

    String displayName();

    String description();

    AutoActivityResult execute(AutoActivityContext context);
}
