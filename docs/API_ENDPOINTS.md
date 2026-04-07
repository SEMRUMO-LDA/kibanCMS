# kibanCMS — API Endpoints

> Documentacao completa de todos os endpoints da API v1

---

## Autenticacao

| Metodo | Descricao |
|--------|-----------|
| **JWT** | `Authorization: Bearer <token>` — usado nas rotas admin, requer JWT valido do Supabase |
| **API Key** | `Authorization: <api-key>` — rotas publicas (entries, media, webhooks) |
| **validateAny** | Aceita JWT ou API Key |
| **Public** | Sem autenticacao (health, redirects) |

**Rate Limiting:** 100 requests por 15 minutos por IP em todas as rotas `/api/v1`.

---

## 1. Health Check

| Rota | Metodo | Auth | Descricao |
|------|--------|------|-----------|
| `/health` | GET | Public | Status do servico. Retorna: status, timestamp, versao, modo (dev/prod) |

---

## 2. Collections

**Base:** `/api/v1/collections` — **Auth:** JWT (Admin)

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/v1/collections` | GET | Listar todas as collections com metadata (id, name, slug, description, type, icon) |
| `/api/v1/collections/:slug` | GET | Obter collection com schema completo e definicao de fields |
| `/api/v1/collections` | POST | Criar nova collection. Valida formato do slug e previne duplicados |
| `/api/v1/collections/:slug` | PUT | Atualizar metadata e fields da collection. Permite alteracao de slug |
| `/api/v1/collections/:slug` | DELETE | Apagar collection e todas as entries associadas (cascade delete) |

---

## 3. Entries

**Base:** `/api/v1/entries/:collection` — **Auth:** JWT ou API Key

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/v1/entries/:collection` | GET | Listar entries com paginacao, filtros e ordenacao |
| `/api/v1/entries/:collection/:slug` | GET | Obter entry por slug com detalhes completos e info do autor |
| `/api/v1/entries/:collection` | POST | Criar entry com validacao contra schema da collection. Status: draft, review, scheduled, published, archived |
| `/api/v1/entries/:collection/:slug` | PUT | Atualizar entry. Autores editam as proprias; admins/editors editam qualquer uma |
| `/api/v1/entries/:collection/:slug` | DELETE | Apagar entry. Autores apagam as proprias; admins apagam qualquer uma |

**Query params (GET list):** `status`, `search`, `tags`, `limit` (default 100, max 500), `offset`, `sort`, `order`

---

## 4. Media

**Base:** `/api/v1/media` — **Auth:** JWT ou API Key

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/v1/media` | GET | Listar ficheiros media com filtros. Nao-admins veem apenas proprios + publicos |
| `/api/v1/media/:id` | GET | Obter detalhes de ficheiro media com URL publica |
| `/api/v1/media/upload` | POST | Upload via multipart/form-data ou base64 JSON. Max 50MB. Tipos: imagens, video, audio, PDF |
| `/api/v1/media/:id` | PATCH | Atualizar metadata (alt_text, caption, folder_path, is_public). Dono ou admin |
| `/api/v1/media/:id` | DELETE | Apagar ficheiro do storage e DB. Dono ou admin |

**Query params (GET list):** `type`, `search`, `folder`, `limit` (default 50, max 200), `offset`

**Upload params:** `alt_text`, `caption`, `folder_path`, `is_public`

---

## 5. Media Intelligence

**Auth:** JWT

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/v1/media/:id/usage` | GET | Encontrar todas as entries que referenciam um ficheiro media (reverse lookup) |
| `/api/v1/media/check-duplicate` | POST | Verificar se hash do ficheiro ja existe. Query: `hash`, `filename` |

---

## 6. Users

**Base:** `/api/v1/users` — **Auth:** JWT (Admin)

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/v1/users` | GET | Listar todos os users com roles e perfis |
| `/api/v1/users/:id` | GET | Obter perfil de user com preferencias |
| `/api/v1/users/invite` | POST | Enviar convite por email. Admin define role inicial (admin/editor/author/viewer) |
| `/api/v1/users/:id` | PATCH | Atualizar role/perfil. Previne auto-demossao. So super_admin atribui super_admin |
| `/api/v1/users/:id` | DELETE | Apagar conta de user via Supabase admin API. Previne auto-eliminacao |

**Query params (GET list):** `role`, `search`, `limit` (default 50, max 200), `offset`

---

## 7. Webhooks

**Base:** `/api/v1/webhooks` — **Auth:** JWT (recursos do proprio user)

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/v1/webhooks` | GET | Listar webhooks do user com estatisticas de entrega |
| `/api/v1/webhooks` | POST | Criar webhook. Eventos: `entry.created`, `entry.updated`, `entry.deleted`, `media.uploaded`, `webhook.test`. Retorna secret (apenas na criacao) |
| `/api/v1/webhooks/:id` | GET | Obter detalhes do webhook (apenas dono) |
| `/api/v1/webhooks/:id` | PATCH | Atualizar config (name, url, events, collections, enabled). Apenas dono |
| `/api/v1/webhooks/:id` | DELETE | Apagar webhook. Apenas dono |
| `/api/v1/webhooks/:id/deliveries` | GET | Historico de entregas do webhook. Query: `limit`, `offset`. Apenas dono |
| `/api/v1/webhooks/:id/test` | POST | Enviar evento de teste. Apenas dono |

