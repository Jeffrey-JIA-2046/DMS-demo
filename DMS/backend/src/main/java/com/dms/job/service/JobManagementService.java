package com.dms.job.service;

import java.time.Clock;
import java.time.Instant;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;

import jakarta.annotation.PostConstruct;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.scheduling.support.CronTrigger;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.dms.job.dto.JobScheduleRequest;
import com.dms.job.dto.JobScheduleResponse;
import com.dms.job.model.JobSchedule;
import com.dms.job.model.JobType;
import com.dms.job.repository.JobScheduleRepository;
import com.dms.reminder.dto.ReminderSweepResponse;
import com.dms.reminder.service.ReminderManagementService;
import com.dms.retention.dto.RetentionSweepResponse;
import com.dms.retention.service.RetentionManagementService;

@Service
public class JobManagementService {

    private static final Logger log = LoggerFactory.getLogger(JobManagementService.class);

    private final JobScheduleRepository repository;
    private final TaskScheduler scheduler;
    private final RetentionManagementService retentionManagementService;
    private final ReminderManagementService reminderManagementService;
    private final Clock clock;
    private final Map<JobType, String> defaultCrons;
    private final Map<JobType, ScheduledFuture<?>> futures = new ConcurrentHashMap<>();

    public JobManagementService(
        JobScheduleRepository repository,
        @Qualifier("jobTaskScheduler") TaskScheduler scheduler,
        RetentionManagementService retentionManagementService,
        ReminderManagementService reminderManagementService,
        @Value("${app.retention.cron:0 0 2 * * *}") String retentionCron,
        @Value("${app.reminder.cron:0 15 2 * * *}") String reminderCron,
        Clock clock
    ) {
        this.repository = repository;
        this.scheduler = scheduler;
        this.retentionManagementService = retentionManagementService;
        this.reminderManagementService = reminderManagementService;
        this.clock = clock;
        this.defaultCrons = new EnumMap<>(JobType.class);
        this.defaultCrons.put(JobType.RETENTION_SWEEP, retentionCron);
        this.defaultCrons.put(JobType.REMINDER_SWEEP, reminderCron);
    }

    @PostConstruct
    public void initializeSchedules() {
        for (JobType jobType : JobType.values()) {
            JobSchedule schedule = repository.findByJobType(jobType).orElseGet(() -> createDefault(jobType));
            scheduleJob(schedule);
        }
    }

    public List<JobScheduleResponse> listSchedules() {
        return repository.findAll().stream().map(this::toResponse).toList();
    }

    @Transactional
    public JobScheduleResponse updateSchedule(JobType jobType, JobScheduleRequest request) {
        String cron = normalizeAndValidateCron(request.cronExpression());
        JobSchedule schedule = repository.findByJobType(jobType).orElseGet(() -> createDefault(jobType));
        schedule.setCronExpression(cron);
        schedule.setEnabled(request.enabled());
        JobSchedule saved = repository.save(schedule);
        scheduleJob(saved);
        return toResponse(saved);
    }

    @Transactional
    public JobScheduleResponse runNow(JobType jobType) {
        executeJob(jobType);
        JobSchedule latest = repository.findByJobType(jobType).orElseThrow(() -> new IllegalArgumentException("Job schedule not found"));
        return toResponse(latest);
    }

    private void scheduleJob(JobSchedule schedule) {
        ScheduledFuture<?> existing = futures.remove(schedule.getJobType());
        if (existing != null) {
            existing.cancel(false);
        }

        if (!schedule.isEnabled()) {
            return;
        }

        ScheduledFuture<?> future = scheduler.schedule(
            () -> executeJob(schedule.getJobType()),
            new CronTrigger(schedule.getCronExpression())
        );
        futures.put(schedule.getJobType(), future);
    }

    private void executeJob(JobType jobType) {
        JobSchedule schedule = repository.findByJobType(jobType).orElseGet(() -> createDefault(jobType));
        Instant runAt = Instant.now(clock);
        try {
            String message;
            if (jobType == JobType.RETENTION_SWEEP) {
                RetentionSweepResponse summary = retentionManagementService.runDisposalSweep();
                message = "Disposed " + summary.disposedDocuments() + " / scanned " + summary.scannedDocuments();
            } else if (jobType == JobType.REMINDER_SWEEP) {
                ReminderSweepResponse summary = reminderManagementService.runReminderSweep();
                message = "Updated " + summary.tasksUpserted() + " / scanned " + summary.scannedDocuments();
            } else {
                throw new IllegalArgumentException("Unsupported job type: " + jobType);
            }
            schedule.setLastRunAt(runAt);
            schedule.setLastStatus("SUCCESS");
            schedule.setLastMessage(message);
            repository.save(schedule);
            log.info("Job {} finished: {}", jobType.name(), message);
        } catch (Exception ex) {
            schedule.setLastRunAt(runAt);
            schedule.setLastStatus("FAILED");
            schedule.setLastMessage(trimMessage(ex.getMessage()));
            repository.save(schedule);
            log.error("Job {} failed", jobType.name(), ex);
        }
    }

    private JobSchedule createDefault(JobType jobType) {
        JobSchedule schedule = new JobSchedule();
        schedule.setJobType(jobType);
        schedule.setCronExpression(normalizeAndValidateCron(defaultCrons.get(jobType)));
        schedule.setEnabled(true);
        return repository.save(schedule);
    }

    private String normalizeAndValidateCron(String cron) {
        String normalized = cron == null ? "" : cron.trim();
        if (normalized.isEmpty()) {
            throw new IllegalArgumentException("Cron expression is required");
        }
        CronExpression.parse(normalized);
        return normalized;
    }

    private String trimMessage(String message) {
        if (message == null || message.isBlank()) {
            return "Execution failed";
        }
        return message.length() > 240 ? message.substring(0, 240) : message;
    }

    private JobScheduleResponse toResponse(JobSchedule schedule) {
        return new JobScheduleResponse(
            schedule.getJobType().name(),
            toDisplayName(schedule.getJobType()),
            schedule.getCronExpression(),
            schedule.isEnabled(),
            schedule.getUpdatedAt(),
            schedule.getLastRunAt(),
            schedule.getLastStatus(),
            schedule.getLastMessage()
        );
    }

    private String toDisplayName(JobType jobType) {
        return switch (jobType) {
            case RETENTION_SWEEP -> "Retention Sweep";
            case REMINDER_SWEEP -> "Reminder Sweep";
        };
    }
}
