package com.dms.workflow.model;

import java.util.LinkedHashMap;
import java.util.Map;

public class WorkflowActivity {
    private String id;
    private String name;
    private WorkflowActivityType type;
    private int x;
    private int y;
    private Map<String, String> config = new LinkedHashMap<>();

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public WorkflowActivityType getType() {
        return type;
    }

    public void setType(WorkflowActivityType type) {
        this.type = type;
    }

    public int getX() {
        return x;
    }

    public void setX(int x) {
        this.x = x;
    }

    public int getY() {
        return y;
    }

    public void setY(int y) {
        this.y = y;
    }

    public Map<String, String> getConfig() {
        return config;
    }

    public void setConfig(Map<String, String> config) {
        this.config = config != null ? new LinkedHashMap<>(config) : new LinkedHashMap<>();
    }
}
