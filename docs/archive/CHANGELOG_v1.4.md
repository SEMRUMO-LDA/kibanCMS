# KibanCMS v1.4.0 — Changelog

**Release Date:** 2026-04-08

## Alteracao Estrutural: Multi-Tenant Architecture

O KibanCMS v1.4 introduz isolamento completo de dados por cliente. Cada cliente tem a sua propria base de dados Supabase, servidos por um unico deploy.

### Antes (v1.3)
- 1 Supabase partilhada entre todos os clientes
- Dados misturados (Testimonials do LUNES + Form Submissions do Solfil)
- Zero isolamento — risco de data leak

### Depois (v1.4)
- 1 Supabase por cliente (completamente isolada)
- 1 deploy Railway serve todos via tenant routing
- Login por email resolve automaticamente o tenant correcto
- API calls usam X-Tenant header para manter contexto

```
kiban.pt (1 Railway)
  |
  |-- Login com hello@be-lunes.pt  -->  Supabase LUNES
  |-- Login com admin@solfil.pt    -->  Supabase Solfil
  |-- API call de be-lunes.pt      -->  Origin resolve LUNES
```

## Novos Ficheiros

| Ficheiro | Descricao |
|----------|-----------|
| `apps/api/src/config/tenants.ts` | Config multi-tenant (parseia TENANTS env var) |
| `apps/api/src/middleware/tenant.ts` | Middleware de resolucao de tenant via AsyncLocalStorage |
| `apps/api/src/routes/auth.ts` | Login endpoint que tenta todos os tenants |
| `docs/MULTI_TENANT_GUIDE.md` | Guia completo de setup multi-tenant |

## Ficheiros Alterados

| Ficheiro | Alteracao |
|----------|-----------|
| `apps/api/src/lib/supabase.ts` | Proxy pattern — delega para Supabase do tenant actual |
| `apps/api/src/server.ts` | Tenant middleware + /api/v1/auth/login + /api/v1/config |
| `apps/admin/src/lib/supabase.ts` | Init dinamico — config guardada em localStorage |
| `apps/admin/src/lib/api.ts` | Header X-Tenant em todas as chamadas |
| `apps/admin/src/main.tsx` | Suporta arranque sem tenant (login fornece) |
| `apps/admin/src/pages/Login.tsx` | Login via API em vez de Supabase directo |
| `apps/admin/src/features/auth/hooks/useAuth.tsx` | clearTenant no logout |
| `Dockerfile` | Removidas credenciais hardcoded do build |
| `database/migrations/CLEAN_RESET.sql` | pgcrypto extension + search_path fix |

## Correcoes de Bugs (v1.3 -> v1.4)

| Bug | Fix |
|-----|-----|
| Login mostrava "kibanCMS" em texto + logo | Removido texto, ficou so logo |
| Sidebar mostrava todas as collections individuais | Sidebar limpo: Dashboard, Content, Media, Users, Activity, Add-ons, Settings |
| Trigger `handle_new_user` nao definia role | Agora le `invited_role` dos metadata |
| `can_edit_content()` nao incluia super_admin | Adicionado `super_admin` a lista |
| Nome no sidebar mostrava "Admin User" | Fallback agora usa prefixo do email |
| Functions do Supabase falhavam sem `search_path` | Adicionado `SET search_path = public, extensions` |
| CORS bloqueava header X-Tenant | Adicionado a allowedHeaders |
| Wildcard CORS em producao | Fallback agora restringe em production |
| Email subjects vulneraveis a injection | Sanitizacao de \r\n nos campos |
| Login race condition (100ms delay) | Espera por auth state change real |
| Tenant middleware sem return | Adicionado return no ultimo branch |

## Configuracao Multi-Tenant

### Variavel de Ambiente: TENANTS

```json
{
  "lunes": {
    "supabaseUrl": "https://xxx.supabase.co",
    "supabaseAnonKey": "eyJ...",
    "supabaseServiceKey": "eyJ...",
    "hostnames": ["lunes.kiban.pt"],
    "origins": ["https://be-lunes.pt"]
  },
  "solfil": {
    "supabaseUrl": "https://yyy.supabase.co",
    "supabaseAnonKey": "eyJ...",
    "supabaseServiceKey": "eyJ...",
    "hostnames": ["solfil.kiban.pt"],
    "origins": ["https://solfil.pt"]
  }
}
```

### Retrocompatibilidade

Se `TENANTS` nao estiver definido, funciona como v1.3 (single-tenant com env vars tradicionais).

## Adicionar Novo Cliente

1. Criar projecto Supabase
2. Correr `database/migrations/CLEAN_RESET.sql` no SQL Editor
3. Activar extensao pgcrypto (ja incluido no CLEAN_RESET)
4. Criar bucket `media` (public) no Storage
5. Criar user admin no Authentication
6. Promover a super_admin: `UPDATE profiles SET role = 'super_admin' WHERE email = '...';`
7. Adicionar entrada ao JSON da env var TENANTS no Railway
8. Deploy automatico

## Database Migrations

A partir da v1.4, o ficheiro `CLEAN_RESET.sql` e a unica fonte de verdade. Os ficheiros individuais (001-013) foram arquivados em `_archived/`.

Para novos projectos Supabase, correr apenas `CLEAN_RESET.sql`.

## Proximos Passos (v1.4.1+)

- Rate limiting por perfil (nao so por IP)
- Soft delete em entries
- API key rotation e expiracao
- Audit log para operacoes sensiveeis
- Request ID tracking (X-Request-ID)
