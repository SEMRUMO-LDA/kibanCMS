# kibanCMS — Infraestrutura e Acessos

> Guia para programadores da AORUBRO sobre as plataformas que o kibanCMS usa,
> como aceder a cada uma, e como funcionam em conjunto.

---

## Visao Geral

O kibanCMS depende de 3 plataformas externas:

```
GitHub                Railway                 Supabase
(codigo)    ──push──> (servidor)    ──liga──> (base de dados)
                      serve o CMS             guarda os dados
```

| Plataforma | O que faz | URL |
|------------|-----------|-----|
| **GitHub** | Guarda o codigo fonte. Cada push faz deploy automatico | github.com |
| **Railway** | Hospeda o servidor (Docker). Serve a API e o admin | railway.app |
| **Supabase** | Base de dados PostgreSQL, autenticacao e storage de ficheiros | supabase.com |

---

## 1. GitHub

### O que e

Repositorio Git onde vive todo o codigo do kibanCMS. Quando fazes `git push` para o branch `main`, o Railway deteta automaticamente e faz um novo deploy.

### Acesso

- **Organizacao:** SEMRUMO-LDA
- **Repositorio:** https://github.com/SEMRUMO-LDA/kibanCMS
- **Branch principal:** `main` (protegido — cada push faz deploy)
- **Acesso:** Pedir ao Tiago para adicionar a tua conta GitHub como collaborator

### Como funciona no dia a dia

```bash
# 1. Clonar o repo (so na primeira vez)
git clone https://github.com/SEMRUMO-LDA/kibanCMS.git
cd kibanCMS

# 2. Fazer alteracoes no codigo
# ... editar ficheiros ...

# 3. Commit e push
git add .
git commit -m "feat: descricao da alteracao"
git push origin main

# 4. Deploy automatico
# O Railway deteta o push e faz build + deploy (2-5 minutos)
# Verifica em: https://kiban.pt/health
```

### Regras importantes

- **Nunca** fazer force push (`git push --force`) para `main`
- Fazer **commit com mensagens claras** (ex: `feat: add X`, `fix: corrige Y`)
- Testar localmente antes de fazer push (`pnpm dev`)
- Se algo partir em producao, reverter com `git revert` (nao com `reset`)

### Estrutura do repo

```
kibanCMS/
├── apps/admin/     → Frontend React do painel admin
├── apps/api/       → Backend Express (API REST)
├── database/       → Migracoes SQL para Supabase
├── docs/           → Documentacao
├── Dockerfile      → Build para producao
└── railway.toml    → Config do Railway
```

---

## 2. Railway

### O que e

Plataforma de hosting que corre o nosso servidor Docker. Quando o GitHub recebe um push, o Railway faz build da imagem Docker e deploy automatico.

### Acesso

- **URL:** https://railway.app
- **Login:** Conta da organizacao (pedir acesso ao Tiago)
- **Projeto:** kibanCMS
- **Servico:** `kiban` (unico servico)

### Dashboard

No Railway dashboard vais encontrar:

| Seccao | O que faz |
|--------|-----------|
| **Deployments** | Lista de todos os deploys. Verde = sucesso, vermelho = falhou |
| **Logs** | Logs do servidor em tempo real (util para debug) |
| **Variables** | Variaveis de ambiente (API keys, URLs do Supabase) |
| **Settings** | Config do servico (Docker, health check, dominio) |
| **Metrics** | CPU, memoria, rede |

### Variaveis de ambiente configuradas

Estas variaveis estao no Railway (Settings > Variables):

| Variavel | Descricao | Exemplo |
|----------|-----------|---------|
| `NODE_ENV` | Modo do servidor | `production` |
| `PORT` | Porta do servidor | `5001` |
| `SUPABASE_URL` | URL do projeto Supabase | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Chave publica do Supabase | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave secreta do Supabase (nunca expor) | `eyJ...` |
| `ALLOWED_ORIGINS` | Dominios permitidos via CORS | `https://solfil.pt,https://kiban.pt` |
| `GEMINI_API_KEY` | Chave Google Gemini (IA) | `AIza...` |

### Como ver logs

1. Abre o Railway dashboard
2. Clica no servico `kiban`
3. Vai ao separador **Logs**
4. Usa o filtro para procurar erros especificos

### Como fazer redeploy manual

