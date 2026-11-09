# KibanCMS — Setup de Novo Cliente

## Visao Geral

Cada cliente da agencia tem a sua propria Supabase (dados isolados). O KibanCMS serve todos os clientes a partir de um unico deploy Railway.

```
pnpm new-client
```

Este comando automatiza a maior parte do setup. Abaixo esta o processo completo.

---

## Processo Completo

### Passo 1: Criar Projecto Supabase (manual)

1. Abre [supabase.com/dashboard](https://supabase.com/dashboard)
2. Clica **New Project**
3. Nome: `clientname-cms` (ex: `lunes-cms`, `solfil-cms`)
4. Regiao: **EU West** (Frankfurt)
5. Guarda a **database password**
6. Espera o projecto ficar pronto

### Passo 2: Desligar registos publicos (manual)

1. No Supabase dashboard → **Authentication → Sign In / Providers → Email**
2. Desliga **Allow new users to sign up**

Os utilizadores do cliente entram por convite (Users → Convidar). O bucket
`media` ja nao precisa de ser criado a mao: o schema cria-o.

### Passo 3: Correr o Setup Automatico

```bash
pnpm new-client
```

O script pede:
- **Client ID** — identificador interno (ex: `lunes`)
- **Client name** — nome de display (ex: `LUNES`)
- **Supabase URL** — do dashboard (Settings → API)
- **Supabase Anon Key** — do dashboard (Settings → API)
- **Supabase Service Role Key** — do dashboard (Settings → API)
- **Admin email** — email de login do cliente
- **Admin password** — password do admin
- **Website origin** — URL do site do cliente (ex: `https://be-lunes.pt`)

O script faz automaticamente:
1. Aplica o schema (se tiver `psql` ou Supabase CLI) e para no primeiro erro
2. Cria o user admin via Supabase Auth API (o primeiro user fica super_admin)
3. Gera ficheiro de config em `clients/clientname.json`

### Passo 4: Correr Schema SQL

Se o script nao conseguiu correr o SQL automaticamente (precisa de `psql` ou Supabase CLI),
no Supabase SQL Editor do novo projecto corre **dois ficheiros, por esta ordem**:

1. `database/migrations/CLEAN_RESET.sql` — schema base (so em projectos novos: apaga tudo)
2. `database/UPGRADE_TENANT.sql` — migrations 002–011 numa transacao; termina com uma
   checklist em que tudo deve aparecer `true`

### Passo 5: Adicionar ao Railway

1. Abre o ficheiro gerado em `clients/clientname.json`
2. No Railway → **Variables** → edita `TENANTS`
3. Merge o JSON do ficheiro no JSON existente
4. Adiciona o origin do cliente ao `ALLOWED_ORIGINS`

**Exemplo — antes:**
```json
{"lunes":{"supabaseUrl":"...","supabaseAnonKey":"...","supabaseServiceKey":"...","hostnames":["lunes.kiban.pt"],"origins":["https://be-lunes.pt"]}}
```

**Depois de adicionar solfil:**
```json
{"lunes":{"supabaseUrl":"...","supabaseAnonKey":"...","supabaseServiceKey":"...","hostnames":["lunes.kiban.pt"],"origins":["https://be-lunes.pt"]},"solfil":{"supabaseUrl":"...","supabaseAnonKey":"...","supabaseServiceKey":"...","hostnames":["solfil.kiban.pt"],"origins":["https://solfil.pt"]}}
```

### Passo 6: Testar

1. Abre `https://<cliente>.kiban.pt/login` (no dominio do cliente, para entrar no tenant certo)
2. Login com o email/password do novo cliente
3. Completa o onboarding
4. **Settings → Saude**: tem de estar tudo verde ou cinzento. Cada linha vermelha
   ou amarela diz o que falta (ex.: `RESEND_API_KEY`, destinatarios de email)
5. **Settings → API → Ligar o meu site**: gera a key, copia as variaveis para a Vercel
   e usa **Testar ligacao**

---

## Resumo Rapido

| O que | Quem faz | Tempo |
|-------|----------|-------|
| Criar Supabase + desligar registos | Tu (manual) | 2 min |
| `pnpm new-client` | Script (automatico) | 1 min |
| Colar CLEAN_RESET.sql + UPGRADE_TENANT.sql | Tu (se script nao conseguiu) | 2 min |
| Merge TENANTS no Railway | Tu (copiar JSON) | 1 min |
| Login + Settings → Saude | Tu | 1 min |
| Ligar o site (Vercel) | Tu / dev do site | 3 min |
| **Total** | | **~10 min** |

---

## Estrutura de Ficheiros

```
clients/
  lunes.json          # Config gerada pelo script
  solfil.json         # Config gerada pelo script
scripts/
  new-client.sh       # Script de setup
database/
  UPGRADE_TENANT.sql  # Migrations 002–011 num so ficheiro (gerado)
  migrations/
    CLEAN_RESET.sql   # Schema base (so projectos novos)
    002…011_*.sql     # Migrations idempotentes (ver migrations/README.md)
  seeds/              # Dados especificos de um cliente — nao correr noutros
```

---

## Troubleshooting

### "Database error creating new user"
A extensao `pgcrypto` nao esta activa. O CLEAN_RESET.sql ja inclui `CREATE EXTENSION IF NOT EXISTS pgcrypto`. Se correste o SQL e mesmo assim falha, corre manualmente:
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

### "Failed to create user: User already registered"
O user ja existe. O script continua normalmente — vai tentar promover a super_admin.

### Login falha com 401
Verifica que:
1. O TENANTS env var no Railway inclui o novo cliente
2. O Railway fez redeploy depois de alterar a variavel
3. O email/password estao correctos

### Dashboard mostra dados de outro cliente
Faz logout e login outra vez. O `X-Tenant` pode estar cached do login anterior.
