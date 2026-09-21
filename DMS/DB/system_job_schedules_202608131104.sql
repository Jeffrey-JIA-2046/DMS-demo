INSERT INTO dms.system_job_schedules (job_key,cron_expression,enabled,updated_at,last_run_at,last_status,last_message) VALUES
	 ('REMINDER_SWEEP','0 15 2 * * *',1,'2026-08-12 02:15:07','2026-08-11 18:15:00','SUCCESS','Updated 7 / scanned 7'),
	 ('RETENTION_SWEEP','0 0 2 * * *',1,'2026-08-12 02:00:53','2026-08-11 18:00:53','SUCCESS','Disposed 0 / scanned 6');
