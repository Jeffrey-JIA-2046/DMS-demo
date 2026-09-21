import express from 'express'
import cors from 'cors'
import { PNG } from 'pngjs'
import { PDFDocument } from 'pdf-lib'
import { libsane, SANEStatus, ScanImageReader, ScanOptions } from 'sane-wasm'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

const port = Number(process.env.PORT || 8787)
const NODE_LIST_TIMEOUT_MS = 15_000
const NODE_SCAN_TIMEOUT_MS = 60_000
const NODE_MAX_FEEDER_PAGES = 60

const WIA_DEVICE_PREFIX = 'wia:'
const WIA_FORMAT_JPEG = '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}'
const WIA_FORMAT_BMP = '{B96B3CAB-0728-11D3-9D7B-0000F81EF32E}'
const WIA_FORMAT_PNG = '{B96B3CAF-0728-11D3-9D7B-0000F81EF32E}'
const WIA_DPS_DOCUMENT_HANDLING_STATUS = 3087
const WIA_FEED_READY_FLAG = 1

const statusMessage = (lib, status) => {
  try {
    return lib.sane_strstatus(status)
  } catch {
    return `SANE status ${String(status)}`
  }
}

const pickConstraintValue = (constraint, preferredValues) => {
  if (!Array.isArray(constraint) || !constraint.length) {
    return null
  }
  const map = new Map(constraint.map((value) => [String(value).toLowerCase(), value]))
  for (const preferred of preferredValues) {
    const hit = map.get(String(preferred).toLowerCase())
    if (hit != null) {
      return hit
    }
  }
  return constraint[0]
}

const findScanOption = (options, name) => options?.options?.find((option) => option?.descriptor?.name === name) || null

const setScanOptions = async (sane, options, { resolution, colorMode }) => {
  if (!options) {
    return
  }

  const resolutionOption = options.resolution || findScanOption(options, 'resolution')
  if (resolutionOption?.descriptor?.cap?.SOFT_SELECT) {
    await options.setValue(resolutionOption.index, Math.max(75, Math.min(1200, Number(resolution) || 300)))
  }

  const modeOption = findScanOption(options, 'mode')
  if (modeOption?.descriptor?.cap?.SOFT_SELECT && Array.isArray(modeOption?.descriptor?.constraint)) {
    const preferredValues = colorMode === 'Gray'
      ? ['Gray', 'Grayscale', 'Lineart']
      : ['Color', 'RGB']
    const targetValue = pickConstraintValue(modeOption.descriptor.constraint, preferredValues)
    if (targetValue != null) {
      await options.setValue(modeOption.index, targetValue)
    }
  }
}

const toPngBase64 = (rgbaData, width, height) => {
  const png = new PNG({ width, height })
  const source = Buffer.from(rgbaData)
  if (source.length >= png.data.length) {
    source.copy(png.data, 0, 0, png.data.length)
  } else {
    throw new Error('Scanner returned incomplete image data buffer')
  }
  const buffer = PNG.sync.write(png)
  return buffer.toString('base64')
}

const runPowerShell = (script, { timeoutMs = 0 } = {}) => new Promise((resolve, reject) => {
  execFile(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { maxBuffer: 10 * 1024 * 1024, windowsHide: true, ...(timeoutMs > 0 ? { timeout: timeoutMs } : {}) },
    (error, stdout, stderr) => {
      if (error) {
        if (timeoutMs > 0 && (error.killed || error.signal === 'SIGTERM')) {
          reject(new Error(`Scanner command timed out after ${Math.round(timeoutMs / 1000)}s`))
          return
        }
        const raw = String(stderr || error.message || '').trim()
        const firstLine = raw.split(/\r?\n/).find((line) => line.trim()) || 'PowerShell command failed'
        reject(new Error(firstLine))
        return
      }
      resolve(String(stdout || ''))
    }
  )
})

const toPsString = (value) => `'${String(value).replace(/'/g, "''")}'`

