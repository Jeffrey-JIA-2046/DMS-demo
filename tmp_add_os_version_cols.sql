SET @db = DATABASE();

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'document_versions' AND column_name = 'os_document_id'
);
SET @stmt := IF(@has_col = 0,
  'ALTER TABLE document_versions ADD COLUMN os_document_id VARCHAR(64) NULL',
  'SELECT "os_document_id exists"');
PREPARE s1 FROM @stmt; EXECUTE s1; DEALLOCATE PREPARE s1;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'document_versions' AND column_name = 'os_version_id'
);
SET @stmt := IF(@has_col = 0,
  'ALTER TABLE document_versions ADD COLUMN os_version_id VARCHAR(64) NULL',
  'SELECT "os_version_id exists"');
PREPARE s2 FROM @stmt; EXECUTE s2; DEALLOCATE PREPARE s2;

SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'document_versions' AND index_name = 'idx_document_versions_os_document_id'
);
SET @stmt := IF(@has_idx = 0,
  'CREATE INDEX idx_document_versions_os_document_id ON document_versions(os_document_id)',
  'SELECT "idx_document_versions_os_document_id exists"');
PREPARE s3 FROM @stmt; EXECUTE s3; DEALLOCATE PREPARE s3;

SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'document_versions' AND index_name = 'uk_document_versions_os_version_id'
);
SET @stmt := IF(@has_idx = 0,
  'CREATE UNIQUE INDEX uk_document_versions_os_version_id ON document_versions(os_version_id)',
  'SELECT "uk_document_versions_os_version_id exists"');
PREPARE s4 FROM @stmt; EXECUTE s4; DEALLOCATE PREPARE s4;

SHOW COLUMNS FROM document_versions LIKE 'os_document_id';
SHOW COLUMNS FROM document_versions LIKE 'os_version_id';
