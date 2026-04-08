package com.dms.job.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import javax.sql.DataSource;

import org.springframework.stereotype.Repository;

import com.dms.job.model.JobSchedule;
import com.dms.job.model.JobType;

@Repository
public class JobScheduleRepository {

    private final DataSource dataSource;
    private final Map<JobType, JobSchedule> memoryStore = new ConcurrentHashMap<>();

    public JobScheduleRepository(DataSource dataSource) {
        this.dataSource = dataSource;
        ensureTable();
    }

    public List<JobSchedule> findAll() {
        if (dataSource == null) {
            return memoryStore.values().stream()
                .sorted(Comparator.comparing(it -> it.getJobType().name()))
                .map(this::cloneSchedule)
                .toList();
        }

        String sql = "SELECT job_key, cron_expression, enabled, updated_at, last_run_at, last_status, last_message FROM system_job_schedules ORDER BY job_key";
        List<JobSchedule> result = new ArrayList<>();
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement(sql);
             var rs = ps.executeQuery()) {
            while (rs.next()) {
                result.add(mapRow(rs));
            }
            return result;
        } catch (SQLException ex) {
            throw new RuntimeException("Failed to load job schedules", ex);
        }
    }

    public Optional<JobSchedule> findByJobType(JobType jobType) {
        if (dataSource == null) {
            JobSchedule found = memoryStore.get(jobType);
            return Optional.ofNullable(found == null ? null : cloneSchedule(found));
        }

        String sql = "SELECT job_key, cron_expression, enabled, updated_at, last_run_at, last_status, last_message FROM system_job_schedules WHERE job_key=?";
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement(sql)) {
            ps.setString(1, jobType.name());
            try (var rs = ps.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(mapRow(rs));
                }
                return Optional.empty();
            }
        } catch (SQLException ex) {
            throw new RuntimeException("Failed to load job schedule", ex);
        }
    }

    public JobSchedule save(JobSchedule schedule) {
        if (dataSource == null) {
            JobSchedule copy = cloneSchedule(schedule);
            copy.setUpdatedAt(Instant.now());
            memoryStore.put(copy.getJobType(), copy);
            return cloneSchedule(copy);
        }

        String sql = "INSERT INTO system_job_schedules(job_key, cron_expression, enabled, updated_at, last_run_at, last_status, last_message) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?) "
            + "ON DUPLICATE KEY UPDATE cron_expression=VALUES(cron_expression), enabled=VALUES(enabled), updated_at=CURRENT_TIMESTAMP, last_run_at=VALUES(last_run_at), last_status=VALUES(last_status), last_message=VALUES(last_message)";
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement(sql)) {
            ps.setString(1, schedule.getJobType().name());
            ps.setString(2, schedule.getCronExpression());
            ps.setBoolean(3, schedule.isEnabled());
            if (schedule.getLastRunAt() != null) {
                ps.setTimestamp(4, Timestamp.from(schedule.getLastRunAt()));
            } else {
                ps.setTimestamp(4, null);
            }
            ps.setString(5, schedule.getLastStatus());
            ps.setString(6, schedule.getLastMessage());
            ps.executeUpdate();
        } catch (SQLException ex) {
            throw new RuntimeException("Failed to save job schedule", ex);
        }

        return findByJobType(schedule.getJobType()).orElseThrow(() -> new RuntimeException("Failed to load saved job schedule"));
    }

    private void ensureTable() {
        if (dataSource == null) {
            return;
        }
        String ddl = "CREATE TABLE IF NOT EXISTS system_job_schedules ("
            + "job_key VARCHAR(64) NOT NULL PRIMARY KEY,"
            + "cron_expression VARCHAR(64) NOT NULL,"
            + "enabled BOOLEAN NOT NULL DEFAULT TRUE,"
            + "updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
            + "last_run_at TIMESTAMP NULL,"
            + "last_status VARCHAR(32) NULL,"
            + "last_message VARCHAR(255) NULL"
            + ")";
        try (var conn = dataSource.getConnection();
             Statement st = conn.createStatement()) {
            st.execute(ddl);
        } catch (SQLException ex) {
            throw new RuntimeException("Failed to ensure system_job_schedules table", ex);
        }
    }

    private JobSchedule mapRow(ResultSet rs) throws SQLException {
        JobSchedule schedule = new JobSchedule();
        schedule.setJobType(JobType.fromKey(rs.getString("job_key")));
        schedule.setCronExpression(rs.getString("cron_expression"));
        schedule.setEnabled(rs.getBoolean("enabled"));
        Timestamp updatedAt = rs.getTimestamp("updated_at");
        schedule.setUpdatedAt(updatedAt == null ? null : updatedAt.toInstant());
        Timestamp lastRunAt = rs.getTimestamp("last_run_at");
        schedule.setLastRunAt(lastRunAt == null ? null : lastRunAt.toInstant());
        schedule.setLastStatus(rs.getString("last_status"));
        schedule.setLastMessage(rs.getString("last_message"));
        return schedule;
    }

    private JobSchedule cloneSchedule(JobSchedule source) {
        JobSchedule clone = new JobSchedule();
        clone.setJobType(source.getJobType());
        clone.setCronExpression(source.getCronExpression());
        clone.setEnabled(source.isEnabled());
        clone.setUpdatedAt(source.getUpdatedAt());
        clone.setLastRunAt(source.getLastRunAt());
        clone.setLastStatus(source.getLastStatus());
        clone.setLastMessage(source.getLastMessage());
        return clone;
    }
}
