# kibanCMS — Guia do Programador

> Documento de referencia para programadores da agencia AORUBRO.
> Tudo o que precisas saber para trabalhar com o kibanCMS, criar frontends, e manter o sistema.

---

## Indice

1. [O que e o kibanCMS](#1-o-que-e-o-kibancms)
2. [Arquitetura Geral](#2-arquitetura-geral)
3. [Stack Tecnologico](#3-stack-tecnologico)
4. [Estrutura do Projeto](#4-estrutura-do-projeto)
5. [Setup Local](#5-setup-local)
6. [Base de Dados (Supabase)](#6-base-de-dados-supabase)
7. [API — Endpoints e Autenticacao](#7-api--endpoints-e-autenticacao)
8. [Admin UI — Frontend do CMS](#8-admin-ui--frontend-do-cms)
9. [Sistema de Add-ons](#9-sistema-de-add-ons)
10. [Criar um Frontend (Projeto Cliente)](#10-criar-um-frontend-projeto-cliente)
11. [Formularios de Contacto (Forms Addon)](#11-formularios-de-contacto-forms-addon)
12. [Webhooks](#12-webhooks)
13. [Deploy em Producao](#13-deploy-em-producao)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. O que e o kibanCMS

kibanCMS e um **headless CMS** construido pela AORUBRO. Funciona como backend de conteudo para qualquer frontend — websites, apps, e-commerce, etc.

**Principio:** O CMS gere os dados. O frontend decide como os mostra.

**Fluxo basico:**

```
Cliente (browser) → Frontend (React/Next.js/HTML) → API kibanCMS → Supabase (DB)
                                                   ↓
                                              Admin Panel
                                        (onde se gere o conteudo)
```

**URL do admin:** `https://kiban.pt` (ou o dominio configurado)
**URL da API:** `https://kiban.pt/api/v1/`

---

## 2. Arquitetura Geral

```
kibanCMS (monorepo)
├── apps/
│   ├── admin/          → React SPA (painel de administracao)
│   ├── api/            → Express.js (API REST)
│   └── example/        → Next.js (frontend exemplo)
│
├── packages/
│   ├── types/          → TypeScript types partilhados
│   ├── core/           → KibanClient (SDK)
│   ├── ui/             → Componentes React reutilizaveis
│   ├── media/          → Servicos de media/imagem
│   ├── addons/         → Sistema de add-ons
│   └── kiban-client/   → Cliente JS oficial (@kiban/client)
│
├── database/
│   └── migrations/     → SQL para Supabase
│
├── Dockerfile          → Build multi-stage
├── docker-compose.yml  → Config Docker
└── railway.toml        → Config Railway (deploy)
```

**Em producao**, o servidor Express serve TUDO:
- `/api/v1/*` → rotas da API
- `/*` → ficheiros estaticos do admin (React build)

Isto significa que **um unico deploy** serve admin + API.

---

## 3. Stack Tecnologico

### Backend (API)
| Tecnologia | Versao | Para que serve |
|------------|--------|----------------|
| Node.js | 20.x | Runtime |
| Express | 4.x | HTTP framework |
| TypeScript | 5.x | Tipagem |
| Supabase JS | 2.x | Acesso a DB + Auth |
| Multer | 2.x | Upload de ficheiros |
| Zod | 3.x | Validacao de dados |
| Google Generative AI | 0.24.x | Features IA (alt-text, traducao) |

### Frontend (Admin)
| Tecnologia | Versao | Para que serve |
|------------|--------|----------------|
| React | 18.x | UI framework |
| Vite | 5.x | Build tool |
| TypeScript | 5.x | Tipagem |
| React Router | 6.x | Routing SPA |
| Styled Components | 6.x | CSS-in-JS |
| TipTap | 3.x | Rich text editor |
| Lucide React | 0.323 | Icones |

### Infraestrutura
| Servico | Para que serve |
|---------|----------------|
| Supabase | Base de dados (PostgreSQL) + Auth + Storage |
| Railway | Hosting (Docker) |
| GitHub | Repositorio de codigo |
| Docker | Containerizacao |
| pnpm | Package manager (monorepo) |

---

## 4. Estrutura do Projeto

### 4.1 API (`apps/api/src/`)

```
src/
├── server.ts               → Entry point, monta rotas e middleware
├── middleware/
│   └── auth.ts             → Autenticacao (JWT + API Key)
├── lib/
│   ├── supabase.ts         → Cliente Supabase (service role)
│   ├── logger.ts           → Logging (JSON em prod, texto em dev)
│   ├── validate-content.ts → Validacao de campos contra schema
│   └── webhook-worker.ts   → Worker que processa webhooks em background
└── routes/
    ├── collections.ts      → CRUD de collections
    ├── entries.ts          → CRUD de entries
    ├── media.ts            → Upload e gestao de media
    ├── forms.ts            → Submissao de formularios
    ├── users.ts            → Gestao de utilizadores
    ├── webhooks.ts         → CRUD de webhooks
    ├── ai.ts               → Geracao de schemas com IA
    ├── ai-content.ts       → Alt-text, traducao, tom
    ├── dashboard.ts        → Estatisticas do dashboard
    ├── activity.ts         → Feed de atividade
    ├── media-intelligence.ts → Uso de media, duplicados
    └── redirects.ts        → Resolucao de redirects (publico)
```

### 4.2 Admin (`apps/admin/src/`)

```
src/
├── App.tsx                 → Routing principal
├── main.tsx                → Entry point React
├── layouts/
│   └── DashboardLayout.tsx → Sidebar + header + outlet
├── pages/
│   ├── Dashboard.tsx       → Pagina inicial com metricas
│   ├── Collections.tsx     → Lista de collections
│   ├── CollectionBuilder.tsx → Criar nova collection (visual)
│   ├── CollectionEdit.tsx  → Editar collection existente
│   ├── CollectionEntries.tsx → Lista de entries de uma collection
│   ├── EntryEdit.tsx       → Criar/editar uma entry
│   ├── Media.tsx           → Biblioteca de media
│   ├── Users.tsx           → Gestao de utilizadores
│   ├── Settings.tsx        → Definicoes (API keys, SMTP, etc.)
│   ├── Addons.tsx          → Instalar/desinstalar add-ons
│   ├── ActivityLog.tsx     → Log de atividade
│   ├── Onboarding.tsx      → Wizard de setup inicial
│   ├── Login.tsx           → Pagina de login
│   └── Diagnostics.tsx     → Diagnostico do sistema
├── components/
│   ├── EntryEditor.tsx     → Editor de conteudo
│   ├── CommandPalette.tsx  → Cmd+K (pesquisa rapida)
│   ├── CodeSnippetModal.tsx → Snippets de integracao
│   ├── RevisionHistory.tsx → Historico de versoes
│   ├── Toast.tsx           → Notificacoes
│   ├── fields/             → Componentes de campo (text, image, richtext, etc.)
│   └── collection-builder/ → UI do builder visual
├── config/
│   ├── addons-registry.ts  → Definicao de todos os add-ons
│   └── collection-presets.ts → Templates de collections
├── features/auth/
│   └── hooks/useAuth.tsx   → Hook de autenticacao
├── lib/
│   ├── api.ts              → Cliente HTTP para a API
│   ├── supabase.ts         → Cliente Supabase (anon key)
│   └── i18n.tsx            → Traducoes PT/EN
└── shared/styles/
    └── design-tokens.ts    → Design system (cores, spacing, tipografia)
```

---

## 5. Setup Local

### Pre-requisitos
- Node.js >= 18
- pnpm >= 8 (`npm install -g pnpm`)
- Conta Supabase com projeto criado

### Passos

```bash
# 1. Clonar o repo
git clone https://github.com/SEMRUMO-LDA/kibanCMS.git
cd kibanCMS

# 2. Instalar dependencias
pnpm install

# 3. Configurar variaveis de ambiente
# Copia .env.example para .env e preenche:
cp .env.example .env
cp apps/api/.env.example apps/api/.env

# Variaveis necessarias:
# SUPABASE_URL=https://xxx.supabase.co
# SUPABASE_ANON_KEY=eyJ...
# SUPABASE_SERVICE_ROLE_KEY=eyJ...
# VITE_SUPABASE_URL=https://xxx.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJ...

# 4. Correr as migracoes no Supabase
# Abre o SQL Editor no dashboard Supabase e corre:
# database/migrations/CLEAN_RESET.sql

# 5. Iniciar em modo dev
pnpm dev          # Tudo (admin + API)
# ou separadamente:
pnpm dev:admin    # Admin em http://localhost:5173
pnpm dev:api      # API em http://localhost:5001
```

### Variaveis de Ambiente

| Variavel | Onde | Descricao |
|----------|------|-----------|
| `SUPABASE_URL` | API | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | API + Admin | Chave publica (anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | API | Chave secreta (bypassa RLS) |
| `VITE_SUPABASE_URL` | Admin | Mesmo URL (prefixo VITE_ para Vite) |
| `VITE_SUPABASE_ANON_KEY` | Admin | Mesmo anon key |
| `PORT` | API | Porta do servidor (default: 5001) |
| `ALLOWED_ORIGINS` | API | Dominios CORS (separados por virgula) |
| `GEMINI_API_KEY` | API | Chave Google Gemini (para features IA) |

---

## 6. Base de Dados (Supabase)

### Tabelas v1.0 (ativas)

| Tabela | Descricao |
|--------|-----------|
| `profiles` | Users do CMS (ligados a auth.users) |
| `collections` | Tipos de conteudo (blog, projects, etc.) |
| `entries` | Conteudo real (posts, paginas, etc.) |
| `media` | Ficheiros carregados |
| `api_keys` | Chaves API para frontends |
| `entry_revisions` | Historico de versoes de entries |
| `webhooks` | Endpoints de webhook configurados |
| `webhook_deliveries` | Log de entregas de webhooks |

### Roles de utilizador

| Role | Permissoes |
|------|-----------|
| `super_admin` | Acesso total, pode promover admins |
| `admin` | Gere collections, entries, users, webhooks |
| `editor` | Cria e edita entries e media |
| `author` | Cria e edita as proprias entries |
| `viewer` | Apenas leitura |

### RLS (Row Level Security)

A base de dados usa **SECURITY DEFINER functions** para evitar recursao:

```sql
is_admin_or_super()   → true se admin ou super_admin
is_admin_or_editor()  → true se admin, super_admin ou editor
has_content_role()    → true se admin, super_admin, editor ou author
```

**Regra importante:** A API usa **service role key** (bypassa RLS). A autorizacao e feita no codigo da API, nao no RLS. O RLS protege apenas acessos diretos via Supabase client (admin frontend).

### Correr migracoes

Para uma instalacao limpa, corre no **Supabase SQL Editor**:

```
database/migrations/CLEAN_RESET.sql
```

Este script:
- Apaga tabelas v2 que nao deviam existir
- Recria as 8 tabelas v1.0
- Configura 24 policies RLS
- Cria triggers (auto-create profile, API key, revisions, webhooks)
- Define o primeiro user como super_admin

---

## 7. API — Endpoints e Autenticacao

### Autenticacao

A API suporta dois metodos:

**1. JWT (para o admin panel)**
```
Authorization: Bearer eyJhbGci...
```
O admin envia o token Supabase automaticamente.

**2. API Key (para frontends)**
```
Authorization: Bearer kiban_live_xxxxxxxxxxxxx
```
Usada por websites cliente para ler/escrever conteudo.

### Endpoints principais

#### Collections
| Metodo | Rota | Auth | Descricao |
|--------|------|------|-----------|
| GET | `/api/v1/collections` | JWT | Listar collections |
| GET | `/api/v1/collections/:slug` | JWT | Obter uma collection |
| POST | `/api/v1/collections` | JWT (admin) | Criar collection |
| PUT | `/api/v1/collections/:slug` | JWT (admin) | Atualizar collection |
| DELETE | `/api/v1/collections/:slug` | JWT (admin) | Apagar collection |

#### Entries (conteudo)
| Metodo | Rota | Auth | Descricao |
|--------|------|------|-----------|
| GET | `/api/v1/entries/:collection` | API Key ou JWT | Listar entries |
| GET | `/api/v1/entries/:collection/:slug` | API Key ou JWT | Obter entry |
| POST | `/api/v1/entries/:collection` | API Key ou JWT | Criar entry |
| PUT | `/api/v1/entries/:collection/:slug` | API Key ou JWT | Atualizar entry |
| DELETE | `/api/v1/entries/:collection/:slug` | API Key ou JWT | Apagar entry |

**Query params do GET list:** `status`, `search`, `tags`, `limit` (max 500), `offset`, `sort`, `order`

#### Media
| Metodo | Rota | Auth | Descricao |
|--------|------|------|-----------|
| GET | `/api/v1/media` | API Key ou JWT | Listar media |
| GET | `/api/v1/media/:id` | API Key ou JWT | Obter media |
| POST | `/api/v1/media/upload` | API Key ou JWT | Upload (multipart ou base64) |
| PATCH | `/api/v1/media/:id` | API Key ou JWT | Atualizar metadata |
| DELETE | `/api/v1/media/:id` | API Key ou JWT | Apagar media |

#### Forms
| Metodo | Rota | Auth | Descricao |
|--------|------|------|-----------|
| POST | `/api/v1/forms/submit` | API Key | Submeter formulario |
| GET | `/api/v1/forms/submissions` | API Key ou JWT | Listar submissoes |

#### Outros
| Rota | Auth | Descricao |
|------|------|-----------|
| GET `/health` | Nenhuma | Health check |
| GET `/api/v1/dashboard/stats` | JWT | Metricas do dashboard |
| GET `/api/v1/activity` | JWT | Feed de atividade |
| GET `/api/v1/redirects/resolve?path=/x` | Nenhuma | Resolver redirect |

**Documentacao completa:** ver `docs/API_ENDPOINTS.md`

### Formato de resposta

```json
// Sucesso
{
  "data": { ... },
  "meta": { "pagination": { "limit": 100, "offset": 0, "total": 42 } },
  "timestamp": "2026-04-06T12:00:00.000Z"
}

// Erro
{
  "error": { "message": "Descricao", "status": 400, "timestamp": "..." }
}
```

### Rate Limiting

- **Geral:** 100 requests / 15 min por IP
- **Forms:** 20 requests / 15 min por IP

---

## 8. Admin UI — Frontend do CMS

### Routing

```
/login                              → Login
/onboarding                         → Wizard de setup (so 1x)
/                                   → Dashboard
/content                            → Lista de collections
/content/builder                    → Criar collection (visual)
/content/:slug/edit-collection      → Editar collection
/content/:collectionSlug            → Lista de entries
/content/:collectionSlug/new        → Nova entry
/content/:collectionSlug/edit/:id   → Editar entry
/media                              → Biblioteca de media
/users                              → Gestao de utilizadores
/settings                           → Definicoes (tabs: General, API, Media, Permalinks, Privacy, Email)
/addons                             → Add-ons disponiveis
/activity                           → Log de atividade
```

### Design System

O admin usa design tokens em `shared/styles/design-tokens.ts`:

- **Cores:** Escala de cinzentos + accent cyan (`#06B6D4`)
- **Tipografia:** Inter (sans), JetBrains Mono (code)
- **Spacing:** Base 8px (spacing[1] = 0.25rem, spacing[4] = 1rem, etc.)
- **Shadows:** xs a 2xl
- **Animacoes:** fast (150ms), normal (250ms), slow (350ms)

### Atalhos de teclado

| Atalho | Acao |
|--------|------|
| `Cmd+K` | Abrir Command Palette |
| `Cmd+S` | Guardar |
| `Cmd+N` | Novo |

### i18n

Suporta **Portugues** e **Ingles**. Muda em Settings. Persistido em localStorage (`kiban-locale`).

---

## 9. Sistema de Add-ons

Os add-ons sao modulos que criam collections automaticamente quando instalados.

### Add-ons disponiveis

| Add-on | ID | Collections criadas |
|--------|----|---------------------|
| Newsletter | `newsletter` | `newsletter-subscribers`, `newsletter-campaigns` |
| SEO | `seo` | `seo-settings` |
| **Forms** | `forms` | `form-submissions`, `forms-config` |
| Bookings | `bookings` | `bookings`, `booking-services` |
| Redirects | `redirects` | `redirects` |
| Automations | `webhooks-visual` | `automations` |
| AI Content | `ai-content` | (nenhuma — integrado no editor) |

### Como funciona

1. Definidos em `apps/admin/src/config/addons-registry.ts`
2. Cada addon tem collections com fields pre-definidos
3. Instalar = criar as collections via API
4. Desinstalar = apagar as collections (e dados!)
5. Dados ficam acessiveis via API normal (`/api/v1/entries/:collection`)

### Criar um novo add-on

Adiciona ao `addons-registry.ts`:

```typescript
const meuAddon: AddonDefinition = {
  id: 'meu-addon',
  name: 'Meu Addon',
  description: 'Descricao curta',
  longDescription: 'Descricao longa...',
  icon: 'star',           // nome do icone Lucide
  color: '#3B82F6',
  category: 'tools',      // marketing | content | commerce | tools
  version: '1.0.0',
  author: 'AORUBRO',
  collections: [
    {
      name: 'Minha Collection',
      slug: 'meu-addon-data',
      description: 'Descricao',
      type: 'custom',
      fields: [
        { id: 'titulo', name: 'titulo', label: 'Titulo', type: 'text', required: true },
        { id: 'descricao', name: 'descricao', label: 'Descricao', type: 'textarea' },
      ],
    },
  ],
};

// Adicionar ao array ADDONS_REGISTRY
export const ADDONS_REGISTRY: AddonDefinition[] = [
  // ... existentes
  meuAddon,
];
```

**Tipos de campo disponiveis:** `text`, `textarea`, `richtext`, `image`, `number`, `date`, `boolean`, `select`, `url`, `email`

---

## 10. Criar um Frontend (Projeto Cliente)

### Passo 1: Obter API Key

No admin do CMS, vai a **Settings > API** e copia a key (`kiban_live_...`).

### Passo 2: Buscar conteudo

```typescript
const API_URL = 'https://kiban.pt/api/v1';
const API_KEY = 'kiban_live_xxxxx';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${API_KEY}`,
};

// Listar blog posts publicados
const response = await fetch(
  `${API_URL}/entries/blog?status=published&sort=published_at&order=desc`,
  { headers }
);
const { data: posts, meta } = await response.json();

// Obter um post especifico
const post = await fetch(
  `${API_URL}/entries/blog/welcome-to-kibancms`,
  { headers }
).then(r => r.json());

// Listar projetos do portfolio
const projects = await fetch(
  `${API_URL}/entries/projects?status=published`,
  { headers }
).then(r => r.json());
```

### Passo 3: Estrutura dos dados

Cada entry tem esta estrutura:

```typescript
{
  id: string;              // UUID
  title: string;           // Titulo
  slug: string;            // URL-friendly (unico na collection)
  content: {               // Campos definidos no schema da collection
    body: string;          // Depende da collection
    excerpt: string;
    featured_image: string;
    // ... outros campos
  };
  status: 'draft' | 'review' | 'scheduled' | 'published' | 'archived';
  published_at: string;    // ISO date (null se nao publicado)
  tags: string[];
  meta: object;
  created_at: string;
  updated_at: string;
  author: {                // Autor (join automatico)
    id: string;
    full_name: string;
    email: string;
  };
}
```

### Passo 4: Media (imagens)

As imagens sao guardadas no Supabase Storage. O campo `featured_image` guarda o UUID do media. Para obter o URL:

```typescript
// Obter detalhes do media (inclui URL publico)
const media = await fetch(
  `${API_URL}/media/${entry.featured_image}`,
  { headers }
).then(r => r.json());

// media.data.storage_path → path no Supabase Storage
// Construir URL: SUPABASE_URL/storage/v1/object/public/media/STORAGE_PATH
```

### Exemplo: Next.js

```tsx
// app/blog/page.tsx
export default async function BlogPage() {
  const res = await fetch(
    `${process.env.KIBAN_API_URL}/entries/blog?status=published`,
    {
      headers: { Authorization: `Bearer ${process.env.KIBAN_API_KEY}` },
      next: { revalidate: 60 }, // ISR: revalida a cada 60s
    }
  );
  const { data: posts } = await res.json();

  return (
    <div>
      {posts.map(post => (
        <article key={post.id}>
          <h2><a href={`/blog/${post.slug}`}>{post.title}</a></h2>
          <p>{post.excerpt}</p>
        </article>
      ))}
    </div>
  );
}
```

### Exemplo: HTML/JS simples

```html
<div id="blog-posts"></div>

<script>
  const API = 'https://kiban.pt/api/v1';
  const KEY = 'kiban_live_xxxxx';

  fetch(`${API}/entries/blog?status=published&limit=10`, {
    headers: { 'Authorization': `Bearer ${KEY}` }
  })
  .then(r => r.json())
  .then(({ data }) => {
    document.getElementById('blog-posts').innerHTML = data.map(p =>
      `<article>
        <h2>${p.title}</h2>
        <p>${p.content.excerpt || p.excerpt || ''}</p>
      </article>`
    ).join('');
  });
</script>
```

---

## 11. Formularios de Contacto (Forms Addon)

### Configuracao

1. Instala o addon **Forms** no admin (Add-ons > Forms > Install)
2. Configura notificacoes em **Content > Forms Config** (criar entry):
   - `form_name`: nome do form (ex: `contact`)
   - `notification_emails`: emails separados por virgula
   - `webhook_url`: URL do servico de email (Zapier, Make, Resend)
   - `is_active`: true

### Integracao no frontend

```typescript
async function submitForm(data) {
  const response = await fetch('https://kiban.pt/api/v1/forms/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer kiban_live_xxxxx',
    },
    body: JSON.stringify({
      form_name: 'contact',       // obrigatorio
      name: data.name,
      email: data.email,          // obrigatorio
      phone: data.phone,
      subject: data.subject,
      message: data.message,      // obrigatorio
      source_url: window.location.href,
    }),
  });

  if (!response.ok) throw new Error('Erro ao enviar');
  return response.json();
  // → { success: true, data: { id, form, received_at } }
}
```

### Fluxo completo

```
1. Frontend envia POST /api/v1/forms/submit (com API Key)
2. API valida dados e cria entry em "form-submissions"
3. API procura config em "forms-config" para este form_name
4. Se webhook configurado → POST ao servico externo com dados + emails destino
5. Lead aparece no admin (Content > Form Submissions)
6. Servico externo (Zapier/Make/Resend) envia email de notificacao
```

### Configurar email via Make.com (gratuito)

1. Cria conta em make.com
2. Novo Scenario: **Webhooks > Custom Webhook** → **Email > Send an Email**
3. No webhook, configura os campos:
   - To: `{{notification.to}}`
   - Subject: `{{notification.subject}}`
   - Body: monta com `{{submission.name}}`, `{{submission.email}}`, `{{submission.message}}`
4. Copia o URL do webhook para a config do form no CMS

---

## 12. Webhooks

O CMS dispara webhooks automaticamente quando entries sao criadas, atualizadas ou apagadas.

### Eventos disponiveis

| Evento | Quando |
|--------|--------|
| `entry.created` | Nova entry criada |
| `entry.updated` | Entry atualizada |
| `entry.deleted` | Entry apagada |
| `media.uploaded` | Novo ficheiro carregado |
| `webhook.test` | Teste manual |
| `form.submitted` | Formulario submetido (via forms addon) |

### Payload do webhook

```json
{
  "event": "entry.created",
  "collection": "blog",
  "entry": { /* dados completos da entry */ },
  "timestamp": "2026-04-06T12:00:00.000Z"
}
```

### Seguranca

Cada webhook tem um **secret** (`whsec_...`). O CMS envia:
- Header `X-Webhook-Signature: sha256=HMAC_HEX`
- Header `X-Webhook-Event: entry.created`
- Header `X-Webhook-ID: uuid`

Para verificar no teu servico:

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return signature === expected;
}
```

### Retry

- 3 tentativas com delays: 1s, 5s, 30s
- Timeout: 30s por tentativa
- Worker poll: cada 5s

---

## 13. Deploy em Producao

### Railway (metodo atual)

O deploy e **automatico** — cada push para `main` faz trigger do build no Railway.

```bash
git push origin main
# Railway deteta o push, faz build Docker, e deploy automatico
```

**Verificar:**
```bash
# Health check
curl https://kiban.pt/health
# → { "status": "ok", "version": "1.3.0", "mode": "production" }
```

### Docker manual

```bash
# Build
docker-compose build

# Run
docker-compose up -d

# Logs
docker-compose logs -f kiban
```

### Variaveis de ambiente em producao

Configura no Railway (ou no `.env`):

```
NODE_ENV=production
PORT=5001
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ALLOWED_ORIGINS=https://solfil.pt,https://kiban.pt
GEMINI_API_KEY=AIza... (opcional, para features IA)
```

### Atualizar base de dados

Se houver novas migracoes:
1. Abre **Supabase Dashboard > SQL Editor**
2. Corre o ficheiro SQL da migracao
3. Verifica com: `SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'`

---

## 14. Troubleshooting

### Erro 403 ao criar collections
**Causa:** User nao tem role admin/super_admin.
**Fix:** No Supabase > Table Editor > profiles, mudar `role` para `super_admin`.

### Erro 401 Unauthorized
**Causa:** API Key invalida ou expirada.
**Fix:** Verificar a key em Settings > API. Se nao existe, correr migration `007_api_keys.sql`.

### Entries nao aparecem no frontend
**Causa:** Status nao e `published`, ou API Key errada.
**Fix:** Verificar `?status=published` no request, e que a key esta correta.

### Onboarding fica em loop
**Causa:** `onboarding_completed` nao foi marcado como true.
**Fix:** No Supabase > profiles, mudar `onboarding_completed` para `true`.

### Webhook nao dispara
**Causa:** Webhook desativado, ou URL invalido.
**Fix:** Verificar na tabela `webhooks` se `enabled = true`. Ver `webhook_deliveries` para erros.

### Build Docker falha
**Causa:** Dependencias desatualizadas ou node_modules corrompidos.
**Fix:** `pnpm clean && pnpm install && docker-compose build --no-cache`

### Rate limit atingido
**Causa:** Mais de 100 req/15min (geral) ou 20 req/15min (forms).
**Fix:** Esperar 15 minutos, ou aumentar o limite em `server.ts`.

---

## Contactos

- **Repositorio:** https://github.com/SEMRUMO-LDA/kibanCMS
- **Agencia:** AORUBRO — dev@kiban.pt
- **Responsavel tecnico:** Tiago Pacheco