Se precisares de forcar um redeploy sem fazer push:
1. No Railway dashboard, vai a **Deployments**
2. Clica nos 3 pontos do ultimo deploy
3. Seleciona **Redeploy**

### Como ver se o deploy funcionou

```bash
curl https://kiban.pt/health
# Deve retornar:
# { "status": "ok", "version": "1.3.0", "mode": "production" }
```

Ou simplesmente abre https://kiban.pt no browser.

### Dominio

- O Railway gera um URL automatico (tipo `xxx.up.railway.app`)
- O dominio `kiban.pt` esta configurado como custom domain
- DNS aponta para o Railway via CNAME

---

## 3. Supabase

### O que e

Backend-as-a-Service que fornece:
- **PostgreSQL** — base de dados relacional
- **Auth** — sistema de login/registo
- **Storage** — armazenamento de ficheiros (imagens, PDFs)
- **Realtime** — subscricoes em tempo real (nao usado ativamente)

### Acesso

- **URL:** https://supabase.com
- **Organizacao:** SEMRUMO-LDA's Org
- **Projeto:** kibanCMS
- **Dashboard:** https://supabase.com/dashboard (login com a conta da org)

### Dashboard — seccoes principais

| Seccao | O que faz | Quando usar |
|--------|-----------|-------------|
| **Table Editor** | Ver e editar dados diretamente nas tabelas | Debug, corrigir dados manualmente |
| **SQL Editor** | Correr queries SQL | Migracoes, consultas complexas |
| **Authentication** | Gerir utilizadores registados | Ver users, resetar passwords |
| **Storage** | Ver ficheiros carregados (imagens, etc.) | Debug de media |
| **Logs** | Ver logs de queries e erros | Debug de performance |
| **Settings > API** | Ver URL e chaves do projeto | Configurar .env |

### Tabelas da base de dados

| Tabela | Descricao |
|--------|-----------|
| `profiles` | Users do CMS (nome, email, role) |
| `collections` | Tipos de conteudo (blog, projects, forms, etc.) |
| `entries` | Conteudo (posts, leads, paginas) |
| `media` | Metadata de ficheiros carregados |
| `api_keys` | Chaves API para frontends |
| `entry_revisions` | Historico de versoes |
| `webhooks` | Configuracao de webhooks |
| `webhook_deliveries` | Log de entregas de webhooks |

### Chaves do Supabase

O Supabase gera 2 chaves por projeto:

| Chave | Para que serve | Onde usar | Segura? |
|-------|---------------|-----------|---------|
| **anon key** | Chave publica, usada no browser. Sujeita a RLS | Frontend (admin), .env do admin | Pode ser publica |
| **service role key** | Chave secreta, bypassa RLS. Acesso total | Apenas no servidor (API), nunca no browser | NUNCA expor |

**Onde encontrar:** Supabase Dashboard > Settings > API > Project API Keys

### Correr migracoes SQL

Quando ha alteracoes na base de dados:

1. Abre **Supabase Dashboard > SQL Editor**
2. Cria um novo query (botao **+**)
3. Cola o conteudo do ficheiro SQL (ex: `database/migrations/CLEAN_RESET.sql`)
4. Clica **Run**
5. Verifica no output se nao houve erros

### Gerir utilizadores (Auth)

Para ver ou gerir users que fazem login no CMS:

1. Supabase Dashboard > **Authentication** > **Users**
2. Aqui vais ver todos os users registados
3. Podes: resetar password, apagar user, ver metadata
4. **Nota:** Apagar aqui remove de `auth.users` mas a tabela `profiles` pode ficar com orfaos

### Storage (ficheiros)

Os ficheiros carregados no CMS ficam no Supabase Storage:

1. Supabase Dashboard > **Storage**
2. Bucket: `media`
3. Estrutura de pastas organizada por user/data
4. Ficheiros publicos acessiveis via URL direto

---

## 4. Como tudo funciona em conjunto

### Fluxo de um deploy

```
1. Programador faz git push para main
          ↓
2. GitHub notifica o Railway (webhook)
          ↓
3. Railway faz docker build (Dockerfile)
   - Instala dependencias
   - Compila TypeScript
   - Build do React admin
          ↓
4. Railway substitui o container antigo pelo novo
          ↓
5. Health check: GET /health
   - Se OK → deploy completo
   - Se falha → rollback automatico
          ↓
6. kiban.pt serve a nova versao
```