const parseJsonSafe = (raw, fallback = []) => {
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

const isFeederEmptyMessage = (message) => /no pages are in the feeder|nomedia|no media|feeder.*empty/i.test(String(message || ''))

const estimatePdfPageCount = (bytes) => {
  if (!bytes || !bytes.length) {
    return 0
  }

  const text = Buffer.from(bytes).toString('latin1')
  const pageTypeMatches = text.match(/\/Type\s*\/Page\b/g)
  const typeCount = Array.isArray(pageTypeMatches) ? pageTypeMatches.length : 0

  let maxCount = 0
  const countRegex = /\/Count\s+(\d+)/g
  let match = countRegex.exec(text)
  while (match) {
    const value = Number(match[1])
    if (Number.isFinite(value) && value > maxCount) {
      maxCount = value
    }
    match = countRegex.exec(text)
  }

  return Math.max(typeCount, maxCount, 0)
}

const runExecFile = (command, args, options = {}) => new Promise((resolve, reject) => {
  execFile(command, args, { windowsHide: true, maxBuffer: 20 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
    if (error) {
      reject(new Error(String(stderr || error.message || '').trim() || `Failed to run ${command}`))
      return
    }
    resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') })
  })
})

const runNaps2ConsoleViaPowerShell = async (args = [], timeoutMs = NODE_SCAN_TIMEOUT_MS) => {
  const psArgs = args.map((arg) => toPsString(arg)).join(', ')
  const script = `
    $ErrorActionPreference = 'Stop'

    $naps2 = $null
    foreach ($cmdName in @('naps2.console', 'naps2.console.exe')) {
      try {
        $cmd = Get-Command $cmdName -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($cmd -and $cmd.Source -and (Test-Path $cmd.Source)) {
          $naps2 = $cmd.Source
          break
        }
      } catch {}
    }

    if (-not $naps2) {
      $candidates = @(
        "$env:ProgramFiles\\NAPS2\\naps2.console.exe",
        "$env:ProgramFiles(x86)\\NAPS2\\naps2.console.exe",
        "$env:LocalAppData\\Programs\\NAPS2\\naps2.console.exe"
      )
      foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
          $naps2 = $candidate
          break
        }
      }
    }

    if (-not $naps2) {
      throw 'Executable not found: naps2.console.exe'
    }

    $argsList = @(${psArgs})
    $naps2Output = (& $naps2 @argsList 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) {
      $detail = ($naps2Output | Out-String).Trim()
      if (-not $detail) { $detail = 'No additional scanner output.' }
      throw ('NAPS2 exited with code ' + $LASTEXITCODE + '. ' + $detail)
    }
    if ($naps2Output) { $naps2Output }
  `

  await runPowerShell(script, { timeoutMs })
}

const parseConsoleLines = (raw) => String(raw || '')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)

const getNaps2DeviceName = async (driver, preferredName = '') => {
  const output = await runNaps2ConsoleViaPowerShell(['--listdevices', '--driver', driver, '--noprofile'], NODE_LIST_TIMEOUT_MS).catch(() => '')
  const lines = parseConsoleLines(output)
  if (!lines.length) {
    return ''
  }
  if (preferredName) {
    const preferred = lines.find((line) => line.toLowerCase().includes(preferredName.toLowerCase()))
    if (preferred) {
      return preferred
    }
  }
  const kodak = lines.find((line) => line.toLowerCase().includes('kodak'))
  return kodak || lines[0]
}

const getWiaDeviceLabel = async (deviceId) => {
  const script = `
    $ErrorActionPreference = 'Stop'
    $deviceId = ${toPsString(deviceId)}
    $manager = New-Object -ComObject WIA.DeviceManager
    $info = $manager.DeviceInfos | Where-Object { $_.DeviceID -eq $deviceId } | Select-Object -First 1
    if (-not $info) {
      ''
      exit 0
    }
    $name = $null
    try { $name = $info.Properties['Name'].Value } catch {}
    if ($name) { $name }
  `
  return (await runPowerShell(script, { timeoutMs: NODE_LIST_TIMEOUT_MS })).trim()
}

