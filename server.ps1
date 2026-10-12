# ArtBoard Local Server for High School Art Class
# 고등학교 미술 수업 아트보드 & 세특 관리 로컬 서버
param (
    [int]$Port = 8080,
    [switch]$NoBrowser
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$publicDir = Join-Path $scriptDir "public"
$dataDir = Join-Path $scriptDir "data"
$postsFile = Join-Path $dataDir "posts.json"
$classesFile = Join-Path $dataDir "classes.json"

if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir -Force | Out-Null }
if (-not (Test-Path $postsFile)) { Set-Content -Path $postsFile -Value "[]" -Encoding UTF8 }
if (-not (Test-Path $classesFile)) { Set-Content -Path $classesFile -Value "[]" -Encoding UTF8 }

# Get Local IPv4 Address
function Get-LocalIP {
    try {
        $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | 
               Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254*" } |
               Select-Object -ExpandProperty IPAddress
        if ($ips) {
            foreach ($ip in $ips) {
                if ($ip -like "192.168.*" -or $ip -like "10.*" -or $ip -like "172.*") {
                    return $ip
                }
            }
            return $ips[0]
        }
    } catch {}
    return "127.0.0.1"
}

$localIP = Get-LocalIP

# MIME Types
$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

# Start TCP Listener
try {
    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
    $listener.Start()
} catch {
    Write-Host "[!] 포트 $Port 가 이미 사용 중입니다. 포트 $($Port + 1) 로 재시도합니다..." -ForegroundColor Yellow
    $Port = $Port + 1
    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
    $listener.Start()
}

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "      🎨 고등학교 미술 수업 아트보드 & 세특 관리 시스템       " -ForegroundColor Yellow
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " [교사용 접속 주소]        : http://localhost:$Port/" -ForegroundColor Green
Write-Host " [학생 스마트폰/QR 접속 주소] : http://$($localIP):$Port/" -ForegroundColor Green
Write-Host "------------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host " * 같은 학교 Wi-Fi/네트워크에 연결된 학생들은 위 주소 또는"
Write-Host "   화면에 표시되는 [QR코드]를 휴대폰 카메라로 찍어 바로 입장합니다."
Write-Host " * 종료하려면 이 창에서 [Ctrl + C]를 누르세요." -ForegroundColor DarkGray
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""

if (-not $NoBrowser) {
    try { Start-Process "http://localhost:$Port/" } catch {}
}

function Send-Response {
    param(
        [System.IO.Stream]$Stream,
        [int]$StatusCode = 200,
        [string]$StatusText = "OK",
        [string]$ContentType = "text/html; charset=utf-8",
        [byte[]]$BodyBytes = @(),
        [hashtable]$ExtraHeaders = @{}
    )
    $headerStr = "HTTP/1.1 $StatusCode $StatusText`r`n"
    $headerStr += "Content-Type: $ContentType`r`n"
    $headerStr += "Content-Length: $($BodyBytes.Length)`r`n"
    $headerStr += "Access-Control-Allow-Origin: *`r`n"
    $headerStr += "Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`r`n"
    $headerStr += "Access-Control-Allow-Headers: Content-Type`r`n"
    $headerStr += "Connection: close`r`n"
    foreach ($k in $ExtraHeaders.Keys) {
        $headerStr += "$k`: $($ExtraHeaders[$k])`r`n"
    }
    $headerStr += "`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headerStr)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($BodyBytes.Length -gt 0) {
        $Stream.Write($BodyBytes, 0, $BodyBytes.Length)
    }
    $Stream.Flush()
}

function Send-JsonResponse {
    param(
        [System.IO.Stream]$Stream,
        [int]$StatusCode = 200,
        $Data
    )
    $json = $Data | ConvertTo-Json -Depth 10 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    Send-Response -Stream $Stream -StatusCode $StatusCode -ContentType "application/json; charset=utf-8" -BodyBytes $bytes
}