---

## 8. AI Features

**Base:** `/api/v1/ai` — **Auth:** JWT (requer `GEMINI_API_KEY`)

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/v1/ai/generate-collection` | POST | Gerar schema de collection a partir de imagem (base64). Usa Google Gemini vision |
| `/api/v1/ai/alt-text` | POST | Gerar alt-text de acessibilidade para imagem (base64). Max 125 chars |
| `/api/v1/ai/translate` | POST | Traduzir conteudo para lingua alvo. Preserva estrutura JSON, keys e URLs |
| `/api/v1/ai/adjust-tone` | POST | Reescrever texto com ajuste de tom: professional, casual, shorter, longer, fix_grammar, seo_optimize |

---

## 9. Dashboard & Analytics

**Auth:** JWT (Admin)

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/v1/dashboard/stats` | GET | Metricas completas: contagens (entries, collections, media, users, API keys), breakdown por collection, drafts recentes, entries agendadas, atividade recente |
| `/api/v1/activity` | GET | Feed de atividade recente (entries criadas/atualizadas) com info do autor e collection |

**Query params (activity):** `limit` (default 50, max 200), `offset`

---

## 10. Forms (Addon)

**Base:** `/api/v1/forms` — **Auth:** API Key — **Rate Limit:** 20 req/15min por IP

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/v1/forms/submit` | POST | Submeter formulario de contacto. Cria entry em `form-submissions`, dispara webhook de notificacao |
| `/api/v1/forms/submissions` | GET | Listar submissoes (admin). Filtros: `form_name`, `is_read`, `limit`, `offset` |

**Body (POST /submit):**
```json
{
  "form_name": "contact",
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+351 912 345 678",
  "subject": "Orcamento",
  "message": "Gostaria de pedir um orcamento...",
  "source_url": "https://meusite.pt/contacto",
  "extra": { "company": "ACME" }
}
```

**Resposta (201):**
```json
{
  "success": true,
  "data": { "id": "uuid", "form": "contact", "received_at": "ISO-8601" }
}
```

**Pre-requisito:** Addon "Forms" instalado (collection `form-submissions` deve existir).

**Webhook de notificacao:** Configuravel por form via collection `forms-config` ou global via Settings. O payload enviado ao webhook inclui: submission data, emails de destino, subject template e auto-reply.

---

## 11. Payments (Addon — Stripe)

**Base:** `/api/v1/payments` — **Auth:** API Key (create-session, transactions) / Public (webhook)

| Rota | Metodo | Auth | Descricao |
|------|--------|------|-----------|
| `/api/v1/payments/create-session` | POST | API Key | Cria Stripe Checkout Session, retorna URL de pagamento |
| `/api/v1/payments/webhook` | POST | Public (Stripe signature) | Recebe eventos do Stripe (pagamentos, reembolsos) |
| `/api/v1/payments/transactions` | GET | API Key | Listar transacoes. Filtros: `status`, `limit`, `offset` |
| `/api/v1/payments/config` | GET | API Key | Retorna publishable key e moeda default (seguro, sem secret key) |

**Body (POST /create-session):**
```json
{
  "product_slug": "produto-x",
  "success_url": "https://meusite.pt/obrigado",
  "cancel_url": "https://meusite.pt/checkout"
}
```
Ou com montante manual (sem produto no CMS):
```json
{
  "amount": 2500,
  "currency": "eur",
  "name": "Consultoria 30min",
  "success_url": "https://meusite.pt/obrigado",
  "cancel_url": "https://meusite.pt/checkout"
}
```

**Resposta (201):**
```json
{
  "data": {
    "session_id": "cs_live_xxx",
    "checkout_url": "https://checkout.stripe.com/c/pay/cs_live_xxx"
  }
}
```

**Pre-requisitos:** Addon "Stripe Payments" instalado + `STRIPE_SECRET_KEY` configurado no servidor.

**Configuracao:** Stripe keys sao lidas da collection `stripe-config` (entry slug `default`). Fallback para variaveis de ambiente (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_DEFAULT_CURRENCY`).

---

## 12. Redirects

**Base:** `/api/v1/redirects` — **Auth:** Public

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/v1/redirects/resolve?path=/old-page` | GET | Resolver regra de redirect. API publica para frontends. Retorna: from, to, type (301/302), permanent |

---

## Formato de Resposta Padrao

**Sucesso:**
```json
{
  "data": { ... },
  "meta": {
    "pagination": { "limit": 100, "offset": 0, "total": 42 }
  },
  "timestamp": "2026-04-06T12:00:00.000Z"
}
```

**Erro:**
```json
{
  "error": {
    "message": "Descricao do erro",
    "status": 400,
    "timestamp": "2026-04-06T12:00:00.000Z"
  }
}
```

---

## Resumo

| Area | Endpoints | Metodos |
|------|-----------|---------|
| Health | 1 | 1 |
| Collections | 5 | 5 |
| Entries | 5 | 5 |
| Media | 5 | 5 |
| Media Intelligence | 2 | 2 |
| Users | 5 | 5 |
| Webhooks | 7 | 7 |
| AI Features | 4 | 4 |
| Dashboard & Analytics | 2 | 2 |
| Forms | 2 | 2 |
| Payments | 4 | 4 |
| Redirects | 1 | 1 |
| **Total** | **43** | **43** |
