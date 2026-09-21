$ErrorActionPreference = 'Stop'

# OpenSearch connection settings
$osUser = 'admin'
$osPass = 'ASLgemini916'
$osUrl = 'https://localhost:9200/dms-documents-a/_search'

# MySQL connection settings
$mysqlArgs = @('-h', 'localhost', '-u', 'root', '-pP@ssw0rd', '-D', 'dms')

$authPair = "${osUser}:${osPass}"
$basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($authPair))
$headers = @{ Authorization = "Basic $basic" }
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

# Ensure mapping columns/indexes exist
$schemaSql = @"
SET @db = DATABASE();
SET @has_col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db AND table_name = 'document_versions' AND column_name = 'os_document_id');
SET @stmt := IF(@has_col = 0, 'ALTER TABLE document_versions ADD COLUMN os_document_id VARCHAR(64) NULL', 'SELECT ''os_document_id exists''');
PREPARE s1 FROM @stmt; EXECUTE s1; DEALLOCATE PREPARE s1;
SET @has_col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db AND table_name = 'document_versions' AND column_name = 'os_version_id');
SET @stmt := IF(@has_col = 0, 'ALTER TABLE document_versions ADD COLUMN os_version_id VARCHAR(64) NULL', 'SELECT ''os_version_id exists''');
PREPARE s2 FROM @stmt; EXECUTE s2; DEALLOCATE PREPARE s2;
SET @has_idx := (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = @db AND table_name = 'document_versions' AND index_name = 'idx_document_versions_os_document_id');
SET @stmt := IF(@has_idx = 0, 'CREATE INDEX idx_document_versions_os_document_id ON document_versions(os_document_id)', 'SELECT ''idx_document_versions_os_document_id exists''');
PREPARE s3 FROM @stmt; EXECUTE s3; DEALLOCATE PREPARE s3;
SET @has_idx := (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = @db AND table_name = 'document_versions' AND index_name = 'uk_document_versions_os_version_id');
SET @stmt := IF(@has_idx = 0, 'CREATE UNIQUE INDEX uk_document_versions_os_version_id ON document_versions(os_version_id)', 'SELECT ''uk_document_versions_os_version_id exists''');
PREPARE s4 FROM @stmt; EXECUTE s4; DEALLOCATE PREPARE s4;
"@
& mysql @mysqlArgs --execute=$schemaSql | Out-Null

$bodyObj = @{
    size = 1000
    _source = @('id', 'versions.id', 'versions.version_number', 'versions.file_name', 'versions.content_type', 'versions.size_bytes', 'versions.created_at', 'versions.content')
    query = @{ match_all = @{} }
}
$body = $bodyObj | ConvertTo-Json -Depth 10
$response = Invoke-RestMethod -Uri $osUrl -Method Post -Headers $headers -ContentType 'application/json' -Body $body

$failedShards = 0
if ($response._shards -and $response._shards.failed) {
    $failedShards = [int]$response._shards.failed
}

$sqlLines = New-Object System.Collections.Generic.List[string]
$sqlLines.Add('START TRANSACTION;')

$docsScanned = 0
$versionsScanned = 0
$versionsWithContent = 0

foreach ($hit in @($response.hits.hits)) {
    $src = $hit._source
    if (-not $src) { continue }

    $docId = $src.id
    if ([string]::IsNullOrWhiteSpace([string]$docId)) {
        $docId = $hit._id
    }

    $docsScanned++

    foreach ($v in @($src.versions)) {
        if (-not $v) { continue }
        $versionsScanned++

        $content = [string]$v.content
        if ([string]::IsNullOrEmpty($content)) { continue }
        $versionsWithContent++

        $versionId = [string]$v.id
        if ([string]::IsNullOrWhiteSpace($versionId)) {
            $versionId = [Guid]::NewGuid().ToString()
        }

        $versionNumber = 1
        if ($null -ne $v.version_number -and "$($v.version_number)" -ne '') {
            $versionNumber = [int]$v.version_number
        }

        $sizeBytes = 0
        if ($null -ne $v.size_bytes -and "$($v.size_bytes)" -ne '') {
            $sizeBytes = [int64]$v.size_bytes
        }

        $createdSql = 'NULL'
        if ($v.created_at) {
            try {
                $dt = [DateTimeOffset]::Parse([string]$v.created_at).UtcDateTime
                $createdSql = "'" + $dt.ToString('yyyy-MM-dd HH:mm:ss.ffffff') + "'"
            } catch {
                $createdSql = 'NULL'
            }
        }

        $fileName = ([string]$v.file_name) -replace "'", "''"
        $contentType = ([string]$v.content_type) -replace "'", "''"
        $escDocId = ([string]$docId) -replace "'", "''"
        $escVersionId = ([string]$versionId) -replace "'", "''"

        $insertSql = "INSERT INTO document_versions (content, content_type, created_at, file_name, size_bytes, version_number, document_id, os_document_id, os_version_id) VALUES (FROM_BASE64('$content'), '$contentType', $createdSql, '$fileName', $sizeBytes, $versionNumber, NULL, '$escDocId', '$escVersionId') ON DUPLICATE KEY UPDATE content=VALUES(content), content_type=VALUES(content_type), created_at=VALUES(created_at), file_name=VALUES(file_name), size_bytes=VALUES(size_bytes), version_number=VALUES(version_number), os_document_id=VALUES(os_document_id);"
        $sqlLines.Add($insertSql)
    }
}

$sqlLines.Add('COMMIT;')

$sqlPath = Join-Path $PSScriptRoot 'tmp_migrate_os_versions_to_mysql.sql'
Set-Content -Path $sqlPath -Value $sqlLines -Encoding UTF8

Get-Content -Path $sqlPath -Raw | & mysql @mysqlArgs --max-allowed-packet=1073741824 --binary-mode | Out-Null

$result = & mysql @mysqlArgs --execute="SELECT COUNT(*) AS mysql_versions_with_os_ids FROM document_versions WHERE os_document_id IS NOT NULL;"

Write-Output "DOCS_SCANNED=$docsScanned"
Write-Output "VERSIONS_SCANNED=$versionsScanned"
Write-Output "VERSIONS_WITH_CONTENT_IN_OS_PAYLOAD=$versionsWithContent"
Write-Output "FAILED_SHARDS=$failedShards"
Write-Output $result

if ($failedShards -gt 0 -and $response._shards.failures) {
    Write-Output 'SHARD_FAILURES:'
    $response._shards.failures | ConvertTo-Json -Depth 10
}
