#!/bin/bash
# ============================================================
# KibanCMS — New Client Setup
# ============================================================
# Automates:
#   1. Run database schema on new Supabase project
#   2. Create admin user
#   3. Promote to super_admin
#   4. Generate TENANTS JSON config
#
# Prerequisites:
#   - Supabase project created (manually)
#   - Storage bucket "media" created (manually, public)
#   - Supabase URL, anon key, service role key ready
#
# Usage:
#   pnpm new-client
#   or: bash scripts/new-client.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SCHEMA_FILE="$PROJECT_ROOT/database/migrations/CLEAN_RESET.sql"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}  KibanCMS — New Client Setup${NC}"
echo -e "${BOLD}========================================${NC}"
echo ""

# ── Step 1: Collect info ──

read -p "$(echo -e ${CYAN}Client ID${NC} \(lowercase, no spaces — e.g. lunes, solfil\): )" CLIENT_ID
if [ -z "$CLIENT_ID" ]; then
  echo -e "${RED}Client ID is required.${NC}"
  exit 1
fi
CLIENT_ID=$(echo "$CLIENT_ID" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')

read -p "$(echo -e ${CYAN}Client name${NC} \(display name — e.g. LUNES, Solfil\): )" CLIENT_NAME
if [ -z "$CLIENT_NAME" ]; then
  CLIENT_NAME="$CLIENT_ID"
fi

echo ""
echo -e "${YELLOW}Supabase credentials (from the new project dashboard):${NC}"
echo ""

read -p "$(echo -e ${CYAN}Supabase URL${NC} \(e.g. https://xxx.supabase.co\): )" SUPABASE_URL
if [ -z "$SUPABASE_URL" ]; then
  echo -e "${RED}Supabase URL is required.${NC}"
  exit 1
fi

read -p "$(echo -e ${CYAN}Supabase Anon Key${NC}: )" SUPABASE_ANON_KEY
if [ -z "$SUPABASE_ANON_KEY" ]; then
  echo -e "${RED}Anon Key is required.${NC}"
  exit 1
fi

read -p "$(echo -e ${CYAN}Supabase Service Role Key${NC}: )" SUPABASE_SERVICE_KEY
if [ -z "$SUPABASE_SERVICE_KEY" ]; then
  echo -e "${RED}Service Role Key is required.${NC}"
  exit 1
fi

echo ""
echo -e "${YELLOW}Admin user for this client:${NC}"
echo ""

read -p "$(echo -e ${CYAN}Admin email${NC}: )" ADMIN_EMAIL
if [ -z "$ADMIN_EMAIL" ]; then
  echo -e "${RED}Admin email is required.${NC}"
  exit 1
fi

read -sp "$(echo -e ${CYAN}Admin password${NC} \(min 6 chars\): )" ADMIN_PASSWORD
echo ""
if [ ${#ADMIN_PASSWORD} -lt 6 ]; then
  echo -e "${RED}Password must be at least 6 characters.${NC}"
  exit 1
fi

echo ""
echo -e "${YELLOW}Client website (for Origin-based tenant resolution):${NC}"
echo ""

read -p "$(echo -e ${CYAN}Website origin${NC} \(e.g. https://be-lunes.pt, leave empty if none yet\): )" CLIENT_ORIGIN

echo ""
echo -e "${BOLD}──────────────────────────────────────${NC}"
echo -e "  Client:     ${GREEN}$CLIENT_NAME${NC} ($CLIENT_ID)"
echo -e "  Supabase:   $SUPABASE_URL"
echo -e "  Admin:      $ADMIN_EMAIL"
echo -e "  Origin:     ${CLIENT_ORIGIN:-none}"
echo -e "${BOLD}──────────────────────────────────────${NC}"
echo ""
read -p "Proceed? (y/N) " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

echo ""

# ── Step 2: Run database schema ──

echo -e "${CYAN}[1/4]${NC} Running database schema..."

SCHEMA_SQL=$(cat "$SCHEMA_FILE")

# Use Supabase REST API to run SQL via the management API
# We use the PostgREST RPC endpoint with the service role key
RESULT=$(curl -s -w "\n%{http_code}" -X POST \
  "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"SELECT 1\"}" 2>/dev/null || true)

# The exec_sql RPC doesn't exist by default. Use the SQL endpoint instead.
# Supabase has a /pg endpoint accessible via service role in newer versions.
# Fallback: use psql if available, otherwise instruct user.

# Try the Supabase SQL API (v2)
SQL_API_URL="${SUPABASE_URL}/rest/v1/"

# Since we can't run arbitrary SQL via REST easily, we'll use the
# Supabase Management API if available, or instruct the user.

# Check if we have the project ref from the URL
PROJECT_REF=$(echo "$SUPABASE_URL" | sed -n 's|https://\([^.]*\)\.supabase\.co|\1|p')

if [ -z "$PROJECT_REF" ]; then
  echo -e "${YELLOW}  Could not extract project ref from URL.${NC}"
  echo -e "${YELLOW}  Please run CLEAN_RESET.sql manually in the Supabase SQL Editor.${NC}"
  SCHEMA_DONE=false
else
  # Try using the Supabase database connection string
  # The service role key gives us access to run SQL via PostgREST

  # Alternative: create a temporary function to run our schema
  # For now, the most reliable way without psql is to instruct the user

  echo -e "${YELLOW}  Automatic SQL execution requires psql or Supabase CLI.${NC}"

  # Check if supabase CLI is available
  if command -v supabase &> /dev/null; then
    echo -e "  ${GREEN}Supabase CLI found. Running schema...${NC}"
    echo "$SCHEMA_SQL" | supabase db execute --project-ref "$PROJECT_REF" 2>/dev/null
    if [ $? -eq 0 ]; then
      echo -e "  ${GREEN}Schema applied successfully.${NC}"
      SCHEMA_DONE=true
    else
      echo -e "  ${YELLOW}Supabase CLI failed. Manual step needed.${NC}"
      SCHEMA_DONE=false
    fi
  elif command -v psql &> /dev/null; then
    echo -e "  ${GREEN}psql found.${NC}"
    # Supabase connection string: postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
    echo -e "  ${YELLOW}Enter the database password (from Supabase project settings > Database):${NC}"
    read -sp "  DB Password: " DB_PASSWORD
    echo ""
    DB_URL="postgresql://postgres.${PROJECT_REF}:${DB_PASSWORD}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"
    echo "$SCHEMA_SQL" | psql "$DB_URL" 2>/dev/null
    if [ $? -eq 0 ]; then
      echo -e "  ${GREEN}Schema applied successfully.${NC}"
      SCHEMA_DONE=true
    else
      echo -e "  ${YELLOW}psql connection failed. Manual step needed.${NC}"
      SCHEMA_DONE=false
    fi
  else
    SCHEMA_DONE=false
  fi

  if [ "$SCHEMA_DONE" = false ]; then
    echo ""
    echo -e "  ${YELLOW}ACTION REQUIRED:${NC} Copy and run this file in Supabase SQL Editor:"
    echo -e "  ${BOLD}$SCHEMA_FILE${NC}"
    echo ""
    read -p "  Press Enter when done..." _
  fi
fi

echo -e "  ${GREEN}Done.${NC}"

# ── Step 3: Create admin user ──

echo -e "${CYAN}[2/4]${NC} Creating admin user..."

CREATE_RESULT=$(curl -s -X POST \
  "${SUPABASE_URL}/auth/v1/admin/users" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${ADMIN_EMAIL}\",
    \"password\": \"${ADMIN_PASSWORD}\",
    \"email_confirm\": true,
    \"user_metadata\": {
      \"full_name\": \"${CLIENT_NAME} Admin\"
    }
  }")

USER_ID=$(echo "$CREATE_RESULT" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$USER_ID" ]; then
  # Check if user already exists
  ERROR_MSG=$(echo "$CREATE_RESULT" | grep -o '"message":"[^"]*"' | head -1 | cut -d'"' -f4)
  if echo "$ERROR_MSG" | grep -qi "already"; then
    echo -e "  ${YELLOW}User already exists. Continuing...${NC}"
  else
    echo -e "  ${RED}Failed to create user: $ERROR_MSG${NC}"
    echo -e "  ${YELLOW}Create manually in Supabase Auth dashboard.${NC}"
    read -p "  Press Enter when done..." _
  fi
else
  echo -e "  ${GREEN}User created: $ADMIN_EMAIL (ID: $USER_ID)${NC}"
fi

# ── Step 4: Promote to super_admin ──

echo -e "${CYAN}[3/4]${NC} Promoting to super_admin..."

# Use PostgREST to update the profile
PROMOTE_RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
  "${SUPABASE_URL}/rest/v1/profiles?email=eq.${ADMIN_EMAIL}" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{\"role\": \"super_admin\", \"full_name\": \"${CLIENT_NAME} Admin\"}")

if [ "$PROMOTE_RESULT" = "204" ] || [ "$PROMOTE_RESULT" = "200" ]; then
  echo -e "  ${GREEN}Promoted to super_admin.${NC}"
else
  echo -e "  ${YELLOW}Could not promote automatically (HTTP $PROMOTE_RESULT).${NC}"
  echo -e "  ${YELLOW}Run in SQL Editor: UPDATE profiles SET role = 'super_admin' WHERE email = '${ADMIN_EMAIL}';${NC}"
fi

# ── Step 5: Generate config ──

echo -e "${CYAN}[4/4]${NC} Generating config..."

ORIGINS_JSON="[]"
if [ -n "$CLIENT_ORIGIN" ]; then
  ORIGINS_JSON="[\"${CLIENT_ORIGIN}\"]"
fi

TENANT_JSON=$(cat <<EOF
{
  "${CLIENT_ID}": {
    "supabaseUrl": "${SUPABASE_URL}",
    "supabaseAnonKey": "${SUPABASE_ANON_KEY}",
    "supabaseServiceKey": "${SUPABASE_SERVICE_KEY}",
    "hostnames": ["${CLIENT_ID}.kiban.pt"],
    "origins": ${ORIGINS_JSON}
  }
}
EOF
)

# Save config to file
CONFIG_DIR="$PROJECT_ROOT/clients"
mkdir -p "$CONFIG_DIR"
echo "$TENANT_JSON" > "$CONFIG_DIR/${CLIENT_ID}.json"

echo -e "  ${GREEN}Config saved to clients/${CLIENT_ID}.json${NC}"

# ── Summary ──

echo ""
echo -e "${BOLD}========================================${NC}"
echo -e "${GREEN}  Client setup complete!${NC}"
echo -e "${BOLD}========================================${NC}"
echo ""
echo -e "  ${BOLD}Client:${NC}      $CLIENT_NAME ($CLIENT_ID)"
echo -e "  ${BOLD}Supabase:${NC}    $SUPABASE_URL"
echo -e "  ${BOLD}Admin:${NC}       $ADMIN_EMAIL"
echo -e "  ${BOLD}Role:${NC}        super_admin"
echo ""
echo -e "${BOLD}Next steps:${NC}"
echo ""
echo -e "  1. ${YELLOW}Verify${NC}: Open Supabase dashboard and confirm tables exist"
echo ""
echo -e "  2. ${YELLOW}Storage${NC}: Create bucket 'media' (public) in Supabase Storage"
echo -e "     (if not done already)"
echo ""
echo -e "  3. ${YELLOW}TENANTS env var${NC}: Merge this into your Railway TENANTS variable:"
echo ""
echo -e "${CYAN}$TENANT_JSON${NC}"
echo ""
echo -e "  4. ${YELLOW}ALLOWED_ORIGINS${NC}: Add ${CLIENT_ORIGIN:-client domain} to ALLOWED_ORIGINS"
echo ""
echo -e "  5. ${YELLOW}Test${NC}: Login at kiban.pt with $ADMIN_EMAIL"
echo ""
echo -e "${BOLD}========================================${NC}"
