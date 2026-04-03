# DECISÃO ARQUITETURAL CRÍTICA - kibanCMS v1.0

## PROBLEMA
- Migration 001: Define schema v1 simples (collections, entries, media)
- Migration 002-004: Define schema v2 complexo (organizations, AI, geo, etc.)
- Código usa mistura dos dois (inconsistente)

## DECISÃO PARA v1.0

### ✅ ESCOLHIDO: Schema v1 Simplificado

**Manter apenas:**
- collections (id, name, slug, schema, created_by)
- entries (id, collection_id, title, slug, content, status, author_id)
- media (id, filename, uploaded_by)
- profiles (id, email, role)
- api_keys (id, key_hash, profile_id)

**Remover (para v2.0):**
- ❌ organizations (multi-tenancy)
- ❌ content_nodes (estrutura complexa)
- ❌ ai_tasks, geo_locations, taxonomies
- ❌ content_analytics, content_translations

## AÇÕES IMEDIATAS

1. **NÃO executar migrations 002-004**
2. **Usar apenas migration 001 + 007 (api_keys)**
3. **Código usar collection_id (não collection_slug)**
4. **Admin usar API (não Supabase direto)**

## BENEFÍCIOS
- Consistência total
- Código mais simples
- Menos bugs
- Lançamento mais rápido

## ROADMAP
- **v1.0** (1 semana): CMS simples funcional
- **v1.5** (1 mês): Media library, webhooks
- **v2.0** (3 meses): Multi-tenancy, AI, i18n

---
Decisão tomada: 2 Abril 2026