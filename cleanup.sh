#!/bin/bash
# ============================================================
# CLEANUP SCRIPT - Remove complexidade para v1.0
# ============================================================

echo "🧹 Limpando projeto para v1.0..."

# 1. Mover migrations complexas para backup
echo "📦 Backing up complex migrations..."
mkdir -p database/migrations-v2-backup
mv database/migrations/002_advanced_schema.sql database/migrations-v2-backup/ 2>/dev/null
mv database/migrations/003_audit_and_analytics.sql database/migrations-v2-backup/ 2>/dev/null
mv database/migrations/004_ai_and_geo.sql database/migrations-v2-backup/ 2>/dev/null
mv database/migrations/006_onboarding_manifesto.sql database/migrations-v2-backup/ 2>/dev/null
mv database/migrations/010_lunes_collections.sql database/migrations-v2-backup/ 2>/dev/null

# 2. Remover documentação confusa/duplicada
echo "📚 Cleaning up docs..."
mkdir -p docs-archive
mv TROUBLESHOOTING*.md docs-archive/ 2>/dev/null
mv FIX_*.md docs-archive/ 2>/dev/null
mv EXECUTE_*.md docs-archive/ 2>/dev/null
mv V1_*.md docs-archive/ 2>/dev/null
mv COLLECTION_BUILDER*.md docs-archive/ 2>/dev/null
mv FRONTEND_INTEGRATION.md docs-archive/ 2>/dev/null # Keep only GUIDE version

# 3. Remover código morto
echo "🗑️ Removing dead code..."
rm -f apps/api/src/routes/entries-complete.ts  # Usa collection_slug errado
rm -f packages/kiban-client/src/client-complete.ts  # Inconsistente

# 4. Criar estrutura limpa
echo "✨ Creating clean structure..."
cat > database/migrations/README.md << 'EOF'
# Database Migrations

## v1.0 (Production)
- 001_initial_schema.sql - Core tables (collections, entries, media, profiles)
- 007_api_keys.sql - API authentication
- 008_generate_api_key_for_user.sql - Helper function
- 009_webhooks.sql - Webhook system

## v2.0 (Future)
See migrations-v2-backup/ for advanced features:
- Multi-tenancy (organizations)
- AI features
- Geo location
- Content analytics
- i18n support
EOF

echo "✅ Cleanup complete!"
echo ""
echo "Next steps:"
echo "1. Run seed in Supabase: scripts/seed-v1-correto.sql"
echo "2. Test admin panel: http://localhost:5173"
echo "3. Start implementing core features"