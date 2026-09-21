$ErrorActionPreference = 'Continue'

$base = 'http://localhost:8080'
$token = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('sysadmin:P@ssw0rd'))
$headers = @{ Authorization = "Basic $token"; 'Content-Type' = 'application/json' }
$stamp = Get-Date -Format 'MMddHHmmss'
$report = New-Object System.Collections.Generic.List[string]

function Step($name, [scriptblock]$act) {
    try {
        & $act
        $report.Add("PASS | $name")
    } catch {
        $msg = $_.Exception.Message
        $report.Add("FAIL | $name | $msg")
    }
}

function HttpBody($resp) {
    $sr = New-Object IO.StreamReader($resp.GetResponseStream())
    return $sr.ReadToEnd()
}

$script:groupId = $null
$script:userId = $null
$script:g2Id = $null

Step 'GET groups' {
    $groups = Invoke-RestMethod -Uri "$base/api/admin/groups" -Headers $headers -Method Get -TimeoutSec 30
    if (-not $groups) { throw 'empty groups list' }
    $script:g2Id = $groups[0].id
}

Step 'GET users' {
    $users = Invoke-RestMethod -Uri "$base/api/admin/users" -Headers $headers -Method Get -TimeoutSec 30
    if ($null -eq $users) { throw 'users endpoint returned null' }
}

Step 'POST group create' {
    $body = @{ name = "SmokeGrp-$stamp"; description = 'smoke test group' } | ConvertTo-Json
    $g = Invoke-RestMethod -Uri "$base/api/admin/groups" -Headers $headers -Method Post -Body $body -TimeoutSec 30
    if (-not $g.id) { throw 'group id missing' }
    $script:groupId = $g.id
}

Step 'PUT group update' {
    if (-not $script:groupId) { throw 'no group id' }
    $body = @{ name = "SmokeGrp-$stamp-U"; description = 'updated' } | ConvertTo-Json
    $g = Invoke-RestMethod -Uri "$base/api/admin/groups/$script:groupId" -Headers $headers -Method Put -Body $body -TimeoutSec 30
    if ($g.name -ne "SmokeGrp-$stamp-U") { throw "name not updated: $($g.name)" }
}

Step 'POST user create with group' {
    if (-not $script:groupId) { throw 'no group id' }
    $body = @{
        username = "smokeu_$stamp"
        displayName = "Smoke User $stamp"
        password = 'P@ssw0rd'
        role = 'DOC_VIEWER'
        groupIds = @($script:groupId)
    } | ConvertTo-Json -Depth 5
    $u = Invoke-RestMethod -Uri "$base/api/admin/users" -Headers $headers -Method Post -Body $body -TimeoutSec 30
    if (-not $u.id) { throw 'user id missing' }
    $script:userId = $u.id
    $ids = @($u.groups | ForEach-Object { $_.id })
    if ($ids -notcontains $script:groupId) { throw "group not assigned in create response: $($ids -join ',')" }
}

Step 'PUT user update role+group' {
    if (-not $script:userId) { throw 'no user id' }
    if (-not $script:g2Id) { throw 'no secondary group id' }
    $body = @{
        username = "smokeu_$stamp"
        displayName = "Smoke User $stamp Updated"
        password = 'P@ssw0rd'
        role = 'DOC_ADMIN'
        groupIds = @($script:g2Id)
    } | ConvertTo-Json -Depth 5
    $u = Invoke-RestMethod -Uri "$base/api/admin/users/$script:userId" -Headers $headers -Method Put -Body $body -TimeoutSec 30
    $ids = @($u.groups | ForEach-Object { $_.id })
    if ($ids -notcontains $script:g2Id) { throw "group not updated in response: $($ids -join ',')" }
}

Step 'GET users persistence check' {
    if (-not $script:userId) { throw 'no user id' }
    $users = Invoke-RestMethod -Uri "$base/api/admin/users" -Headers $headers -Method Get -TimeoutSec 30
    $u = $users | Where-Object { $_.id -eq $script:userId } | Select-Object -First 1
    if (-not $u) { throw 'updated user missing from list' }
    $ids = @($u.groups | ForEach-Object { $_.id })
    if ($ids -notcontains $script:g2Id) { throw "group not persisted: $($ids -join ',')" }
}

Step 'NEGATIVE invalid group should 400' {
    if (-not $script:userId) { throw 'no user id' }
    $body = @{
        username = "smokeu_$stamp"
        displayName = "Smoke User $stamp Updated"
        password = 'P@ssw0rd'
        role = 'DOC_ADMIN'
        groupIds = @('bad-group-id-smoke')
    } | ConvertTo-Json -Depth 5
    try {
        Invoke-WebRequest -Uri "$base/api/admin/users/$script:userId" -Headers $headers -Method Put -Body $body -UseBasicParsing -TimeoutSec 30 | Out-Null
        throw 'unexpected success'
    } catch {
        $resp = $_.Exception.Response
        if (-not $resp) { throw $_.Exception.Message }
        $status = [int]$resp.StatusCode
        if ($status -ne 400) {
            $b = HttpBody $resp
            throw "expected 400 got $status body=$b"
        }
    }
}

Step 'NEGATIVE invalid role value handling' {
    $body = @{
        username = "smokebadrole_$stamp"
        displayName = 'Bad Role'
        password = 'P@ssw0rd'
        role = 'USER'
        groupIds = @()
    } | ConvertTo-Json -Depth 5
    try {
        Invoke-WebRequest -Uri "$base/api/admin/users" -Headers $headers -Method Post -Body $body -UseBasicParsing -TimeoutSec 30 | Out-Null
        throw 'unexpected success'
    } catch {
        $resp = $_.Exception.Response
        if (-not $resp) { throw $_.Exception.Message }
        $status = [int]$resp.StatusCode
        if ($status -ne 400) {
            $b = HttpBody $resp
            throw "expected 400 got $status body=$b"
        }
    }
}

if ($script:userId) {
    try {
        Invoke-RestMethod -Uri "$base/api/admin/users/$script:userId" -Headers $headers -Method Delete -TimeoutSec 30 | Out-Null
        $report.Add('PASS | CLEANUP delete user')
    } catch {
        $report.Add("FAIL | CLEANUP delete user | $($_.Exception.Message)")
    }
}

if ($script:groupId) {
    try {
        Invoke-RestMethod -Uri "$base/api/admin/groups/$script:groupId" -Headers $headers -Method Delete -TimeoutSec 30 | Out-Null
        $report.Add('PASS | CLEANUP delete group')
    } catch {
        $report.Add("FAIL | CLEANUP delete group | $($_.Exception.Message)")
    }
}

$report | ForEach-Object { Write-Output $_ }
