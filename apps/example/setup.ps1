# KibanCMS Example Frontend - Setup Script (Windows)
# Run with: .\setup.ps1

Write-Host "🚀 KibanCMS Example Frontend Setup" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Check if .env.local exists
if (Test-Path .env.local) {
    Write-Host "⚠️  .env.local already exists!" -ForegroundColor Yellow
    $overwrite = Read-Host "Do you want to overwrite it? (y/N)"
    if ($overwrite -ne "y" -and $overwrite -ne "Y") {
        Write-Host "Setup cancelled."
        exit
    }
}

# Copy .env.example to .env.local
Write-Host "📋 Creating .env.local from template..." -ForegroundColor Green
Copy-Item .env.example .env.local

# Ask for CMS URL
Write-Host ""
Write-Host "🔗 CMS Configuration" -ForegroundColor Cyan
Write-Host "-------------------"
$cmsUrl = Read-Host "Enter your KibanCMS URL (default: http://localhost:5176)"
if ([string]::IsNullOrWhiteSpace($cmsUrl)) {
    $cmsUrl = "http://localhost:5176"
}

# Ask for API key
Write-Host ""
Write-Host "🔑 API Key Setup" -ForegroundColor Cyan
Write-Host "---------------"
Write-Host "To get your API key:"
Write-Host "  1. Go to: $cmsUrl/settings"
Write-Host "  2. Copy your API key (starts with 'kiban_live_')"
Write-Host ""
$apiKey = Read-Host "Paste your API key here"

# Validate API key
if (-not $apiKey.StartsWith("kiban_live_")) {
    Write-Host "❌ Invalid API key format. It should start with 'kiban_live_'" -ForegroundColor Red
    exit 1
}

# Update .env.local
Write-Host ""
Write-Host "✍️  Writing configuration..." -ForegroundColor Green
(Get-Content .env.local) `
    -replace 'NEXT_PUBLIC_KIBAN_URL=.*', "NEXT_PUBLIC_KIBAN_URL=$cmsUrl" `
    -replace 'KIBAN_API_KEY=.*', "KIBAN_API_KEY=$apiKey" |
    Set-Content .env.local

Write-Host "✅ Configuration saved to .env.local" -ForegroundColor Green

# Install dependencies
if (-not (Test-Path node_modules)) {
    Write-Host ""
    Write-Host "📦 Installing dependencies..." -ForegroundColor Green

    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        pnpm install
    } elseif (Get-Command npm -ErrorAction SilentlyContinue) {
        npm install
    } else {
        Write-Host "❌ Neither pnpm nor npm found. Please install Node.js first." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "✅ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "🎉 Ready to start!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Run one of these commands:"
Write-Host "  pnpm dev    # or: npm run dev"
Write-Host ""
Write-Host "Then visit: http://localhost:3000"
Write-Host ""
