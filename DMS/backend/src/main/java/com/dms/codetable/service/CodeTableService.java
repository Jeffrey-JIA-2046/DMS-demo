package com.dms.codetable.service;

import java.io.IOException;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.dms.codetable.dto.CodeTableItemRequest;
import com.dms.codetable.dto.CodeTableItemResponse;
import com.dms.codetable.model.CodeTableItem;
import com.dms.codetable.repository.CodeTableRepository;
import com.dms.exception.ResourceNotFoundException;

@Service
public class CodeTableService {

    private final CodeTableRepository repository;

    public CodeTableService(CodeTableRepository repository) {
        this.repository = repository;
    }

    public List<String> listTableCodes() {
        try {
            return repository.findAllTableCodes();
        } catch (IOException ex) {
            throw new RuntimeException("Failed to list code table codes", ex);
        }
    }

    public List<CodeTableItemResponse> listItems(String tableCode) {
        validateTableCode(tableCode);
        try {
            return repository.findByTableCode(tableCode).stream()
                .map(this::toResponse)
                .toList();
        } catch (IOException ex) {
            throw new RuntimeException("Failed to list code table items", ex);
        }
    }

    public List<CodeTableItemResponse> listActiveItems(String tableCode) {
        validateTableCode(tableCode);
        try {
            return repository.findActiveByTableCode(tableCode).stream()
                .map(this::toResponse)
                .toList();
        } catch (IOException ex) {
            throw new RuntimeException("Failed to list active code table items", ex);
        }
    }

    public CodeTableItemResponse createItem(String tableCode, CodeTableItemRequest request) {
        validateTableCode(tableCode);
        CodeTableItem item = new CodeTableItem();
        item.setTableCode(tableCode.trim().toUpperCase());
        applyRequest(item, request);
        try {
            return toResponse(repository.save(item));
        } catch (IOException ex) {
            throw new RuntimeException("Failed to create code table item", ex);
        }
    }

    public CodeTableItemResponse updateItem(String tableCode, String id, CodeTableItemRequest request) {
        validateTableCode(tableCode);
        try {
            CodeTableItem item = repository.findById(id)
                .filter(i -> tableCode.trim().equalsIgnoreCase(i.getTableCode()))
                .orElseThrow(() -> new ResourceNotFoundException("Code table item not found: " + id));
            applyRequest(item, request);
            return toResponse(repository.save(item));
        } catch (IOException ex) {
            throw new RuntimeException("Failed to update code table item", ex);
        }
    }

    public void deleteItem(String tableCode, String id) {
        validateTableCode(tableCode);
        try {
            repository.findById(id)
                .filter(i -> tableCode.trim().equalsIgnoreCase(i.getTableCode()))
                .orElseThrow(() -> new ResourceNotFoundException("Code table item not found: " + id));
            repository.deleteById(id);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to delete code table item", ex);
        }
    }

    private void applyRequest(CodeTableItem item, CodeTableItemRequest request) {
        item.setItemCode(request.itemCode().trim().toUpperCase());
        item.setItemLabel(request.itemLabel().trim());
        item.setDescription(StringUtils.hasText(request.description()) ? request.description().trim() : null);
        item.setSortOrder(request.sortOrder());
        item.setActive(request.active());
    }

    private void validateTableCode(String tableCode) {
        if (!StringUtils.hasText(tableCode)) {
            throw new IllegalArgumentException("Table code is required");
        }
    }

    private CodeTableItemResponse toResponse(CodeTableItem item) {
        return new CodeTableItemResponse(
            item.getId(),
            item.getTableCode(),
            item.getItemCode(),
            item.getItemLabel(),
            item.getDescription(),
            item.getSortOrder(),
            item.isActive(),
            item.getCreatedAt(),
            item.getUpdatedAt()
        );
    }
}
