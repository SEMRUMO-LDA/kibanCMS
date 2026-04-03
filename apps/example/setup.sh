#!/bin/bash

# KibanCMS Example Frontend - Setup Script
# This script automates the setup process

set -e

echo "🚀 KibanCMS Example Frontend Setup"
echo "======================================"
echo ""

# Check if .env.local already exists
if [ -f .env.local ]; then
    echo "⚠️  .env.local already exists!"
    read -p "Do you want to overwrite it? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 0
    fi
fi

# Copy .env.example to .env.local
echo "📋 Creating .env.local from template..."
cp .env.example .env.local

# Ask for CMS URL
echo ""
echo "🔗 CMS Configuration"
echo "-------------------"
read -p "Enter your KibanCMS URL (default: http://localhost:5176): " CMS_URL
CMS_URL=${CMS_URL:-http://localhost:5176}

# Ask for API key
echo ""
echo "🔑 API Key Setup"
echo "---------------"
echo "To get your API key:"
echo "  1. Go to: $CMS_URL/settings"
echo "  2. Copy your API key (starts with 'kiban_live_')"
echo ""
read -p "Paste your API key here: " API_KEY

# Validate API key format
if [[ ! $API_KEY =~ ^kiban_live_ ]]; then
    echo "❌ Invalid API key format. It should start with 'kiban_live_'"
    exit 1
fi

# Update .env.local
echo ""
echo "✍️  Writing configuration..."
sed -i.bak "s|NEXT_PUBLIC_KIBAN_URL=.*|NEXT_PUBLIC_KIBAN_URL=$CMS_URL|g" .env.local
sed -i.bak "s|KIBAN_API_KEY=.*|KIBAN_API_KEY=$API_KEY|g" .env.local
rm .env.local.bak 2>/dev/null || true

echo "✅ Configuration saved to .env.local"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo ""
    echo "📦 Installing dependencies..."
    if command -v pnpm &> /dev/null; then
        pnpm install
    elif command -v npm &> /dev/null; then
        npm install
    else
        echo "❌ Neither pnpm nor npm found. Please install Node.js first."
        exit 1
    fi
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "🎉 Ready to start!"
echo ""
echo "Run one of these commands:"
echo "  pnpm dev    # or: npm run dev"
echo ""
echo "Then visit: http://localhost:3000"
echo ""
