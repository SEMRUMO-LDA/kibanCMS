#!/bin/bash

# KibanCMS - Diagnostic Script
# This script helps diagnose common issues with the admin dashboard

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════╗"
echo "║   KibanCMS - Diagnostic Tool              ║"
echo "╚════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# Check .env file
echo -e "${BLUE}[1/5] Checking environment configuration...${NC}"
if [ ! -f .env ]; then
    echo -e "${RED}✗ .env file not found!${NC}"
    echo "  Run: cp .env.example .env"
    exit 1
fi

SUPABASE_URL=$(grep VITE_SUPABASE_URL .env | cut -d '=' -f2)
SUPABASE_KEY=$(grep VITE_SUPABASE_ANON_KEY .env | cut -d '=' -f2)

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
    echo -e "${RED}✗ Missing Supabase credentials in .env${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Environment configured${NC}"
echo "  URL: $SUPABASE_URL"
echo ""

# Check if admin is running
echo -e "${BLUE}[2/5] Checking if admin is running...${NC}"
if lsof -ti:5173 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Admin running on port 5173${NC}"
    echo "  URL: http://localhost:5173"
else
    echo -e "${YELLOW}⚠ Admin is not running${NC}"
    echo "  Start it with: pnpm dev:admin"
fi
echo ""

# Test Supabase connection
echo -e "${BLUE}[3/5] Testing Supabase connection...${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SUPABASE_URL/rest/v1/" -H "apikey: $SUPABASE_KEY")

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Successfully connected to Supabase${NC}"
else
    echo -e "${RED}✗ Failed to connect to Supabase (HTTP $HTTP_CODE)${NC}"
    echo "  Check your credentials in .env"
    exit 1
fi
echo ""

# Check if tables exist
echo -e "${BLUE}[4/5] Checking database tables...${NC}"

# Check profiles table
PROFILES_CHECK=$(curl -s "$SUPABASE_URL/rest/v1/profiles?select=id&limit=1" \
    -H "apikey: $SUPABASE_KEY" \
    -H "Authorization: Bearer $SUPABASE_KEY" | jq -r 'type')

if [ "$PROFILES_CHECK" = "array" ]; then
    echo -e "${GREEN}✓ profiles table exists${NC}"
else
    echo -e "${RED}✗ profiles table missing or inaccessible${NC}"
    echo "  Run migrations in Supabase SQL Editor"
fi

# Check collections table
COLLECTIONS_CHECK=$(curl -s "$SUPABASE_URL/rest/v1/collections?select=id&limit=1" \
    -H "apikey: $SUPABASE_KEY" \
    -H "Authorization: Bearer $SUPABASE_KEY" | jq -r 'type')

if [ "$COLLECTIONS_CHECK" = "array" ]; then
    echo -e "${GREEN}✓ collections table exists${NC}"
else
    echo -e "${RED}✗ collections table missing or inaccessible${NC}"
    echo "  Run migrations in Supabase SQL Editor"
fi

# Check entries table
ENTRIES_CHECK=$(curl -s "$SUPABASE_URL/rest/v1/entries?select=id&limit=1" \
    -H "apikey: $SUPABASE_KEY" \
    -H "Authorization: Bearer $SUPABASE_KEY" | jq -r 'type')

if [ "$ENTRIES_CHECK" = "array" ]; then
    echo -e "${GREEN}✓ entries table exists${NC}"
else
    echo -e "${RED}✗ entries table missing or inaccessible${NC}"
    echo "  Run migrations in Supabase SQL Editor"
fi

# Check media table
MEDIA_CHECK=$(curl -s "$SUPABASE_URL/rest/v1/media?select=id&limit=1" \
    -H "apikey: $SUPABASE_KEY" \
    -H "Authorization: Bearer $SUPABASE_KEY" | jq -r 'type')

if [ "$MEDIA_CHECK" = "array" ]; then
    echo -e "${GREEN}✓ media table exists${NC}"
else
    echo -e "${RED}✗ media table missing or inaccessible${NC}"
    echo "  Run migrations in Supabase SQL Editor"
fi
echo ""

# Check data counts
echo -e "${BLUE}[5/5] Checking data counts...${NC}"

COLLECTIONS_COUNT=$(curl -s "$SUPABASE_URL/rest/v1/collections?select=count" \
    -H "apikey: $SUPABASE_KEY" \
    -H "Authorization: Bearer $SUPABASE_KEY" \
    -H "Prefer: count=exact" | jq -r 'length')

ENTRIES_COUNT=$(curl -s "$SUPABASE_URL/rest/v1/entries?select=count" \
    -H "apikey: $SUPABASE_KEY" \
    -H "Authorization: Bearer $SUPABASE_KEY" \
    -H "Prefer: count=exact" | jq -r 'length')

PROFILES_COUNT=$(curl -s "$SUPABASE_URL/rest/v1/profiles?select=count" \
    -H "apikey: $SUPABASE_KEY" \
    -H "Authorization: Bearer $SUPABASE_KEY" \
    -H "Prefer: count=exact" | jq -r 'length')

echo "  Collections: $COLLECTIONS_COUNT"
echo "  Entries: $ENTRIES_COUNT"
echo "  Users: $PROFILES_COUNT"
echo ""

# Summary
echo -e "${BLUE}"
echo "╔════════════════════════════════════════════╗"
echo "║   Diagnostic Complete                      ║"
echo "╚════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

if [ "$COLLECTIONS_COUNT" = "0" ]; then
    echo -e "${YELLOW}⚠ No collections found${NC}"
    echo "  You need to run the seed migrations:"
    echo "  - database/migrations/005_seed_data.sql"
    echo "  - database/migrations/006_onboarding_manifesto.sql"
    echo ""
fi

if [ "$PROFILES_COUNT" = "0" ]; then
    echo -e "${YELLOW}⚠ No users found${NC}"
    echo "  Create a user in Supabase Dashboard:"
    echo "  1. Go to Authentication > Users"
    echo "  2. Click 'Add User'"
    echo "  3. Enter email and password"
    echo "  4. Then login at http://localhost:5173/login"
    echo ""
fi

echo -e "${GREEN}Next steps:${NC}"
echo "  1. Check the browser console for errors (F12)"
echo "  2. Make sure you're logged in"
echo "  3. Verify RLS policies are configured correctly"
echo ""