function Read-HttpRequest($stream) {
    $ms = New-Object System.IO.MemoryStream
    $buffer = New-Object byte[] 4096
    $headerEndPos = -1

    while ($true) {
        $bytesRead = $stream.Read($buffer, 0, $buffer.Length)
        if ($bytesRead -le 0) { break }
        $ms.Write($buffer, 0, $bytesRead)
        
        $allBytes = $ms.ToArray()
        for ($i = 0; $i -le $allBytes.Length - 4; $i++) {
            if ($allBytes[$i] -eq 13 -and $allBytes[$i+1] -eq 10 -and $allBytes[$i+2] -eq 13 -and $allBytes[$i+3] -eq 10) {
                $headerEndPos = $i
                break
            }
        }
        if ($headerEndPos -ge 0) { break }
    }

    if ($headerEndPos -lt 0) { return $null }

    $allBytes = $ms.ToArray()
    $headerBytes = $allBytes[0..($headerEndPos - 1)]
    $headerText = [System.Text.Encoding]::ASCII.GetString($headerBytes)
    $lines = $headerText -split "\r\n"
    $reqLine = $lines[0]
    $headers = @{}
    for ($i = 1; $i -lt $lines.Length; $i++) {
        $idx = $lines[$i].IndexOf(":")
        if ($idx -gt 0) {
            $headers[$lines[$i].Substring(0, $idx).Trim().ToLower()] = $lines[$i].Substring($idx + 1).Trim()
        }
    }

    $contentLength = 0
    if ($headers.ContainsKey("content-length")) {
        [int]::TryParse($headers["content-length"], [ref]$contentLength) | Out-Null
    }

    $bodyStart = $headerEndPos + 4
    $existingBodyBytes = $allBytes.Length - $bodyStart
    $bodyMs = New-Object System.IO.MemoryStream
    if ($existingBodyBytes -gt 0) {
        $bodyMs.Write($allBytes, $bodyStart, $existingBodyBytes)
    }

    while ($bodyMs.Length -lt $contentLength) {
        $needed = $contentLength - $bodyMs.Length
        $toRead = [Math]::Min(4096, $needed)
        $read = $stream.Read($buffer, 0, $toRead)
        if ($read -le 0) { break }
        $bodyMs.Write($buffer, 0, $read)
    }

    $bodyStr = [System.Text.Encoding]::UTF8.GetString($bodyMs.ToArray())
    return @{
        RequestLine = $reqLine
        Headers = $headers
        Body = $bodyStr
    }
}

