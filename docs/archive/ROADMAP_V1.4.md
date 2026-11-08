# kibanCMS v1.4 — Roadmap

> Prioridades definidas a 2026-04-07 com base no estado atual do produto,
> clientes ativos (Solfil), e necessidades identificadas durante o desenvolvimento.

---

## Estado atual (v1.3)

| Area | Estado |
|------|--------|
| Collections / Entries CRUD | Funcional |
| Media upload + gestao | Funcional |
| Users + roles (RBAC) | Funcional |
| API Keys + auth dual (JWT/API Key) | Funcional |
| Webhooks + delivery worker | Funcional |
| Forms addon (leads + webhook email) | Funcional |
| Stripe Payments addon | Funcional |
| Redirects Manager addon | Funcional |
| View modal para entries | Funcional |
| i18n (PT/EN) | Funcional |
| Onboarding wizard | Funcional |
| Command Palette (Cmd+K) | Funcional |
| Entry revisions (historico) | Funcional |
| AI features (alt-text, traducao, tom) | Funcional |

---

## Prioridade alta

Resolve problemas reais que afetam clientes e operacao.

### 1. SMTP nativo

**Problema:** Os campos SMTP em Settings > Email existem mas nao fazem nada.
O envio de emails depende do Make.com (servico externo).

**Solucao:**
- Instalar `nodemailer` no backend
- Ler config SMTP de `site-settings` (campos ja existem)
- Enviar email de notificacao e auto-reply diretamente
- Make.com passa a ser opcional (fallback)

**Ficheiros:** `apps/api/src/lib/mailer.ts` (novo), `apps/api/src/routes/forms.ts` (alterar)

**Impacto:** Elimina dependencia de terceiros para funcionalidade core.

---

### 2. Dashboard com leads e transacoes

**Problema:** O Painel mostra metricas genericas. O admin nao ve leads
recentes nem pagamentos sem navegar para as collections.

**Solucao:**
- Widget "Leads recentes" — ultimas 5 form submissions com nome, email, data
- Widget "Transacoes recentes" — ultimos 5 pagamentos com montante e status
- Click para ir direto ao entry (view modal ou edit)

**Ficheiros:** `apps/admin/src/pages/Dashboard.tsx`

**Impacto:** O admin abre o CMS e ve imediatamente o que interessa.

---

### 3. Notificacoes in-app (badge de leads nao lidas)

**Problema:** Nao ha indicacao visual de que existem leads novas.
O admin tem de entrar em Form Submissions para verificar.

**Solucao:**
- Badge com contador no sidebar ao lado de "Form Submissions"
- Baseado no campo `is_read: false` do content
- Marcar como lida ao abrir no view modal
- Atualizar contador em tempo real (poll cada 60s ou realtime)

**Ficheiros:** `apps/admin/src/layouts/DashboardLayout.tsx`, `apps/admin/src/pages/CollectionEntries.tsx`

**Impacto:** O admin nunca perde uma lead.

---

## Prioridade media

Adiciona valor ao produto e melhora a experiencia diaria.

### 4. Duplicar entry

**Problema:** Para criar entries parecidas (ex: produtos similares),
o admin tem de criar do zero e copiar campo a campo.

**Solucao:**
- Botao "Duplicar" na lista de entries (ao lado de View/Edit/Delete)
- Cria copia com slug auto-gerado e status draft
- Abre o editor com os dados pre-preenchidos

**Ficheiros:** `apps/admin/src/pages/CollectionEntries.tsx`, `apps/admin/src/pages/EntryEdit.tsx`

**Impacto:** Produtividade — menos cliques para conteudo repetitivo.

---

### 5. Sidebar — separar collections de addons

**Problema:** Form Submissions, Stripe Transactions e Redirects aparecem
misturados com Blog e Projects no sidebar. Confuso para o admin.

**Solucao:**
- Separar collections em 2 grupos no sidebar:
  - **CONTEUDO** — collections de tipo post/page/custom criadas pelo user
  - **ADDONS** — collections criadas por addons (form-submissions, stripe-*, redirects, etc.)
- Identificar pelo slug (lista de slugs de addon conhecidos)

**Ficheiros:** `apps/admin/src/layouts/DashboardLayout.tsx`

**Impacto:** Sidebar mais limpo e organizado.

---

### 6. Export CSV

**Problema:** Nao ha forma de exportar dados (leads, transacoes, conteudo)
sem aceder diretamente a base de dados.

**Solucao:**
- Botao "Export CSV" na lista de entries de qualquer collection
- Gera CSV com todos os campos do content + metadata
- Download direto no browser

**Ficheiros:** `apps/admin/src/pages/CollectionEntries.tsx` (botao + logica client-side)

**Impacto:** Clientes podem exportar leads para Excel sem pedir ao developer.

---

## Prioridade baixa

Nice to have — implementar quando houver tempo.

### 7. Preview publico de drafts

**Problema:** Para mostrar um draft a um cliente, o admin tem de publicar
temporariamente ou fazer screenshot.

**Solucao:**
- Gerar link de preview com token temporario (ex: `/preview/:token`)
- Token expira em 24h, nao requer login
- Botao "Share Preview" no editor de entries

**Ficheiros:** novo endpoint `apps/api/src/routes/preview.ts`

---

### 8. Campos select com opcoes configuradas

**Problema:** O tipo `select` existe nos field definitions mas nao ha UI
para definir as opcoes disponiveis. O user ve um select vazio.

**Solucao:**
- No Collection Builder, quando o tipo e `select`, mostrar campo para definir opcoes
- Guardar como array no field definition: `options: ["Opcao A", "Opcao B"]`
- No EntryEdit, renderizar `<select>` com as opcoes

**Ficheiros:** `apps/admin/src/components/collection-builder/FieldEditor.tsx`, `apps/admin/src/components/fields/SelectField.tsx`

---

### 9. Dark mode

**Problema:** O admin so tem tema claro.

**Solucao:**
- Os design tokens ja estao preparados para temas
- Adicionar toggle em Settings ou no header
- CSS variables com fallback para o tema atual
- Persistir preferencia em localStorage

**Ficheiros:** `apps/admin/src/shared/styles/design-tokens.ts`, `apps/admin/src/App.tsx`

---

## Criterios de decisao

| Criterio | Peso |
|----------|------|
| Resolve dor real de clientes atuais | Alto |
| Reduz dependencia de servicos externos | Alto |
| Melhora produtividade diaria do admin | Medio |
| Diferenciacao de produto | Medio |
| Nice to have / estetico | Baixo |

---

## Ordem de implementacao sugerida

1. SMTP nativo (elimina Make.com como dependencia)
2. Dashboard leads + transacoes (valor imediato)
3. Badge de leads nao lidas (complementa o dashboard)
4. Duplicar entry (quick win)
5. Sidebar organizado (quick win)
6. Export CSV (pedido frequente)
7. Select com opcoes (correcao de feature incompleta)
8. Preview publico (quando houver necessidade)
9. Dark mode (quando houver tempo)
