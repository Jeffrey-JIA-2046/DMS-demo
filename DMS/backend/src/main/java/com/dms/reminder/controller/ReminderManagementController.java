package com.dms.reminder.controller;

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

import com.dms.reminder.dto.ReminderRuleRequest;
import com.dms.reminder.dto.ReminderRuleResponse;
import com.dms.reminder.dto.ReminderSweepResponse;
import com.dms.reminder.service.ReminderManagementService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/admin/reminder-rules")
public class ReminderManagementController {

    private final ReminderManagementService reminderManagementService;

    public ReminderManagementController(ReminderManagementService reminderManagementService) {
        this.reminderManagementService = reminderManagementService;
    }

    @GetMapping
    public List<ReminderRuleResponse> listRules() {
        return reminderManagementService.listRules();
    }

    @GetMapping("/categories")
    public List<String> listCategories() {
        return reminderManagementService.listDocumentCategories();
    }

    @PostMapping
    public ReminderRuleResponse createRule(@RequestBody @Valid ReminderRuleRequest request) {
        return reminderManagementService.createRule(request);
    }

    @PutMapping("/{id}")
    public ReminderRuleResponse updateRule(@PathVariable String id, @RequestBody @Valid ReminderRuleRequest request) {
        return reminderManagementService.updateRule(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteRule(@PathVariable String id) {
        reminderManagementService.deleteRule(id);
    }

    @PostMapping("/sweep")
    public ReminderSweepResponse runSweepNow() {
        return reminderManagementService.runReminderSweep();
    }
}
