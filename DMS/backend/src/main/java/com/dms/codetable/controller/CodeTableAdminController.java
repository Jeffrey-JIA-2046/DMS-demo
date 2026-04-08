package com.dms.codetable.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.dms.codetable.dto.CodeTableItemRequest;
import com.dms.codetable.dto.CodeTableItemResponse;
import com.dms.codetable.service.CodeTableService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/admin/code-tables")
public class CodeTableAdminController {

    private final CodeTableService codeTableService;

    public CodeTableAdminController(CodeTableService codeTableService) {
        this.codeTableService = codeTableService;
    }

    @GetMapping
    public List<String> listTableCodes() {
        return codeTableService.listTableCodes();
    }

    @GetMapping("/{tableCode}")
    public List<CodeTableItemResponse> listItems(@PathVariable String tableCode) {
        return codeTableService.listItems(tableCode);
    }

    @PostMapping("/{tableCode}")
    @ResponseStatus(HttpStatus.CREATED)
    public CodeTableItemResponse createItem(@PathVariable String tableCode, @RequestBody @Valid CodeTableItemRequest request) {
        return codeTableService.createItem(tableCode, request);
    }

    @PutMapping("/{tableCode}/{id}")
    public CodeTableItemResponse updateItem(@PathVariable String tableCode, @PathVariable String id,
                                             @RequestBody @Valid CodeTableItemRequest request) {
        return codeTableService.updateItem(tableCode, id, request);
    }

    @DeleteMapping("/{tableCode}/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteItem(@PathVariable String tableCode, @PathVariable String id) {
        codeTableService.deleteItem(tableCode, id);
    }
}