const getWiaDocumentHandlingStatus = async (deviceId) => {
  const script = `
    $ErrorActionPreference = 'Stop'
    $deviceId = ${toPsString(deviceId)}
    $manager = New-Object -ComObject WIA.DeviceManager
    $info = $manager.DeviceInfos | Where-Object { $_.DeviceID -eq $deviceId } | Select-Object -First 1
    if (-not $info) {
      ''
      exit 0
    }
    $device = $info.Connect()
    if (-not $device) {
      ''
      exit 0
    }
    try {
      $status = $device.Properties.Item(${WIA_DPS_DOCUMENT_HANDLING_STATUS}).Value
      [string]$status
    } catch {
      ''
    }
  `

  const raw = (await runPowerShell(script, { timeoutMs: NODE_LIST_TIMEOUT_MS })).trim()
  if (!raw) {
    return null
  }
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

const feederReadyFromStatus = (status) => Number.isFinite(Number(status)) && (Number(status) & WIA_FEED_READY_FLAG) === WIA_FEED_READY_FLAG

const readPdfPayload = async (pdfFile) => {
  try {
    const stat = await fs.stat(pdfFile)
    if (!stat?.isFile?.() || stat.size <= 0) {
      return null
    }
    const bytes = await fs.readFile(pdfFile)
    const pageCount = estimatePdfPageCount(bytes)
    await fs.unlink(pdfFile).catch(() => {})
    if (pageCount <= 0) {
      return null
    }
    return {
      bytes,
      pageCount,
    }
  } catch {
    return null
  }
}

const resolveNaps2Console = async () => {
  const script = `
    $ErrorActionPreference = 'SilentlyContinue'
    $hits = @()
    foreach ($cmdName in @('naps2.console', 'naps2.console.exe')) {
      try {
        $cmd = Get-Command $cmdName -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($cmd -and $cmd.Source) { $hits += $cmd.Source }
      } catch {}
    }
    $candidates = @(
      "$env:ProgramFiles\\NAPS2\\naps2.console.exe",
      "$env:ProgramFiles(x86)\\NAPS2\\naps2.console.exe",
      "$env:LocalAppData\\Programs\\NAPS2\\naps2.console.exe"
    )
    foreach ($candidate in $candidates) {
      if (Test-Path $candidate) { $hits += $candidate }
    }
    $hits = $hits | Where-Object { $_ } | Select-Object -Unique
    if ($hits.Count -gt 0) {
      $hits[0]
    }
  `
  return (await runPowerShell(script, { timeoutMs: NODE_LIST_TIMEOUT_MS })).trim()
}

const scanViaNaps2Pdf = async ({ deviceId, resolution, colorMode, maxImages, duplex, paperSize = 'A4' }) => {
  const deviceLabel = (await getWiaDeviceLabel(deviceId)) || deviceId
  const twainDeviceLabel = await getNaps2DeviceName('twain', 'kodak')
  const bitDepth = /gray/i.test(colorMode) ? 'gray' : /bw|black|white|lineart|text/i.test(colorMode) ? 'bw' : 'color'
  const source = duplex ? 'duplex' : 'feeder'
  const dpi = String(Math.max(75, Math.min(1200, Number(resolution) || 300)))
  const maxPasses = Math.max(1, Math.min(NODE_MAX_FEEDER_PAGES, Number(maxImages) || NODE_MAX_FEEDER_PAGES))
  const targetPageSize = String(paperSize || 'A4').toUpperCase() === 'A3' ? 'a3' : 'a4'

  const sources = Array.from(new Set([source, 'feeder', 'duplex']))
  const attempts = []

  for (const scanSource of sources) {
    attempts.push({ driver: 'wia', device: deviceLabel, source: scanSource, delayMs: 0 })
    attempts.push({ driver: 'wia', device: deviceLabel, source: scanSource, delayMs: 1200 })
  }

  if (twainDeviceLabel) {
    for (const scanSource of sources) {
      attempts.push({ driver: 'twain', device: twainDeviceLabel, source: scanSource, delayMs: 0 })
      attempts.push({ driver: 'twain', device: twainDeviceLabel, source: scanSource, delayMs: 1200 })
    }
  }

  const merged = await PDFDocument.create()
  let totalPages = 0
  let lastError = null

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const handlingStatus = await getWiaDocumentHandlingStatus(deviceId).catch(() => null)
    if (pass > 0 && handlingStatus != null && !feederReadyFromStatus(handlingStatus)) {
      break
    }

    let scannedThisPass = false
    const passErrors = []

    for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
      const attempt = attempts[attemptIndex]
      const tmpPdf = path.join(os.tmpdir(), `dms-scan-${Date.now()}-${pass}-${attemptIndex}.pdf`)
      const args = [
        '--noprofile',
        '--driver', attempt.driver,
        '--device', attempt.device,
        '--source', attempt.source,
        '--pagesize', targetPageSize,
        '--dpi', dpi,
        '--bitdepth', bitDepth,
        '--number', '1',
        '--force',
      ]
      if (attempt.delayMs > 0) {
        args.push('--delay', String(attempt.delayMs))
      }
      args.push('--output', tmpPdf)

      try {
        await runNaps2ConsoleViaPowerShell(args, NODE_SCAN_TIMEOUT_MS)
        const payload = await readPdfPayload(tmpPdf)
        if (!payload) {
          passErrors.push('NAPS2 completed but no PDF page was created')
          continue
        }
        const sourceDoc = await PDFDocument.load(payload.bytes, { ignoreEncryption: true })
        const pageIndices = sourceDoc.getPageIndices()
        if (!pageIndices.length) {
          passErrors.push('NAPS2 produced an empty PDF page')
          continue
        }
        const copied = await merged.copyPages(sourceDoc, pageIndices)
        copied.forEach((pageRef) => merged.addPage(pageRef))
        totalPages += copied.length
        scannedThisPass = true
        break
      } catch (error) {
        const payload = await readPdfPayload(tmpPdf)
        if (payload) {
          const sourceDoc = await PDFDocument.load(payload.bytes, { ignoreEncryption: true })
          const pageIndices = sourceDoc.getPageIndices()
          if (pageIndices.length) {
            const copied = await merged.copyPages(sourceDoc, pageIndices)
            copied.forEach((pageRef) => merged.addPage(pageRef))
            totalPages += copied.length
            scannedThisPass = true
            break
          }
        }
        const message = error?.message || 'NAPS2 scan failed'
        passErrors.push(message)
        if (isFeederEmptyMessage(message) && totalPages > 0) {
          scannedThisPass = false
          break
        }
        lastError = error
      }
    }

    if (!scannedThisPass) {
      if (passErrors.some((message) => isFeederEmptyMessage(message)) && totalPages > 0) {
        break
      }
      if (totalPages > 0) {
        break
      }
      throw new Error(passErrors[0] || lastError?.message || 'NAPS2 fallback scan failed')
    }
  }

  if (totalPages <= 0) {
    throw new Error('No pages were scanned from feeder. Load pages into ADF and retry.')
  }

  const mergedBytes = await merged.save()
  return {
    fileName: `scan-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    base64: Buffer.from(mergedBytes).toString('base64'),
    pageCount: totalPages,
    outputType: 'pdf',
    engine: 'naps2',
  }
}

const listWiaScanners = async () => {
  const script = `
    $ErrorActionPreference = 'Stop'
    $manager = New-Object -ComObject WIA.DeviceManager
    $items = @()
    foreach ($info in $manager.DeviceInfos) {
      if ($info.Type -eq 1) {
        $name = $null
        try { $name = $info.Properties['Name'].Value } catch {}
        $items += [pscustomobject]@{
          id = $info.DeviceID
          name = $name
          type = $info.Type
        }
      }
    }
    $items | ConvertTo-Json -Compress
  `
  const raw = (await runPowerShell(script, { timeoutMs: NODE_LIST_TIMEOUT_MS })).trim()
  if (!raw) {
    return []
  }
  const parsed = parseJsonSafe(raw, [])
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  return rows
    .filter((row) => row && row.id)
    .map((row) => ({
      name: `${WIA_DEVICE_PREFIX}${row.id}`,
      vendor: 'WIA',
      model: row.name || 'Scanner',
      type: 'wia',
    }))
}

const mimeTypeFromFileName = (fileName) => {
  const ext = path.extname(fileName).toLowerCase()
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.bmp':
      return 'image/bmp'
    case '.tif':
    case '.tiff':
      return 'image/tiff'
    default:
      return 'application/octet-stream'
  }
}

const scanViaWia = async ({ deviceName, resolution, colorMode = 'Color', maxImages = 1, duplex = false, silent = true }) => {
  const deviceId = deviceName.replace(WIA_DEVICE_PREFIX, '')
  const outputFile = path.join(os.tmpdir(), `dms-scan-${Date.now()}.jpg`)

  const script = `
    $ErrorActionPreference = 'Stop'
    $deviceId = ${toPsString(deviceId)}
    $outputFile = ${toPsString(outputFile)}
    $resolution = ${Number(resolution) || 300}
    $maxImages = ${Math.max(1, Math.min(20, Number(maxImages) || 1))}
    $colorMode = ${toPsString(String(colorMode || 'Color'))}
    $duplex = ${duplex ? '$true' : '$false'}
    $silent = ${silent ? '$true' : '$false'}

    $manager = New-Object -ComObject WIA.DeviceManager
    $info = $manager.DeviceInfos | Where-Object { $_.DeviceID -eq $deviceId } | Select-Object -First 1
    if (-not $info) {
      throw 'WIA device not found'
    }

    $device = $info.Connect()
    if (-not $device -or $device.Items.Count -lt 1) {
      throw 'WIA device has no scannable item'
    }

    $transferErrors = @()
    $outputFiles = @()

    function Set-WiaPropertyValue($propCollection, $propId, $propValue) {
      try {
        $prop = $null
        try { $prop = $propCollection.Item($propId) } catch {}
        if (-not $prop) {
          foreach ($candidate in $propCollection) {
            if ($candidate.PropertyID -eq $propId) {
              $prop = $candidate
              break
            }
          }
        }
        if ($prop) {
          $prop.Value = $propValue
          return $true
        }
      } catch {}
      return $false
    }

    $handlingStatus = $null
    $handlingCapabilities = $null
    try { $handlingStatus = $device.Properties.Item(3087).Value } catch {}
    try { $handlingCapabilities = $device.Properties.Item(3086).Value } catch {}
    [void](Set-WiaPropertyValue $device.Properties 3096 $maxImages)

    $itemsToTry = @()
    foreach ($candidate in $device.Items) {
      $itemsToTry += $candidate
    }
    if ($itemsToTry.Count -eq 0) {
      $itemsToTry += $device.Items.Item(1)
    }

    # 1=FEEDER, 2=FLATBED, 4=DUPLEX, 16=NEXT_PAGE
    # Keep combinations conservative because many WIA drivers reject advanced flags.
    $handlingModes = if ($duplex) { @(5, 21, 1, 2) } else { @(1, 17, 2) }

    for ($page = 1; $page -le $maxImages; $page++) {
      $image = $null
      $pageErrors = @()
      $pageAttempt = 0

      while (-not $image -and $pageAttempt -lt 8) {
        $pageAttempt += 1
        foreach ($item in $itemsToTry) {
          if ($image) { break }

          $itemId = $null
          try { $itemId = $item.ItemID } catch { $itemId = 'unknown-item' }

          [void](Set-WiaPropertyValue $item.Properties 6147 $resolution)
          [void](Set-WiaPropertyValue $item.Properties 6148 $resolution)

          # 6146 (WIA_IPS_CUR_INTENT): 1=color, 2=grayscale, 4=text
          $intent = if ($colorMode -match 'gray|grayscale') { 2 } elseif ($colorMode -match 'bw|black|white|lineart|text') { 4 } else { 1 }
          [void](Set-WiaPropertyValue $item.Properties 6146 $intent)

          foreach ($handling in $handlingModes) {
            if ($image) { break }
            try { $device.Properties.Item(3088).Value = $handling } catch {}

            try {
              $image = $item.Transfer()
            } catch {
              $pageErrors += "page ${'$'}page attempt ${'$'}pageAttempt item ${'$'}itemId handling ${'$'}handling default transfer failed: $($_.Exception.Message)"
            }

            if (-not $image) {
              foreach ($format in @(${toPsString(WIA_FORMAT_JPEG)}, ${toPsString(WIA_FORMAT_PNG)}, ${toPsString(WIA_FORMAT_BMP)})) {
                if ($image) { break }
                try {
                  $image = $item.Transfer($format)
                } catch {
                  $pageErrors += "page ${'$'}page attempt ${'$'}pageAttempt item ${'$'}itemId handling ${'$'}handling format ${'$'}format transfer failed: $($_.Exception.Message)"
                }
              }
            }

          }
        }

        if (-not $image) {
          Start-Sleep -Milliseconds 900
        }
      }

      # Silent mode skips UI dialogs entirely and relies on direct transfer methods.
      if (-not $image -and -not $silent) {
        try {
          $dialog = New-Object -ComObject WIA.CommonDialog
          $image = $dialog.ShowAcquireImage(1, 0, 0, ${toPsString(WIA_FORMAT_JPEG)}, $false, $true, $false)
        } catch {
          $pageErrors += "page ${'$'}page ShowAcquireImage failed: $($_.Exception.Message)"
        }
      }

      if (-not $image) {
        if ($page -eq 1) {
          $transferErrors += $pageErrors
          throw ('WIA transfer failed after trying scanner items and transfer methods. handlingStatus=' + $handlingStatus + '; handlingCapabilities=' + $handlingCapabilities + '. ' + ($transferErrors -join ' | '))
        }
        break
      }

      $targetPath = if ($page -eq 1) { $outputFile } else { [System.IO.Path]::Combine([System.IO.Path]::GetDirectoryName($outputFile), ('dms-scan-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + '-p' + $page + '.jpg')) }
      $image.SaveFile($targetPath)
      $outputFiles += $targetPath
    }

    [pscustomobject]@{ outputFiles = $outputFiles; handlingStatus = $handlingStatus; handlingCapabilities = $handlingCapabilities } | ConvertTo-Json -Compress
  `

  const raw = (await runPowerShell(script, { timeoutMs: NODE_SCAN_TIMEOUT_MS })).trim()
  const payload = parseJsonSafe(raw, null)
  const outputFiles = Array.isArray(payload?.outputFiles) && payload.outputFiles.length
    ? payload.outputFiles
    : [outputFile]

  const pages = []
  for (let index = 0; index < outputFiles.length; index += 1) {
    const filePath = outputFiles[index]
    const bytes = await fs.readFile(filePath)
    await fs.unlink(filePath).catch(() => {})
    const fileName = `scan-${Date.now()}-p${index + 1}${path.extname(filePath) || '.jpg'}`
    pages.push({
      fileName,
      mimeType: mimeTypeFromFileName(fileName),
      base64: bytes.toString('base64'),
    })
  }

  return {
    pages,
    pageCount: pages.length,
    handlingStatus: payload?.handlingStatus,
    handlingCapabilities: payload?.handlingCapabilities,
    fileName: pages[0]?.fileName,
    mimeType: pages[0]?.mimeType,
    base64: pages[0]?.base64,
  }
}

const listSaneScanners = async () => {
  let lib = null
  try {
    lib = await libsane()
    const init = lib.sane_init()
    if (init.status !== SANEStatus.GOOD) {
      return { devices: [], error: `Unable to initialize SANE: ${statusMessage(lib, init.status)}` }
    }

    const devicesResult = await lib.sane_get_devices()
    if (devicesResult.status !== SANEStatus.GOOD) {
      return { devices: [], error: `Unable to list SANE scanners: ${statusMessage(lib, devicesResult.status)}` }
    }

    return {
      devices: (devicesResult.devices || []).map((device) => ({
        name: device.name,
        vendor: device.vendor,
        model: device.model,
        type: device.type,
      })),
      error: null,
    }
  } catch (error) {
    return { devices: [], error: error?.message || 'Failed to list SANE scanners' }
  } finally {
    if (lib) {
      try {
        await lib.sane_exit()
      } catch {
      }
    }
  }
}

const scanViaSane = async ({ deviceName, resolution, colorMode }) => {
  let lib = null
  try {
    lib = await libsane()
    const init = lib.sane_init()
    if (init.status !== SANEStatus.GOOD) {
      throw new Error(`Unable to initialize scanner: ${statusMessage(lib, init.status)}`)
    }

    const openResult = await lib.sane_open(deviceName)
    if (openResult.status !== SANEStatus.GOOD) {
      throw new Error(`Unable to open scanner: ${statusMessage(lib, openResult.status)}`)
    }

    const options = await ScanOptions.get(lib)
    await setScanOptions(SANEStatus, options, { resolution, colorMode })

    const reader = new ScanImageReader(lib)
    const scannedImage = await new Promise((resolve, reject) => {
      let done = false

      reader.on('image', (parameters, data) => {
        if (!done) {
          done = true
          resolve({ parameters, data })
        }
      })

      reader.on('stop', (_parameters, scanError) => {
        if (!done && scanError) {
          done = true
          reject(scanError)
        }
      })

      reader.start().then((result) => {
        if (result.status !== SANEStatus.GOOD) {
          done = true
          reject(new Error(`Scan failed to start: ${statusMessage(lib, result.status)}`))
          return
        }
        result.promise.catch((scanError) => {
          if (!done) {
            done = true
            reject(scanError)
          }
        })
      }).catch((scanError) => {
        if (!done) {
          done = true
          reject(scanError)
        }
      })
    })

    const width = scannedImage?.parameters?.pixels_per_line
    const height = scannedImage?.parameters?.lines
    if (!width || !height || !scannedImage?.data) {
      throw new Error('Scanner returned incomplete image output')
    }

    const base64 = toPngBase64(scannedImage.data, width, height)
    return {
      fileName: `scan-${Date.now()}.png`,
      mimeType: 'image/png',
      width,
      height,
      base64,
    }
  } finally {
    if (lib) {
      try {
        await lib.sane_close()
      } catch {
      }
      try {
        await lib.sane_exit()
      } catch {
      }
    }
  }
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, message: 'node scanner bridge is running' })
})

app.get('/scanners', async (_req, res) => {
  const saneResult = await listSaneScanners()
  let wiaDevices = []
  let wiaError = null

  try {
    wiaDevices = await listWiaScanners()
  } catch (error) {
    wiaError = error?.message || 'Failed to list WIA scanners'
  }

  const devices = [...saneResult.devices, ...wiaDevices]
  res.json({
    devices,
    warnings: {
      sane: saneResult.error,
      wia: wiaError,
    },
  })
})

app.post('/scan', async (req, res) => {
  const deviceName = String(req.body?.deviceName || '').trim()
  const resolution = Number(req.body?.resolution || 300)
  const colorMode = String(req.body?.colorMode || 'Color')
  const maxImages = Number(req.body?.maxImages || 1)
  const duplex = Boolean(req.body?.duplex)
  const paperSize = String(req.body?.paperSize || 'A4')
  const silent = req.body?.silent == null ? true : Boolean(req.body?.silent)

  if (!deviceName) {
    return res.status(400).json({ error: 'deviceName is required' })
  }

  try {
    let payload
    if (deviceName.startsWith(WIA_DEVICE_PREFIX)) {
      const deviceId = deviceName.replace(WIA_DEVICE_PREFIX, '')
      if (silent) {
        try {
          payload = await scanViaNaps2Pdf({ deviceId, resolution, colorMode, maxImages, duplex, paperSize })
        } catch (naps2Error) {
          throw new Error(`Silent scan failed: ${naps2Error?.message || 'NAPS2 fallback scan failed'}`)
        }
      } else {
        try {
          payload = await scanViaWia({ deviceName, resolution, colorMode, maxImages, duplex, silent })
        } catch (wiaError) {
          throw new Error(`WIA scan failed: ${wiaError?.message || 'unknown error'}`)
        }
      }
    } else {
      payload = await scanViaSane({ deviceName, resolution, colorMode })
    }
    res.json(payload)
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Scan failed' })
  }
})

app.listen(port, () => {
  console.log(`Node scanner bridge listening on http://localhost:${port}`)
})
