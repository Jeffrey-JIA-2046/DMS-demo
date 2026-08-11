package com.dms.workflow.model;

public class WorkflowConnection {
    private String id;
    private String fromActivityId;
    private String toActivityId;
    private String conditionCase;
    private String label;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getFromActivityId() {
        return fromActivityId;
    }

    public void setFromActivityId(String fromActivityId) {
        this.fromActivityId = fromActivityId;
    }

    public String getToActivityId() {
        return toActivityId;
    }

    public void setToActivityId(String toActivityId) {
        this.toActivityId = toActivityId;
    }

    public String getConditionCase() {
        return conditionCase;
    }

    public void setConditionCase(String conditionCase) {
        this.conditionCase = conditionCase;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }
}
