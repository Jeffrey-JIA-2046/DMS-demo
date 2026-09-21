INSERT INTO dms.folder_metadata_fields (folder_id,field_hint,field_key,field_label,is_required,field_type,field_order,code_table_code) VALUES
	 (6,NULL,'hkid','HKID',1,'TEXT',0,NULL),
	 (6,NULL,'dob','Date of Birth',1,'DATE',1,NULL),
	 (7,'Unique Number','audit_case_no','Audit Case Number',1,'TEXT',0,NULL),
	 (8,NULL,'compliance_case_id','Compliance Case Number',1,'TEXT',0,NULL),
	 (8,NULL,'counter_part','Counter Part',0,'TEXT',1,NULL),
	 (8,NULL,'valid_until','Valid Until',0,'DATE',2,NULL),
	 (9,NULL,'cert_owner','Certificate Owner Name',0,'TEXT',0,NULL),
	 (9,NULL,'date_of_cert','Date of Certified',0,'TEXT',1,NULL),
	 (9,NULL,'hkid','Hong Kong ID',0,'TEXT',2,NULL),
	 (22,'Unique Number','audit_case_no','Audit Case Number',1,'TEXT',0,NULL);
INSERT INTO dms.folder_metadata_fields (folder_id,field_hint,field_key,field_label,is_required,field_type,field_order,code_table_code) VALUES
	 (25,NULL,'employee_number','Emp. No.',0,'TEXT',0,NULL),
	 (25,NULL,'doc_type','Document Type',0,'TEXT',1,NULL);
