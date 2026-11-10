param(
    [int]$Port = 8787
)

$ErrorActionPreference = "Continue"

# Automatically stop any previous server.ps1 PowerShell process holding the port (excluding self and parent)
try {
    $currentPid = $PID
    $selfProc = Get-CimInstance Win32_Process -Filter "ProcessId = $currentPid" -ErrorAction SilentlyContinue
    $parentPid = if ($selfProc) { $selfProc.ParentProcessId } else { 0 }
    Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.ProcessId -ne $currentPid -and
            $_.ProcessId -ne $parentPid -and
            $_.CommandLine -match "server\.ps1"
        } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500
} catch {}

try {
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor 12288
} catch {
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
}
[System.Net.ServicePointManager]::DefaultConnectionLimit = 100
[System.Net.ServicePointManager]::Expect100Continue = $false
[System.Net.ServicePointManager]::UseNagleAlgorithm = $false

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Host "Failed to start listener on $prefix : $_" -ForegroundColor Red
    exit 1
}

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "  SAP Student Hub Local Server Running!" -ForegroundColor Green
Write-Host "  URL: http://localhost:$Port" -ForegroundColor Yellow
Write-Host "  Keep this window open while using the tool." -ForegroundColor Gray
Write-Host "=========================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Open browser automatically
Start-Process "http://localhost:$Port"

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $req = $context.Request
        $res = $context.Response

        # Add CORS headers
        $res.Headers.Add("Access-Control-Allow-Origin", "*")
        $res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        $res.Headers.Add("Access-Control-Allow-Headers", "Content-Type, X-Sap-Cookie")

        if ($req.HttpMethod -eq "OPTIONS") {
            $res.StatusCode = 200
            $res.Close()
            continue
        }

        $path = $req.Url.LocalPath

        if ($path -eq "/" -or $path -eq "/index.html") {
            $htmlPath = Join-Path $scriptDir "index.html"
            if (Test-Path $htmlPath) {
                $bytes = [System.IO.File]::ReadAllBytes($htmlPath)
                $res.ContentType = "text/html; charset=utf-8"
                $res.Headers.Add("Cache-Control", "no-store, no-cache, must-revalidate")
                $res.ContentLength64 = $bytes.Length
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $res.StatusCode = 404
            }
            $res.Close()
            continue
        }

        # Serve modular static assets (.js, .css, .json, .svg, .png) from sap-hub directory
        $cleanRelPath = $path.TrimStart('/').Replace('/', '\')
        if ($cleanRelPath -and -not $cleanRelPath.StartsWith("api\") -and $cleanRelPath -notmatch "\.\.") {
            $staticFilePath = Join-Path $scriptDir $cleanRelPath
            if (Test-Path $staticFilePath -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($staticFilePath).ToLowerInvariant()
                $contentType = switch ($ext) {
                    ".js"   { "application/javascript; charset=utf-8" }
                    ".css"  { "text/css; charset=utf-8" }
                    ".json" { "application/json; charset=utf-8" }
                    ".svg"  { "image/svg+xml" }
                    ".png"  { "image/png" }
                    ".jpg"  { "image/jpeg" }
                    ".ico"  { "image/x-icon" }
                    default { "application/octet-stream" }
                }
                $bytes = [System.IO.File]::ReadAllBytes($staticFilePath)
                $res.ContentType = $contentType
                $res.Headers.Add("Cache-Control", "no-store, no-cache, must-revalidate")
                $res.ContentLength64 = $bytes.Length
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
                $res.Close()
                continue
            }
        }

        # Handle CORS headers for all /api/ requests (crucial for browser extension)
        if ($path.StartsWith("/api/")) {
            $res.Headers.Add("Access-Control-Allow-Origin", "*")
            $res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            $res.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization")
            if ($req.HttpMethod -eq "OPTIONS") {
                $res.StatusCode = 200
                $res.Close()
                continue
            }
        }

        if ($path -eq "/api/ping") {
            $json = '{"ok":true,"status":"running"}'
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            $res.ContentType = "application/json; charset=utf-8"
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()
            continue
        }

        # -------------------------------------------------------------
        # Auto-Sync Cookie Endpoints (Extension Sync)
        # -------------------------------------------------------------
        if ($path -eq "/api/sync-cookies" -and $req.HttpMethod -eq "POST") {
            $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
            $rawBody = $reader.ReadToEnd()
            $reader.Close()

            $payload = $rawBody | ConvertFrom-Json
            $syncedCookie = [string]$payload.cookie
            $hasSession = [bool]$payload.hasSessionId

            if ($syncedCookie) {
                $cookieFile = Join-Path $scriptDir "active_cookie.txt"
                [System.IO.File]::WriteAllText($cookieFile, $syncedCookie, [System.Text.Encoding]::UTF8)
                $script:lastSyncedCookie = $syncedCookie
                $script:lastSyncedTime = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
                Write-Host "[Auto-Sync] Received fresh SAP cookies from Extension! (HasSession: $hasSession)" -ForegroundColor Green
            }

            $json = '{"ok":true,"message":"Cookies synced successfully"}'
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            $res.ContentType = "application/json; charset=utf-8"
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()
            continue
        }

        if ($path -eq "/api/get-cookies") {
            $cookieFile = Join-Path $scriptDir "active_cookie.txt"
            $cookieContent = ""
            if (Test-Path $cookieFile) {
                $cookieContent = [System.IO.File]::ReadAllText($cookieFile, [System.Text.Encoding]::UTF8)
            }
            if (-not $cookieContent -and $script:lastSyncedCookie) {
                $cookieContent = $script:lastSyncedCookie
            }

            $hasSession = if ($cookieContent) { $cookieContent.Contains("SAP_SESSIONID") } else { $false }
            $retObj = @{
                ok = $true
                hasCookie = [bool]$cookieContent
                hasSessionId = $hasSession
                cookie = $cookieContent
                updatedAt = $script:lastSyncedTime
            }
            $json = $retObj | ConvertTo-Json -Compress
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            $res.ContentType = "application/json; charset=utf-8"
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()
            continue
        }

        # -------------------------------------------------------------
        # Live Traffic Recorder (Intercepts SAP clicks, requests & notes)
        # -------------------------------------------------------------
        if ($path -eq "/api/log-traffic" -and $req.HttpMethod -eq "POST") {
            $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
            $rawBody = $reader.ReadToEnd()
            $reader.Close()

            $trafficDir = Join-Path $scriptDir "traffic_logs"
            if (-not (Test-Path $trafficDir)) { New-Item -ItemType Directory -Path $trafficDir -Force | Out-Null }
            $trafficFile = Join-Path $trafficDir "traffic.jsonl"

            try {
                # Auto-rotate traffic.jsonl if it exceeds 5 MB to prevent server freeze
                if (Test-Path $trafficFile) {
                    $fInfo = Get-Item $trafficFile -ErrorAction SilentlyContinue
                    if ($fInfo -and $fInfo.Length -gt 5242880) {
                        Set-Content -Path $trafficFile -Value "" -Encoding UTF8
                    }
                }

                $item = $rawBody | ConvertFrom-Json
                $actionName = if ($item.action) { $item.action } else { "SAP Event" }
                $statusStr = if ($item.status) { "Status $($item.status)" } else { "Outgoing" }
                Write-Host "[SAP Traffic] $actionName - $statusStr ($($rawBody.Length) bytes)" -ForegroundColor Yellow

                # Cache latest FPL9 Account Balance in memory for instant retrieval (0ms)
                if (($item.url -and $item.url.Contains("webgui")) -or ($item.action -and $item.action.Contains("Account balance"))) {
                    $script:latestFpl9Item = @{
                        timestamp = $item.timestamp
                        action = $item.action
                        url = $item.url
                        responseSnippet = $item.responseSnippet
                    }
                }

                # Keep only compact entry in traffic.jsonl (avoid 800KB per line!)
                $compactSnippet = if ($item.responseSnippet -and $item.responseSnippet.Length -gt 12000) {
                    if ($item.url -and $item.url.Contains("webgui")) { $item.responseSnippet } else { $item.responseSnippet.Substring(0, 12000) }
                } else {
                    $item.responseSnippet
                }
                $compactObj = @{
                    timestamp = $item.timestamp
                    action = $item.action
                    userClick = $item.userClick
                    userInput = $item.userInput
                    method = $item.method
                    status = $item.status
                    url = $item.url
                    requestBody = $item.requestBody
                    responseSnippet = $compactSnippet
                }
                $compactLine = $compactObj | ConvertTo-Json -Compress -Depth 4
                [System.IO.File]::AppendAllText($trafficFile, $compactLine + "`n", [System.Text.Encoding]::UTF8)

                # If fresh cookie attached, update active_cookie.txt
                if ($item.cookie -and $item.cookie.Contains("SAP_SESSIONID")) {
                    $cookieFile = Join-Path $scriptDir "active_cookie.txt"
                    [System.IO.File]::WriteAllText($cookieFile, $item.cookie, [System.Text.Encoding]::UTF8)
                    $script:lastSyncedCookie = $item.cookie
                    $script:lastSyncedTime = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
                }
            } catch {}

            $json = '{"ok":true,"logged":true}'
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            $res.ContentType = "application/json; charset=utf-8"
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()
            continue
        }

        # -------------------------------------------------------------
        # Live Recorder Inspection API (returns recent traffic for UI / Analyzer)
        # -------------------------------------------------------------
        if ($path -eq "/api/recorder/recent") {
            $recent = @()
            if ($script:latestFpl9Item) {
                $recent += $script:latestFpl9Item
            }
            $json = @{ ok = $true; total = $recent.Count; items = $recent } | ConvertTo-Json -Depth 4 -Compress
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            $res.ContentType = "application/json; charset=utf-8"
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()
            continue
        }

        if ($path -eq "/api/recorder/clear" -and $req.HttpMethod -eq "POST") {
            $trafficDir = Join-Path $scriptDir "traffic_logs"
            $trafficFile = Join-Path $trafficDir "traffic.jsonl"
            if (Test-Path $trafficFile) {
                Set-Content -Path $trafficFile -Value "" -Encoding UTF8
            }
            $json = '{"ok":true,"message":"Traffic log cleared"}'
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            $res.ContentType = "application/json; charset=utf-8"
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()
            continue
        }

        if ($path -eq "/api/sap" -and $req.HttpMethod -eq "POST") {
            $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
            $rawBody = $reader.ReadToEnd()
            $reader.Close()

            $payload = $rawBody | ConvertFrom-Json
            $targetUrl = [string]$payload.url
            $method = if ($payload.method) { [string]$payload.method } else { "GET" }
            $cookie = [string]$payload.cookie
            $postBody = [string]$payload.body
            $referer = if ($payload.referer) { [string]$payload.referer } else { "https://prd-sap.sms.britishcouncil.org/sap/bc/webdynpro/sap/z_her_wa_student?WDCONFIGURATIONID=Z_HER_AC_STUDENT" }

            # Auto-fallback to synced cookie if client didn't supply one
            if (-not $cookie) {
                $cookieFile = Join-Path $scriptDir "active_cookie.txt"
                if (Test-Path $cookieFile) {
                    $cookie = [System.IO.File]::ReadAllText($cookieFile, [System.Text.Encoding]::UTF8)
                }
            }

            Write-Host "[SAP Proxy] $method $targetUrl" -ForegroundColor Cyan

            try {
                $webReq = [System.Net.HttpWebRequest]::Create($targetUrl)
                $webReq.Method = $method
                $webReq.KeepAlive = $true
                $webReq.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
                $webReq.AllowAutoRedirect = $true
                $webReq.Timeout = 60000
                $webReq.ReadWriteTimeout = 60000
                $webReq.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0"
                $webReq.Accept = "*/*"
                $webReq.Referer = $referer
                $webReq.Headers.Add("Accept-Language", "en-GB,en;q=0.9,en-US;q=0.8")
                $webReq.Headers.Add("Cache-Control", "no-cache")
                $webReq.Headers.Add("Pragma", "no-cache")
                $webReq.Headers.Add("X-Requested-With", "XMLHttpRequest")
                $webReq.Headers.Add("X-XHR-Logon", "accept")

                if ($cookie) {
                    $webReq.Headers.Add("Cookie", $cookie)
                }

                if ($method -eq "POST") {
                    $webReq.ContentType = "application/x-www-form-urlencoded; charset=utf-8"
                    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($postBody)
                    $webReq.ContentLength = $bodyBytes.Length
                    $reqStream = $webReq.GetRequestStream()
                    $reqStream.Write($bodyBytes, 0, $bodyBytes.Length)
                    $reqStream.Close()
                }

                $webRes = [System.Net.HttpWebResponse]$webReq.GetResponse()
                $resStream = $webRes.GetResponseStream()
                $resReader = New-Object System.IO.StreamReader($resStream, [System.Text.Encoding]::UTF8)
                $resText = $resReader.ReadToEnd()
                $resReader.Close()

                $setCookieHeader = $webRes.Headers["Set-Cookie"]
                $sessionState = $webRes.Headers["sap-session-state"]
                $finalUrl = $webRes.ResponseUri.ToString()
                $statusCode = [int]$webRes.StatusCode
                $webRes.Close()

                $resultObj = @{
                    ok = $true
                    status = $statusCode
                    finalUrl = $finalUrl
                    setCookie = $setCookieHeader
                    sessionState = $sessionState
                    body = $resText
                }
            } catch [System.Net.WebException] {
                $ex = $_.Exception
                $errBody = ""
                $errStatus = 500
                if ($ex.Response) {
                    $httpErr = [System.Net.HttpWebResponse]$ex.Response
                    $errStatus = [int]$httpErr.StatusCode
                    $errStream = $httpErr.GetResponseStream()
                    if ($errStream) {
                        $errReader = New-Object System.IO.StreamReader($errStream, [System.Text.Encoding]::UTF8)
                        $errBody = $errReader.ReadToEnd()
                        $errReader.Close()
                    }
                }
                $isExpired = $errStatus -eq 403 -or $errStatus -eq 401 -or ($httpErr -and $httpErr.Headers["X-XHR-Logon"])
                $errMsg = if ($isExpired) {
                    "SAP session expired (HTTP $errStatus). Please paste a fresh cookie/fetch from your SAP tab."
                } else {
                    $ex.Message
                }
                Write-Host "[SAP Proxy Error] $errStatus : $errMsg" -ForegroundColor Red
                $resultObj = @{
                    ok = $false
                    status = $errStatus
                    error = $errMsg
                    sessionExpired = $isExpired
                    body = $errBody
                }
            } catch {
                Write-Host "[SAP Proxy Error] $($_.Exception.Message)" -ForegroundColor Red
                $resultObj = @{
                    ok = $false
                    status = 500
                    error = $_.Exception.Message
                    body = ""
                }
            }

            $outJson = $resultObj | ConvertTo-Json -Depth 6 -Compress
            $outBytes = [System.Text.Encoding]::UTF8.GetBytes($outJson)
            $res.ContentType = "application/json; charset=utf-8"
            $res.ContentLength64 = $outBytes.Length
            $res.OutputStream.Write($outBytes, 0, $outBytes.Length)
            $res.Close()
            continue
        }

        $res.StatusCode = 404
        $res.Close()
    } catch {
        if ($_.Exception.Message -match "network name is no longer available|connection was closed|operation was aborted|client disconnected") {
            # Browser refreshed or client closed connection before response finished writing - safe to ignore
        } else {
            Write-Host "Server loop error: $_" -ForegroundColor Red
        }
    }
}
