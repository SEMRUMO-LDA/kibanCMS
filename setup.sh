#!/bin/bash

# KibanCMS - Interactive Onboarding Script
# This script automates the complete setup process

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Print functions
print_header() {
    echo -e "${BLUE}${BOLD}"
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║                                                        ║"
    echo "║            🚀 KIBAN CMS - Quick Start                  ║"
    echo "║                                                        ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_step() {
    echo -e "${BLUE}${BOLD}➜ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BOLD}ℹ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    print_step "Checking prerequisites..."
    echo ""

    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        echo "Please install Node.js (>= 18.0.0) from: https://nodejs.org/"
        exit 1
    fi
    NODE_VERSION=$(node -v | cut -d'v' -f2)
    print_success "Node.js v$NODE_VERSION"

    # Check pnpm
    if ! command -v pnpm &> /dev/null; then
        print_warning "pnpm is not installed"
        echo ""
        read -p "Would you like to install pnpm now? (Y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            npm install -g pnpm
            print_success "pnpm installed"
        else
            print_error "pnpm is required for this project"
            echo "Install it with: npm install -g pnpm"
            exit 1
        fi
    else
        PNPM_VERSION=$(pnpm -v)
        print_success "pnpm v$PNPM_VERSION"
    fi

    # Check if Supabase CLI is installed (optional)
    if command -v supabase &> /dev/null; then
        SUPABASE_VERSION=$(supabase --version | head -n1 | cut -d' ' -f3)
        print_success "Supabase CLI v$SUPABASE_VERSION (optional)"
    else
        print_info "Supabase CLI not installed (optional)"
        echo "  You can install it later from: https://supabase.com/docs/guides/cli"
    fi

    echo ""
}

# Setup environment
setup_environment() {
    print_step "Setting up environment variables..."
    echo ""

    if [ -f .env ]; then
        print_warning ".env file already exists!"
        read -p "Do you want to overwrite it? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Keeping existing .env file"
            return
        fi
    fi

    # Copy .env.example to .env
    cp .env.example .env

    echo "Please provide your Supabase configuration:"
    echo "(You can find this in your Supabase project settings)"
    echo ""

    # Ask for Supabase URL
    read -p "Supabase URL (e.g., https://xxxxx.supabase.co): " SUPABASE_URL
    while [[ ! $SUPABASE_URL =~ ^https?:// ]]; do
        print_error "Invalid URL format"
        read -p "Supabase URL: " SUPABASE_URL
    done

    # Ask for Supabase Anon Key
    read -p "Supabase Anon Key: " SUPABASE_ANON_KEY
    while [ -z "$SUPABASE_ANON_KEY" ]; do
        print_error "Anon key cannot be empty"
        read -p "Supabase Anon Key: " SUPABASE_ANON_KEY
    done

    # Update .env file
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|VITE_SUPABASE_URL=.*|VITE_SUPABASE_URL=$SUPABASE_URL|g" .env
        sed -i '' "s|VITE_SUPABASE_ANON_KEY=.*|VITE_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY|g" .env
    else
        # Linux
        sed -i "s|VITE_SUPABASE_URL=.*|VITE_SUPABASE_URL=$SUPABASE_URL|g" .env
        sed -i "s|VITE_SUPABASE_ANON_KEY=.*|VITE_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY|g" .env
    fi

    print_success "Environment configuration saved to .env"
    echo ""
}

# Install dependencies
install_dependencies() {
    print_step "Installing dependencies..."
    echo ""
    print_info "This may take a few minutes..."
    echo ""

    pnpm install

    print_success "Dependencies installed"
    echo ""
}

# Setup database
setup_database() {
    print_step "Database setup"
    echo ""

    print_info "Would you like to initialize your Supabase database now?"
    echo ""
    echo "Options:"
    echo "  1) I already ran the migrations in Supabase"
    echo "  2) Help me run the migrations"
    echo "  3) Skip for now (I'll do it later)"
    echo ""

    read -p "Choose an option (1-3): " -n 1 -r
    echo
    echo ""

    case $REPLY in
        1)
            print_success "Great! Your database should be ready"
            ;;
        2)
            print_info "To run the database migrations:"
            echo ""
            echo "1. Go to your Supabase project dashboard"
            echo "2. Navigate to 'SQL Editor'"
            echo "3. Run the SQL files from database/migrations/ in order:"
            echo "   - 001_initial_schema.sql"
            echo "   - 005_seed_data.sql"
            echo "   - 006_onboarding_manifesto.sql"
            echo "   - 007_api_keys.sql"
            echo "   - 009_webhooks.sql"
            echo ""
            read -p "Press Enter when you're done..."
            print_success "Database migrations completed"
            ;;
        3)
            print_warning "Remember to run the database migrations later!"
            echo "See: database/README.md for instructions"
            ;;
        *)
            print_warning "Invalid option. Skipping database setup."
            ;;
    esac
    echo ""
}

# Show next steps
show_next_steps() {
    echo ""
    echo -e "${GREEN}${BOLD}"
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║                                                        ║"
    echo "║              ✨ Setup Complete! ✨                     ║"
    echo "║                                                        ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""

    print_step "Next Steps:"
    echo ""
    echo "1️⃣  Start the development servers:"
    echo "   ${BOLD}pnpm dev${NC}"
    echo ""
    echo "   This will start:"
    echo "   • Admin UI: http://localhost:5173"
    echo "   • API Server: http://localhost:5000"
    echo ""
    echo "2️⃣  (Optional) Setup the example frontend:"
    echo "   ${BOLD}pnpm setup:example${NC}"
    echo "   ${BOLD}pnpm dev:example${NC}"
    echo ""
    echo "   Example will be at: http://localhost:3000"
    echo ""

    print_info "Useful commands:"
    echo "   pnpm dev:admin    - Start only the Admin UI"
    echo "   pnpm dev:api      - Start only the API Server"
    echo "   pnpm build        - Build all packages"
    echo "   pnpm test         - Run tests"
    echo ""

    print_info "Documentation:"
    echo "   • README.md                - Project overview"
    echo "   • ARCHITECTURE.md          - Architecture guide"
    echo "   • FRONTEND_INTEGRATION.md  - Integration guide"
    echo "   • database/README.md       - Database setup"
    echo ""

    echo -e "${BLUE}Happy coding! 🎉${NC}"
    echo ""
}

# Main execution
main() {
    clear
    print_header
    echo ""

    check_prerequisites
    setup_environment
    install_dependencies
    setup_database
    show_next_steps
}

# Run main function
main
