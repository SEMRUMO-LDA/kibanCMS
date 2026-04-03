# KibanCMS - Interactive Onboarding Script (Windows)
# This script automates the complete setup process

$ErrorActionPreference = "Stop"

# Print functions
function Print-Header {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Blue
    Write-Host "║                                                        ║" -ForegroundColor Blue
    Write-Host "║            🚀 KIBAN CMS - Quick Start                  ║" -ForegroundColor Blue
    Write-Host "║                                                        ║" -ForegroundColor Blue
    Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Blue
    Write-Host ""
}

function Print-Step {
    param([string]$Message)
    Write-Host "➜ $Message" -ForegroundColor Blue
}

function Print-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Print-Error {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

function Print-Warning {
    param([string]$Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

function Print-Info {
    param([string]$Message)
    Write-Host "ℹ $Message" -ForegroundColor Cyan
}

# Check prerequisites
function Check-Prerequisites {
    Print-Step "Checking prerequisites..."
    Write-Host ""

    # Check Node.js
    try {
        $nodeVersion = node -v
        Print-Success "Node.js $nodeVersion"
    } catch {
        Print-Error "Node.js is not installed"
        Write-Host "Please install Node.js (>= 18.0.0) from: https://nodejs.org/"
        exit 1
    }

    # Check pnpm
    try {
        $pnpmVersion = pnpm -v
        Print-Success "pnpm v$pnpmVersion"
    } catch {
        Print-Warning "pnpm is not installed"
        Write-Host ""
        $install = Read-Host "Would you like to install pnpm now? (Y/n)"

        if ($install -ne "n" -and $install -ne "N") {
            npm install -g pnpm
            Print-Success "pnpm installed"
        } else {
            Print-Error "pnpm is required for this project"
            Write-Host "Install it with: npm install -g pnpm"
            exit 1
        }
    }

    # Check if Supabase CLI is installed (optional)
    try {
        $supabaseVersion = supabase --version
        Print-Success "Supabase CLI (optional)"
    } catch {
        Print-Info "Supabase CLI not installed (optional)"
        Write-Host "  You can install it later from: https://supabase.com/docs/guides/cli"
    }

    Write-Host ""
}

# Setup environment
function Setup-Environment {
    Print-Step "Setting up environment variables..."
    Write-Host ""

    if (Test-Path .env) {
        Print-Warning ".env file already exists!"
        $overwrite = Read-Host "Do you want to overwrite it? (y/N)"

        if ($overwrite -ne "y" -and $overwrite -ne "Y") {
            Print-Info "Keeping existing .env file"
            return
        }
    }

    # Copy .env.example to .env
    Copy-Item .env.example .env

    Write-Host "Please provide your Supabase configuration:"
    Write-Host "(You can find this in your Supabase project settings)"
    Write-Host ""

    # Ask for Supabase URL
    do {
        $supabaseUrl = Read-Host "Supabase URL (e.g., https://xxxxx.supabase.co)"
        if ($supabaseUrl -notmatch "^https?://") {
            Print-Error "Invalid URL format"
        }
    } while ($supabaseUrl -notmatch "^https?://")

    # Ask for Supabase Anon Key
    do {
        $supabaseAnonKey = Read-Host "Supabase Anon Key"
        if ([string]::IsNullOrWhiteSpace($supabaseAnonKey)) {
            Print-Error "Anon key cannot be empty"
        }
    } while ([string]::IsNullOrWhiteSpace($supabaseAnonKey))

    # Update .env file
    $envContent = Get-Content .env
    $envContent = $envContent -replace "VITE_SUPABASE_URL=.*", "VITE_SUPABASE_URL=$supabaseUrl"
    $envContent = $envContent -replace "VITE_SUPABASE_ANON_KEY=.*", "VITE_SUPABASE_ANON_KEY=$supabaseAnonKey"
    $envContent | Set-Content .env

    Print-Success "Environment configuration saved to .env"
    Write-Host ""
}

# Install dependencies
function Install-Dependencies {
    Print-Step "Installing dependencies..."
    Write-Host ""
    Print-Info "This may take a few minutes..."
    Write-Host ""

    pnpm install

    Print-Success "Dependencies installed"
    Write-Host ""
}

# Setup database
function Setup-Database {
    Print-Step "Database setup"
    Write-Host ""

    Print-Info "Would you like to initialize your Supabase database now?"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  1) I already ran the migrations in Supabase"
    Write-Host "  2) Help me run the migrations"
    Write-Host "  3) Skip for now (I'll do it later)"
    Write-Host ""

    $choice = Read-Host "Choose an option (1-3)"
    Write-Host ""

    switch ($choice) {
        "1" {
            Print-Success "Great! Your database should be ready"
        }
        "2" {
            Print-Info "To run the database migrations:"
            Write-Host ""
            Write-Host "1. Go to your Supabase project dashboard"
            Write-Host "2. Navigate to 'SQL Editor'"
            Write-Host "3. Run the SQL files from database/migrations/ in order:"
            Write-Host "   - 001_initial_schema.sql"
            Write-Host "   - 005_seed_data.sql"
            Write-Host "   - 006_onboarding_manifesto.sql"
            Write-Host "   - 007_api_keys.sql"
            Write-Host "   - 009_webhooks.sql"
            Write-Host ""
            Read-Host "Press Enter when you're done"
            Print-Success "Database migrations completed"
        }
        "3" {
            Print-Warning "Remember to run the database migrations later!"
            Write-Host "See: database/README.md for instructions"
        }
        default {
            Print-Warning "Invalid option. Skipping database setup."
        }
    }
    Write-Host ""
}

# Show next steps
function Show-NextSteps {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║                                                        ║" -ForegroundColor Green
    Write-Host "║              ✨ Setup Complete! ✨                     ║" -ForegroundColor Green
    Write-Host "║                                                        ║" -ForegroundColor Green
    Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""

    Print-Step "Next Steps:"
    Write-Host ""
    Write-Host "1️⃣  Start the development servers:"
    Write-Host "   pnpm dev" -ForegroundColor White
    Write-Host ""
    Write-Host "   This will start:"
    Write-Host "   • Admin UI: http://localhost:5173"
    Write-Host "   • API Server: http://localhost:5000"
    Write-Host ""
    Write-Host "2️⃣  (Optional) Setup the example frontend:"
    Write-Host "   pnpm setup:example:windows" -ForegroundColor White
    Write-Host "   pnpm dev:example" -ForegroundColor White
    Write-Host ""
    Write-Host "   Example will be at: http://localhost:3000"
    Write-Host ""

    Print-Info "Useful commands:"
    Write-Host "   pnpm dev:admin    - Start only the Admin UI"
    Write-Host "   pnpm dev:api      - Start only the API Server"
    Write-Host "   pnpm build        - Build all packages"
    Write-Host "   pnpm test         - Run tests"
    Write-Host ""

    Print-Info "Documentation:"
    Write-Host "   • README.md                - Project overview"
    Write-Host "   • ARCHITECTURE.md          - Architecture guide"
    Write-Host "   • FRONTEND_INTEGRATION.md  - Integration guide"
    Write-Host "   • database/README.md       - Database setup"
    Write-Host ""

    Write-Host "Happy coding! 🎉" -ForegroundColor Blue
    Write-Host ""
}

# Main execution
function Main {
    Clear-Host
    Print-Header

    Check-Prerequisites
    Setup-Environment
    Install-Dependencies
    Setup-Database
    Show-NextSteps
}

# Run main function
Main
