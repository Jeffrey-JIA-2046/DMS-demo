-- Add inheritance flags used by child folders.
-- Safe to run against databases where either column already exists.

SET @db = DATABASE();

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'document_folders'
    AND column_name = 'metadata_template_inherited'
);
SET @stmt := IF(@has_col = 0,
  'ALTER TABLE document_folders ADD COLUMN metadata_template_inherited BOOLEAN NOT NULL DEFAULT FALSE',
  'SELECT "metadata_template_inherited exists"');
PREPARE s1 FROM @stmt; EXECUTE s1; DEALLOCATE PREPARE s1;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'document_folders'
    AND column_name = 'permissions_inherited'
);
SET @stmt := IF(@has_col = 0,
  'ALTER TABLE document_folders ADD COLUMN permissions_inherited BOOLEAN NOT NULL DEFAULT FALSE',
  'SELECT "permissions_inherited exists"');
PREPARE s2 FROM @stmt; EXECUTE s2; DEALLOCATE PREPARE s2;

SHOW COLUMNS FROM document_folders LIKE 'metadata_template_inherited';
SHOW COLUMNS FROM document_folders LIKE 'permissions_inherited';
