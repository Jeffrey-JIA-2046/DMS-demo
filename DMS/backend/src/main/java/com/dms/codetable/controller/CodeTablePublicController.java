package com.dms.codetable.controller;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.dms.codetable.dto.CodeTableItemResponse;
import com.dms.codetable.service.CodeTableService;

@RestController
@RequestMapping("/api/code-tables")
public class CodeTablePublicController {

    private final CodeTableService codeTableService;

    public CodeTablePublicController(CodeTableService codeTableService) {
        this.codeTableService = codeTableService;
    }

    @GetMapping("/{tableCode}")
    public List<CodeTableItemResponse> listActiveItems(@PathVariable String tableCode) {
        return codeTableService.listActiveItems(tableCode);
    }
}
