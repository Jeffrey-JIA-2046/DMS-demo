INSERT INTO dms.audit_logs (`action`,created_at,details,document_id,performed_by) VALUES
	 ('ARCHIVE','2026-03-03 06:18:54.203069','permanent=false',1,'admin@example.com'),
	 ('CREATE','2026-03-04 09:19:39.135249','created document',5,'gloria'),
	 ('CREATE','2026-03-04 09:22:34.778076','created document',6,'gloria'),
	 ('UPDATE','2026-03-10 02:00:09.997568','updated metadata',5,'gloria'),
	 ('UPDATE','2026-03-10 02:07:36.530314','updated metadata',3,'gloria'),
	 ('UPDATE','2026-03-10 02:07:44.816590','updated metadata',2,'gloria'),
	 ('UPDATE','2026-03-11 03:36:32.091002','updated metadata',6,'gloria'),
	 ('CREATE','2026-03-18 02:45:40.388317','created document',7,'gloria'),
	 ('CREATE','2026-03-18 04:08:34.898457','created document',8,'gloria'),
	 ('DELETE','2026-03-18 04:09:28.778300','permanent=true',8,'gloria');
INSERT INTO dms.audit_logs (`action`,created_at,details,document_id,performed_by) VALUES
	 ('DELETE','2026-03-18 04:09:37.693966','permanent=true',7,'gloria'),
	 ('CREATE','2026-03-18 04:16:07.806647','created document',9,'gloria'),
	 ('CREATE','2026-03-18 04:20:20.229547','created document',10,'gloria'),
	 ('CREATE','2026-03-18 04:27:40.383312','created document',11,'gloria'),
	 ('CREATE','2026-03-18 04:28:24.209439','created document',12,'gloria'),
	 ('CREATE','2026-03-18 04:46:02.785983','created document',13,'gloria'),
	 ('CREATE','2026-03-18 04:49:42.536255','created document',14,'gloria'),
	 ('CREATE','2026-04-01 09:51:14.286871','created document',17,'gloria'),
	 ('UPDATE','2026-04-02 02:16:36.664340','updated metadata',3,'gloria'),
	 ('UPDATE','2026-04-02 02:20:24.595483','updated metadata',5,'gloria');
INSERT INTO dms.audit_logs (`action`,created_at,details,document_id,performed_by) VALUES
	 ('CREATE','2026-04-02 09:50:15.588553','created document',18,'sysadmin'),
	 ('CREATE','2026-04-02 09:50:16.110963','created document',19,'sysadmin'),
	 ('REJECT','2026-04-02 09:50:17.607489','document rejected',18,'docadmin'),
	 ('CREATE','2026-04-02 09:53:56.480850','created document',20,'sysadmin'),
	 ('CREATE','2026-04-02 09:53:56.873350','created document',21,'sysadmin'),
	 ('UPDATE','2026-04-02 09:53:57.610237','updated metadata',21,'sysadmin'),
	 ('REJECT','2026-04-02 09:53:58.116401','document rejected',20,'docadmin'),
	 ('CREATE','2026-04-02 10:27:38.027298','created document',22,'gloria'),
	 ('APPROVE','2026-04-02 10:32:05.751580','document approved',22,'lucy'),
	 ('UPDATE','2026-04-02 10:55:45.442899','updated metadata',22,'gloria');
INSERT INTO dms.audit_logs (`action`,created_at,details,document_id,performed_by) VALUES
	 ('CREATE','2026-04-09 06:43:09.673585','created document',23,'sysadmin'),
	 ('CREATE','2026-04-09 06:52:40.787341','created document',24,'gloria'),
	 ('CREATE','2026-04-09 06:58:51.198658','created document',26,'gloria'),
	 ('DELETE','2026-04-09 07:07:27.342309','permanent=true',26,'gloria'),
	 ('DELETE','2026-04-09 07:07:31.476491','permanent=true',24,'gloria'),
	 ('DELETE','2026-04-09 07:07:37.934209','permanent=true',23,'gloria'),
	 ('CREATE','2026-04-09 07:09:43.335813','created document',27,'sysadmin'),
	 ('CREATE','2026-04-09 07:11:58.058065','created document',28,'gloria'),
	 ('CREATE','2026-04-09 07:17:37.252622','created document',29,'gloria'),
	 ('CREATE','2026-04-09 07:27:39.207816','created document',30,'gloria');
