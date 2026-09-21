package com.dms.codetable.model;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonProperty;

public class CodeTableItem {

    @JsonProperty("id")
    private String id;

    @JsonProperty("table_code")
    private String tableCode;

    @JsonProperty("item_code")
    private String itemCode;

    @JsonProperty("item_label")
    private String itemLabel;

    @JsonProperty("description")
    private String description;

    @JsonProperty("sort_order")
    private int sortOrder;

    @JsonProperty("active")
    private boolean active = true;

    @JsonProperty("created_at")
    private Instant createdAt;

    @JsonProperty("updated_at")
    private Instant updatedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getTableCode() { return tableCode; }
    public void setTableCode(String tableCode) { this.tableCode = tableCode; }

    public String getItemCode() { return itemCode; }
    public void setItemCode(String itemCode) { this.itemCode = itemCode; }

    public String getItemLabel() { return itemLabel; }
    public void setItemLabel(String itemLabel) { this.itemLabel = itemLabel; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }

    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
