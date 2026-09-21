INSERT INTO dms.documents (category,created_at,description,owner,status,title,updated_at,folder_id,approval_decided_at,approval_requested_at,approver_id,supervisor_id) VALUES
	 ('Corp Sec','2026-03-02 08:30:49.952323','','Jeffrey','ARCHIVED','gf200','2026-03-03 06:18:54.170643',4,NULL,NULL,NULL,NULL),
	 ('Corp Sec','2026-03-02 08:32:48.880792','','Ron','ACTIVE','ccc','2026-03-10 02:07:44.586694',6,NULL,NULL,NULL,NULL),
	 ('Corp Sec','2026-03-02 08:55:30.140608','The guide of how to renew a license from HKIA.','Andrew','ACTIVE','111','2026-04-02 02:16:36.165241',2,NULL,NULL,NULL,NULL),
	 ('Corp Sec','2026-03-04 09:19:38.265413','The guide of how to dispose document after a certain retention period','Jeffrey','ACTIVE','test custom','2026-04-02 02:20:23.621202',6,NULL,NULL,NULL,NULL),
	 ('Corp Sec','2026-03-04 09:22:33.955039','','Ron','ACTIVE','CC111.pdf','2026-03-11 03:36:31.713856',8,NULL,NULL,NULL,NULL),
	 ('Corp Sec','2026-03-18 04:16:07.384359','','Chan Tai Man','DRAFT','certification','2026-03-18 04:16:07.384359',5,NULL,'2026-03-18 04:16:07.384359',4,NULL),
	 ('Corp Sec','2026-03-18 04:20:20.093547','','Chan Tai Man','DRAFT','HKIA certification','2026-03-18 04:20:20.093547',7,NULL,'2026-03-18 04:20:20.093547',4,NULL),
	 ('Corp Sec','2026-03-18 04:27:40.309456','','Chan Tai Man','DRAFT','HKIA certificate','2026-03-18 04:27:40.309456',9,NULL,'2026-03-18 04:27:40.309456',4,NULL),
	 ('Corp Sec','2026-03-18 04:28:24.141406','','Chan Tai Man','DRAFT','SFC Certificate','2026-04-01 04:29:06.038504',9,NULL,'2026-04-01 04:29:06.038504',4,NULL),
	 ('Corp Sec','2026-03-18 04:46:02.618024','','Capital Limited','ACTIVE','SFC licence (corporate)','2026-04-01 04:05:46.244515',9,'2026-04-01 04:05:46.244515','2026-03-18 04:46:02.618024',4,NULL);
INSERT INTO dms.documents (category,created_at,description,owner,status,title,updated_at,folder_id,approval_decided_at,approval_requested_at,approver_id,supervisor_id) VALUES
	 ('Corp Sec','2026-03-18 04:49:42.475992','','Somebody','ACTIVE','HKIA Licence','2026-04-01 04:05:41.447573',9,'2026-04-01 04:05:41.447573','2026-03-18 04:49:42.475992',4,NULL),
	 ('Corp Sec','2026-03-24 02:42:23.904646','','Jeffrey','DRAFT','ttt','2026-03-24 02:42:23.904646',2,NULL,'2026-03-24 02:42:23.904646',4,NULL),
	 ('Corp Sec','2026-04-01 03:59:23.259941','','Gloria','ACTIVE','Workflows','2026-04-01 04:05:27.973850',8,'2026-04-01 04:05:27.973850','2026-04-01 03:59:23.259941',4,NULL),
	 ('LIC','2026-04-01 09:51:13.655715','','gloria','DRAFT','HKIC_LIC','2026-04-01 09:51:13.655715',8,NULL,'2026-04-01 09:51:13.655715',4,NULL),
	 ('SMOKE_REM_20260402175014','2026-04-02 09:50:15.064998','smoke','sysadmin','REJECTED','Smoke Rem Reject 175014','2026-04-02 09:53:58.394134',24,'2026-04-02 09:50:16.581329','2026-04-02 09:50:15.064998',9,8),
	 ('SMOKE_RET_20260402175014','2026-04-02 09:50:15.736160','smoke','sysadmin','DRAFT','Smoke Ret 175014','2026-04-02 09:50:15.736160',24,NULL,'2026-04-02 09:50:15.736160',9,8),
	 ('SMOKE_REM_20260402175356','2026-04-02 09:53:56.195720','smoke','sysadmin','REJECTED','Smoke Rem Reject 175356','2026-04-02 09:53:58.716678',24,'2026-04-02 09:53:57.795550','2026-04-02 09:53:56.195720',9,8),
	 ('SMOKE_RET_20260402175356','2026-04-02 09:53:56.577294','smoke','sysadmin','DRAFT','Smoke Ret 175356','2026-04-02 09:53:57.355658',24,NULL,'2026-04-02 09:53:56.577294',9,8),
	 ('CORP_SEC','2026-04-02 10:27:37.411893','','gloria','ACTIVE','Exibition','2026-04-02 10:55:44.932179',5,'2015-04-02 10:32:05.261865','2026-04-02 10:27:37.411893',4,4),
	 ('A01EN03','2026-04-09 07:09:42.826738','pdf mime check','sysadmin','DRAFT','Preview MIME Smoke','2026-04-09 07:09:42.826738',25,NULL,'2026-04-09 07:09:42.826738',2,2);
INSERT INTO dms.documents (category,created_at,description,owner,status,title,updated_at,folder_id,approval_decided_at,approval_requested_at,approver_id,supervisor_id) VALUES
	 ('GF200 Single Page','2026-04-09 07:11:57.428677','GF200 Single Page','Gloria Mendez','DRAFT','IMP_A01EN03_20260409151157296','2026-04-09 07:11:57.428677',25,NULL,'2026-04-09 07:11:57.428677',2,1),
	 ('GF200 Single Page','2026-04-09 07:17:35.524300','GF200 Single Page','Gloria Mendez','DRAFT','Kofax_20260409151735388','2026-04-09 07:17:35.524300',25,NULL,'2026-04-09 07:17:35.524300',2,1),
	 ('GF200 Single Page','2026-04-09 07:27:37.881860','GF200 Single Page','Gloria Mendez','DRAFT','Kofax_20260409152737553','2026-04-09 07:27:37.881860',25,NULL,'2026-04-09 07:27:37.881860',2,1);