# Main Loop
try {
    while ($true) {
        if (-not $listener.Pending()) {
            Start-Sleep -Milliseconds 25
            continue
        }

        $client = $listener.AcceptTcpClient()
        $stream = $client.GetStream()

        $req = Read-HttpRequest $stream
        if (-not $req) {
            $client.Close()
            continue
        }

        $parts = $req.RequestLine -split " "
        $method = $parts[0]
        $rawUrl = $parts[1]
        $headers = $req.Headers
        $body = $req.Body

        # Parse URL Path & Query
        $urlParts = $rawUrl -split "\?", 2
        $path = [System.Uri]::UnescapeDataString($urlParts[0])
        $queryString = if ($urlParts.Length -gt 1) { $urlParts[1] } else { "" }
        $queryParams = @{}
        if ($queryString) {
            foreach ($pair in ($queryString -split "&")) {
                $kv = $pair -split "=", 2
                if ($kv.Length -gt 1) {
                    $queryParams[[System.Uri]::UnescapeDataString($kv[0])] = [System.Uri]::UnescapeDataString($kv[1])
                }
            }
        }

        # CORS Preflight
        if ($method -eq "OPTIONS") {
            Send-Response -Stream $stream -StatusCode 204 -StatusText "No Content"
            $client.Close()
            continue
        }

        # API Routes
        if ($path.StartsWith("/api/")) {
            try {
                if ($path -eq "/api/status") {
                    $postList = if (Test-Path $postsFile) { Get-Content $postsFile -Raw -Encoding UTF8 | ConvertFrom-Json } else { @() }
                    $classList = if (Test-Path $classesFile) { Get-Content $classesFile -Raw -Encoding UTF8 | ConvertFrom-Json } else { @() }
                    Send-JsonResponse -Stream $stream -Data @{
                        status = "online"
                        ip = $localIP
                        port = $Port
                        postsCount = ($postList | Measure-Object).Count
                        classesCount = ($classList | Measure-Object).Count
                    }
                }
                elseif ($path -eq "/api/classes") {
                    if ($method -eq "GET") {
                        $cJson = Get-Content $classesFile -Raw -Encoding UTF8
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($cJson)
                        Send-Response -Stream $stream -ContentType "application/json; charset=utf-8" -BodyBytes $bytes
                    }
                    elseif ($method -eq "POST") {
                        Set-Content -Path $classesFile -Value $body -Encoding UTF8
                        Send-JsonResponse -Stream $stream -Data @{ success = $true }
                    }
                }
                elseif ($path -eq "/api/posts") {
                    if ($method -eq "GET") {
                        $pJson = Get-Content $postsFile -Raw -Encoding UTF8
                        $posts = if ($pJson) { @($pJson | ConvertFrom-Json) } else { @() }
                        if ($queryParams.ContainsKey("class") -and -not [string]::IsNullOrWhiteSpace($queryParams["class"])) {
                            $targetClass = $queryParams["class"]
                            $posts = @($posts | Where-Object { $_.classId -eq $targetClass })
                        }
                        Send-JsonResponse -Stream $stream -Data $posts
                    }
                    elseif ($method -eq "POST") {
                        $newPost = $body | ConvertFrom-Json
                        if (-not $newPost.id) {
                            $newPost | Add-Member -MemberType NoteProperty -Name "id" -Value ("post-" + [System.Guid]::NewGuid().ToString().Substring(0, 8)) -Force
                        }
                        if (-not $newPost.createdAt) {
                            $newPost | Add-Member -MemberType NoteProperty -Name "createdAt" -Value ((Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")) -Force
                        }
                        if (-not $newPost.likes) {
                            $newPost | Add-Member -MemberType NoteProperty -Name "likes" -Value 0 -Force
                        }
                        if (-not $newPost.comments) {
                            $newPost | Add-Member -MemberType NoteProperty -Name "comments" -Value @() -Force
                        }

                        $pJson = Get-Content $postsFile -Raw -Encoding UTF8
                        $existing = if ($pJson) { @($pJson | ConvertFrom-Json) } else { @() }
                        $posts = @($newPost) + $existing
                        $outJson = $posts | ConvertTo-Json -Depth 10
                        Set-Content -Path $postsFile -Value $outJson -Encoding UTF8
                        Send-JsonResponse -Stream $stream -StatusCode 201 -Data $newPost
                    }
                }
                elseif ($path -match "^/api/posts/([^/]+)/like$") {
                    $targetId = $Matches[1]
                    $pJson = Get-Content $postsFile -Raw -Encoding UTF8
                    $posts = if ($pJson) { @($pJson | ConvertFrom-Json) } else { @() }
                    $updated = $null
                    foreach ($p in $posts) {
                        if ($p.id -eq $targetId) {
                            $p.likes = [int]$p.likes + 1
                            $updated = $p
                            break
                        }
                    }
                    $outJson = $posts | ConvertTo-Json -Depth 10
                    Set-Content -Path $postsFile -Value $outJson -Encoding UTF8
                    Send-JsonResponse -Stream $stream -Data @{ success = $true; likes = $updated.likes }
                }
                elseif ($path -match "^/api/posts/([^/]+)/comment$") {
                    $targetId = $Matches[1]
                    $commentData = $body | ConvertFrom-Json
                    $pJson = Get-Content $postsFile -Raw -Encoding UTF8
                    $posts = if ($pJson) { @($pJson | ConvertFrom-Json) } else { @() }
                    $updatedComments = @()
                    foreach ($p in $posts) {
                        if ($p.id -eq $targetId) {
                            if (-not $p.comments) { $p | Add-Member -MemberType NoteProperty -Name "comments" -Value @() -Force }
                            $commentObj = [PSCustomObject]@{
                                id = "c-" + [System.Guid]::NewGuid().ToString().Substring(0, 6)
                                studentName = $commentData.studentName
                                content = $commentData.content
                                createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                            }
                            $p.comments = @($p.comments) + @($commentObj)
                            $updatedComments = $p.comments
                            break
                        }
                    }
                    $outJson = $posts | ConvertTo-Json -Depth 10
                    Set-Content -Path $postsFile -Value $outJson -Encoding UTF8
                    Send-JsonResponse -Stream $stream -Data @{ success = $true; comments = $updatedComments }
                }
                elseif ($path -match "^/api/posts/([^/]+)$") {
                    $targetId = $Matches[1]
                    $pJson = Get-Content $postsFile -Raw -Encoding UTF8
                    $posts = if ($pJson) { @($pJson | ConvertFrom-Json) } else { @() }
                    
                    if ($method -eq "PUT") {
                        $updateData = $body | ConvertFrom-Json
                        $found = $false
                        for ($i = 0; $i -lt $posts.Count; $i++) {
                            if ($posts[$i].id -eq $targetId) {
                                foreach ($prop in $updateData.PSObject.Properties) {
                                    $posts[$i] | Add-Member -MemberType NoteProperty -Name $prop.Name -Value $prop.Value -Force
                                }
                                $found = $true
                                break
                            }
                        }
                        if ($found) {
                            $outJson = $posts | ConvertTo-Json -Depth 10
                            Set-Content -Path $postsFile -Value $outJson -Encoding UTF8
                            Send-JsonResponse -Stream $stream -Data @{ success = $true }
                        } else {
                            Send-JsonResponse -Stream $stream -StatusCode 404 -Data @{ error = "Post not found" }
                        }
                    }
                    elseif ($method -eq "DELETE") {
                        $filtered = @($posts | Where-Object { $_.id -ne $targetId })
                        $outJson = $filtered | ConvertTo-Json -Depth 10
                        Set-Content -Path $postsFile -Value $outJson -Encoding UTF8
                        Send-JsonResponse -Stream $stream -Data @{ success = $true }
                    }
                }
                else {
                    Send-JsonResponse -Stream $stream -StatusCode 404 -Data @{ error = "Endpoint not found" }
                }
            } catch {
                Write-Host "API Error: $_" -ForegroundColor Red
                Send-JsonResponse -Stream $stream -StatusCode 500 -Data @{ error = $_.ToString() }
            }
            $client.Close()
            continue
        }

        # Static File Serving
        $relPath = if ($path -eq "/" -or [string]::IsNullOrEmpty($path)) { "index.html" } else { $path.TrimStart('/') }
        $filePath = Join-Path $publicDir $relPath

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $cType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
            $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
            Send-Response -Stream $stream -StatusCode 200 -ContentType $cType -BodyBytes $fileBytes
        }
        else {
            $indexFile = Join-Path $publicDir "index.html"
            if (Test-Path $indexFile) {
                $fileBytes = [System.IO.File]::ReadAllBytes($indexFile)
                Send-Response -Stream $stream -StatusCode 200 -ContentType "text/html; charset=utf-8" -BodyBytes $fileBytes
            } else {
                $notFoundBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
                Send-Response -Stream $stream -StatusCode 404 -ContentType "text/plain" -BodyBytes $notFoundBytes
            }
        }

        $client.Close()
    }
}
finally {
    $listener.Stop()
    Write-Host "`n서버가 안전하게 중지되었습니다." -ForegroundColor Yellow
}
