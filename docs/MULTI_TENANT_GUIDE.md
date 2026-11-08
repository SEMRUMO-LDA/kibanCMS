# KibanCMS - Multi-Tenant Architecture

## Overview

O KibanCMS suporta multi-tenancy por hostname. Um unico deploy Railway serve multiplos clientes, cada um com a sua propria Supabase isolada.

```
Railway (1 servico)
|
|-- solfil.kiban.pt  -->  Supabase Solfil
|-- lunes.kiban.pt   -->  Supabase LUNES
|-- demo.kiban.pt    -->  Supabase Agencia (dev)
```

## Como funciona

1. O browser acede a `lunes.kiban.pt`
2. O servidor resolve o hostname para o tenant "lunes"
3. Cria clientes Supabase com as credenciais do LUNES
4. Todos os dados (collections, entries, media, users) sao isolados
5. O frontend recebe as credenciais via `GET /api/v1/config`

## Configuracao

### Variavel de ambiente: TENANTS

No Railway (ou .env), define a variavel `TENANTS` como JSON:

```json
{
  "lunes": {
    "supabaseUrl": "https://vcvzhsofzwvbdemwwxkl.supabase.co",
    "supabaseAnonKey": "eyJ...",
    "supabaseServiceKey": "eyJ...",
    "hostnames": ["lunes.kiban.pt"]
  },
  "solfil": {
    "supabaseUrl": "https://xxx.supabase.co",
    "supabaseAnonKey": "eyJ...",
    "supabaseServiceKey": "eyJ...",
    "hostnames": ["solfil.kiban.pt"]
  }
}
```

### Retrocompatibilidade

Se `TENANTS` NAO estiver definido, o servidor usa as variaveis tradicionais:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Isto garante que o setup existente continua a funcionar sem mudancas.

## Adicionar um novo cliente

1. **Criar Supabase**: Novo projeto no Supabase dashboard
2. **Correr schema** (ou usa `pnpm new-client`, que faz isto sozinho): no SQL Editor, corre por esta ordem:
   1. `database/migrations/CLEAN_RESET.sql`
   2. `002_collection_snapshots.sql`, `003_coupon_usage_rpc.sql`, `004_soft_delete_trash.sql`,
      `006_addon_system.sql`, `007_channel_manager.sql`, `008_security_hardening.sql`, `009_schema_status.sql`

   Os ficheiros numerados podem ser corridos mais do que uma vez sem problema.
   A 008 tambem cria o bucket `media` e as permissoes de upload.
   Os ficheiros em `database/seeds/` sao especificos de um cliente — nao os corras noutros.
3. **Desligar registos publicos**: Authentication → Sign In / Providers → Email →
   desliga "Allow new users to sign up". Os utilizadores entram por convite (Users → Invite).
4. **Criar primeiro user**: Authentication → Users → Add user (com "Auto Confirm User").
   O primeiro utilizador de cada cliente fica automaticamente super_admin.
5. **Adicionar ao TENANTS**: Adiciona a entrada no JSON do Railway
6. **Adicionar dominio**: No Railway, adiciona o subdominio como custom domain
7. **Deploy**: O Railway faz redeploy automatico
8. **Verificar**: entra no painel do cliente → **Settings → Saúde**. Tem de estar tudo
   verde ou cinzento; cada linha vermelha ou amarela diz o que falta fazer.
9. **Ligar o site**: **Settings → API → Ligar o meu site** gera a key, dá o bloco de
   variáveis para colar na Vercel e testa a ligação.

## Endpoints relevantes

| Endpoint | Auth | Descricao |
|----------|------|-----------|
| `GET /health` | Nao | Health check + tenant ID |
| `GET /api/v1/config` | Nao | Devolve Supabase URL + anon key do tenant atual |
| `GET /api/v1/*` | JWT/API Key | Todas as rotas usam o tenant resolvido |

## Arquitectura tecnica

### Backend (API)

- **`config/tenants.ts`**: Parseia `TENANTS` env var, cria mapa hostname -> config
- **`middleware/tenant.ts`**: Middleware Express que resolve tenant via hostname e cria contexto via `AsyncLocalStorage`
- **`lib/supabase.ts`**: Exporta proxies que delegam automaticamente para o cliente Supabase do tenant atual. Zero mudancas necessarias nas rotas.

### Frontend (Admin)

- **`main.tsx`**: Chama `initSupabase()` antes de renderizar a app
- **`lib/supabase.ts`**: `initSupabase()` busca config de `/api/v1/config` (producao) ou usa `VITE_` env vars (dev)

### Dockerfile

- O build do frontend NAO inclui credenciais Supabase hardcoded
- As credenciais sao resolvidas em runtime via `/api/v1/config`

## Desenvolvimento local

Em dev, usa `.env` com as variaveis tradicionais:

```env
# apps/api/.env
SUPABASE_URL=https://tzlpqzrhnifsclxegnfa.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# apps/admin/.env
VITE_SUPABASE_URL=https://tzlpqzrhnifsclxegnfa.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=http://localhost:5001
```

O sistema cai automaticamente no modo single-tenant.

## Seguranca

- Service role keys ficam APENAS no servidor (env var TENANTS no Railway)
- O frontend so recebe `supabaseUrl` + `supabaseAnonKey` (publicas por design)
- Cada cliente tem users, roles e API keys completamente isolados
- Impossivel aceder dados de um tenant via outro hostname
