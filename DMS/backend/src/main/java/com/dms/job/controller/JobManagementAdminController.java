package com.dms.job.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.dms.job.dto.JobScheduleRequest;
import com.dms.job.dto.JobScheduleResponse;
import com.dms.job.model.JobType;
import com.dms.job.service.JobManagementService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/admin/job-schedules")
public class JobManagementAdminController {

    private final JobManagementService jobManagementService;

    public JobManagementAdminController(JobManagementService jobManagementService) {
        this.jobManagementService = jobManagementService;
    }

    @GetMapping
    public List<JobScheduleResponse> listSchedules() {
        return jobManagementService.listSchedules();
    }

    @PutMapping("/{jobKey}")
    @ResponseStatus(HttpStatus.OK)
    public JobScheduleResponse updateSchedule(@PathVariable String jobKey, @Valid @RequestBody JobScheduleRequest request) {
        return jobManagementService.updateSchedule(JobType.fromKey(jobKey), request);
    }

    @PostMapping("/{jobKey}/run")
    @ResponseStatus(HttpStatus.OK)
    public JobScheduleResponse runNow(@PathVariable String jobKey) {
        return jobManagementService.runNow(JobType.fromKey(jobKey));
    }
}
