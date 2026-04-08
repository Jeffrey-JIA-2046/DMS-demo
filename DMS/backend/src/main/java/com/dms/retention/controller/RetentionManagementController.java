package com.dms.retention.controller;

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

import com.dms.retention.dto.RetentionRuleRequest;
import com.dms.retention.dto.RetentionRuleResponse;
import com.dms.retention.dto.RetentionSweepResponse;
import com.dms.retention.service.RetentionManagementService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/admin/retention-rules")
public class RetentionManagementController {

    private final RetentionManagementService retentionManagementService;

    public RetentionManagementController(RetentionManagementService retentionManagementService) {
        this.retentionManagementService = retentionManagementService;
    }

    @GetMapping
    public List<RetentionRuleResponse> listRules() {
        return retentionManagementService.listRules();
    }

    @GetMapping("/categories")
    public List<String> listCategories() {
        return retentionManagementService.listDocumentCategories();
    }

    @PostMapping
    public RetentionRuleResponse createRule(@RequestBody @Valid RetentionRuleRequest request) {
        return retentionManagementService.createRule(request);
    }

    @PutMapping("/{id}")
    public RetentionRuleResponse updateRule(@PathVariable String id, @RequestBody @Valid RetentionRuleRequest request) {
        return retentionManagementService.updateRule(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteRule(@PathVariable String id) {
        retentionManagementService.deleteRule(id);
    }

    @PostMapping("/sweep")
    public RetentionSweepResponse runSweepNow() {
        return retentionManagementService.runDisposalSweep();
    }
}
