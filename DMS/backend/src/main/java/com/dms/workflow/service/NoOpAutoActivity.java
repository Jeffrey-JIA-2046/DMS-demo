package com.dms.workflow.service;

import org.springframework.stereotype.Component;

@Component
public class NoOpAutoActivity implements AutoActivity {
    @Override
    public String key() {
        return "NO_OP";
    }

    @Override
    public String displayName() {
        return "No-op Auto Activity";
    }

    @Override
    public String description() {
        return "Marks the auto step completed without applying any business changes.";
    }

    @Override
    public AutoActivityResult execute(AutoActivityContext context) {
        return AutoActivityResult.success("No-op activity executed");
    }
}