**Tempo total:** 2-5 minutos do push ao live.

### Fluxo de um pedido do frontend

```
1. Browser do user abre solfil.pt
          ↓
2. JavaScript faz fetch para kiban.pt/api/v1/entries/blog
   com header: Authorization: Bearer kiban_live_xxx
          ↓
3. Railway recebe o pedido → Express.js processa
          ↓
4. API valida a API Key contra tabela api_keys no Supabase
          ↓
5. API faz query ao Supabase: SELECT * FROM entries WHERE ...
          ↓
6. Supabase retorna os dados
          ↓
7. API formata e retorna JSON ao browser
          ↓
8. Frontend mostra o conteudo
```

### Fluxo de login no admin

```
1. User abre kiban.pt/login
          ↓
2. Insere email + password
          ↓
3. Supabase Auth valida credenciais
          ↓
4. Retorna JWT token
          ↓
5. Admin guarda token no browser (localStorage)
          ↓
6. Todos os pedidos ao API incluem: Authorization: Bearer eyJ...
          ↓
7. API valida o JWT com Supabase Auth
          ↓
8. Se valido → retorna dados. Se nao → 401 Unauthorized
```

### Fluxo de um form submission

```
1. Visitante preenche formulario no site (solfil.pt)
          ↓
2. Frontend faz POST /api/v1/forms/submit com API Key
          ↓
3. Railway → Express valida dados, cria entry no Supabase
          ↓
4. Trigger do Supabase dispara webhook (entry.created)
          ↓
5. API verifica forms-config para webhook URL
          ↓
6. Se configurado → POST ao Make.com/Zapier → email enviado
          ↓
7. Lead visivel no admin (Conteudo > Form Submissions)
```

---

## 5. Checklist de acesso para novo programador

Antes de comecar a trabalhar, certifica-te que tens:

- [ ] **GitHub** — conta adicionada como collaborator ao repo SEMRUMO-LDA/kibanCMS
- [ ] **Railway** — acesso ao projeto kibanCMS no dashboard
- [ ] **Supabase** — acesso ao dashboard da organizacao SEMRUMO-LDA
- [ ] **CMS Admin** — conta criada em kiban.pt com role admin ou super_admin
- [ ] **Ficheiro .env** — copia do `.env.example` preenchido com as chaves reais
- [ ] **Node.js 18+** e **pnpm 8+** instalados na maquina
- [ ] **Git** configurado com SSH ou HTTPS para o GitHub

### Pedir acessos

Contacta o Tiago Pacheco (responsavel tecnico) para:
1. Ser adicionado ao GitHub (organização SEMRUMO-LDA)
2. Ser convidado para o Railway (projeto kibanCMS)
3. Ser convidado para o Supabase (organizacao SEMRUMO-LDA)
4. Receber as variaveis de ambiente para o `.env` local

---

## 6. Erros comuns e onde procurar

| Sintoma | Onde investigar |
|---------|-----------------|
| Site nao carrega | Railway > Logs (servidor caiu?) |
| 401 Unauthorized | Supabase > api_keys (key valida?) |
| 403 Forbidden | Supabase > profiles (role correto?) |
| 500 Internal Error | Railway > Logs (ver stack trace) |
| Login nao funciona | Supabase > Authentication > Users |
| Imagens nao carregam | Supabase > Storage > media bucket |
| Deploy falhou | Railway > Deployments (ver build log) |
| Base de dados vazia | Supabase > SQL Editor (correr migracao) |

---

## 7. Links rapidos

| Recurso | URL |
|---------|-----|
| CMS Admin (producao) | https://kiban.pt |
| API Health Check | https://kiban.pt/health |
| GitHub Repo | https://github.com/SEMRUMO-LDA/kibanCMS |
| Railway Dashboard | https://railway.app |
| Supabase Dashboard | https://supabase.com/dashboard |
| Guia do Programador | `docs/DEVELOPER_GUIDE.md` |
| Endpoints da API | `docs/API_ENDPOINTS.md` |
| Setup Email Forms | `docs/FORMS_EMAIL_SETUP.md` |

---

## Contactos

- **Responsavel tecnico:** Tiago Pacheco
- **Agencia:** AORUBRO — dev@kiban.pt
- **Repositorio:** github.com/SEMRUMO-LDA/kibanCMS
