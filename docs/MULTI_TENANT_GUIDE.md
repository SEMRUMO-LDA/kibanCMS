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
2. **Correr schema**: Cola o conteudo de `database/migrations/CLEAN_RESET.sql` no SQL Editor
3. **Criar storage bucket**: No Supabase Storage, criar bucket `media` (public)
4. **Criar primeiro user**: Regista-te no Supabase Auth (Email)
5. **Promover a super_admin**: Corre no SQL Editor:
   ```sql
   UPDATE profiles SET role = 'super_admin' WHERE email = 'admin@email.com';
   ```
6. **Adicionar ao TENANTS**: Adiciona a entrada no JSON do Railway
7. **Adicionar dominio**: No Railway, adiciona o subdominio como custom domain
8. **Deploy**: O Railway faz redeploy automatico

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
