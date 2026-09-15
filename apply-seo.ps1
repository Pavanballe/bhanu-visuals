$ErrorActionPreference = "Stop"

$index = Join-Path $PSScriptRoot "client\index.html"
if (-not (Test-Path $index)) {
  throw "client\index.html was not found. Run this from the Bhanu Visuals project root."
}

$content = Get-Content $index -Raw -Encoding UTF8

# Remove an earlier SEO block if this script is run again.
$content = [regex]::Replace(
  $content,
  '(?s)\s*<!-- BHANU VISUALS SEO: START -->.*?<!-- BHANU VISUALS SEO: END -->\s*',
  "`r`n"
)

$seo = Get-Content (Join-Path $PSScriptRoot "seo-head.html") -Raw -Encoding UTF8

if ($content -match '(?i)</head>') {
  $content = [regex]::Replace($content, '(?i)</head>', "`r`n$seo`r`n</head>", 1)
} else {
  throw "Could not find </head> in client/index.html."
}

Set-Content $index $content -Encoding UTF8

New-Item -ItemType Directory -Force (Join-Path $PSScriptRoot "client\public") | Out-Null

Write-Host "Bhanu Visuals SEO applied." -ForegroundColor Green
Write-Host "Next: npm run build, then commit/push and redeploy Vercel."
