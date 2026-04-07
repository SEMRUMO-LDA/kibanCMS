# kibanCMS — Newsletter Addon

> Capturar subscritores de email a partir de qualquer frontend.
> Todos os subscritores ficam no CMS com deduplicacao automatica.

---

## Arquitetura

```
Frontend (footer, popup, etc.)
         ↓
POST /api/v1/newsletter/subscribe (API Key)
         ↓
API verifica se email ja existe (dedup)
         ↓
Cria entry em "newsletter-subscribers"
         ↓
Admin ve subscritores no CMS (Conteudo > Newsletter Subscribers)
```

---

## Passo 1: Instalar o addon

1. Abre o admin do CMS
2. Vai a **Extensoes > Newsletter > Install**
3. Cria 2 collections:
   - **Newsletter Subscribers** — lista de emails
   - **Newsletter Campaigns** — tracking de campanhas (opcional)

---

## Passo 2: Integrar no frontend

### HTML / JavaScript simples

```html
<form id="newsletter-form">
  <input type="email" id="news-email" placeholder="O seu email..." required />
  <button type="submit">Subscrever</button>
</form>

<script>
  document.getElementById('newsletter-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('news-email').value;
    const btn = e.target.querySelector('button');

    btn.textContent = 'A enviar...';
    btn.disabled = true;

    try {
      const res = await fetch('https://kiban.pt/api/v1/newsletter/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer kiban_live_xxxxx',
        },
        body: JSON.stringify({
          email: email,
          source: 'footer',
        }),
      });

      if (res.ok) {
        btn.textContent = 'Subscrito!';
        document.getElementById('news-email').value = '';
        setTimeout(() => { btn.textContent = 'Subscrever'; btn.disabled = false; }, 3000);
      } else {
        throw new Error('Erro');
      }
    } catch {
      btn.textContent = 'Erro. Tente novamente.';
      btn.disabled = false;
      setTimeout(() => { btn.textContent = 'Subscrever'; }, 3000);
    }
  });
</script>
```

### React / Next.js

```tsx
'use client';
import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_KIBAN_API_URL;
const KEY = process.env.NEXT_PUBLIC_KIBAN_FORMS_KEY;

export function NewsletterForm({ source = 'footer' }: { source?: string }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus('loading');
    try {
      const res = await fetch(`${API}/api/v1/newsletter/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${KEY}`,
        },
        body: JSON.stringify({ email, source }),
      });

      if (res.ok) {
        setStatus('success');
        setEmail('');
        setTimeout(() => setStatus('idle'), 5000);
      } else {
        throw new Error('Subscription failed');
      }
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {status === 'success' ? (
        <p>Obrigado por se subscrever!</p>
      ) : (
        <>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="O seu email..."
            required
          />
          <button type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? 'A enviar...' : 'Subscrever'}
          </button>
          {status === 'error' && <p>Erro. Tente novamente.</p>}
        </>
      )}
    </form>
  );
}
```

---

## API Endpoints

| Rota | Metodo | Auth | Descricao |
|------|--------|------|-----------|
| `/api/v1/newsletter/subscribe` | POST | API Key | Subscrever email |
| `/api/v1/newsletter/unsubscribe` | POST | API Key | Cancelar subscricao |

### POST /subscribe

**Body:**
```json
{
  "email": "joao@email.pt",
  "name": "Joao Silva",
  "source": "footer"
}
```
- `email` — obrigatorio
- `name` — opcional
- `source` — opcional (onde subscreveu: footer, popup, homepage, etc.)

**Resposta (201 — novo subscritor):**
```json
{
  "success": true,
  "data": { "subscribed": true }
}
```

**Resposta (200 — ja existia):**
```json
{
  "success": true,
  "data": { "subscribed": true }
}
```
Retorna sempre sucesso — nao revela se o email ja existia (privacidade).

### POST /unsubscribe

**Body:**
```json
{
  "email": "joao@email.pt"
}
```

**Resposta:**
```json
{
  "success": true,
  "data": { "unsubscribed": true }
}
```
Marca `is_active: false` na entry. Nao apaga o registo.

---

## Campos guardados por subscritor

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `email` | email | Email do subscritor |
| `name` | text | Nome (opcional) |
| `source` | text | Onde subscreveu (footer, popup, etc.) |
| `subscribed_at` | date | Data da subscricao |
| `is_active` | boolean | Ativo ou cancelado |
| `tags` | text | Tags para segmentacao (vip, early-adopter) |

---

## Funcionalidades

| Feature | Estado |
|---------|--------|
| Subscricao por email | Funcional |
| Deduplicacao automatica | Funcional |
| Tracking de source (footer, popup, etc.) | Funcional |
| Unsubscribe (marca como inativo) | Funcional |
| Rate limit (20 req/15min) | Funcional |
| Privacidade (nao revela se email existe) | Funcional |
| Newsletter Campaigns (tracking) | Collection existe, sem backend dedicado |

---

## Segmentacao e export

### Ver subscritores ativos

No CMS, vai a **Conteudo > Newsletter Subscribers** e filtra por status **Published**.
Subscritores cancelados (unsubscribe) ficam com `is_active: false` no content.

### Exportar para Mailchimp / Brevo / Sendinblue

Ainda nao ha export nativo. Opcoes atuais:

1. **Manual** — Ver no admin, copiar emails
2. **API** — Fazer GET `/api/v1/entries/newsletter-subscribers?status=published&limit=500` e processar
3. **Supabase direto** — Query SQL no Supabase Dashboard

```bash
# Exportar emails via API
curl -s "https://kiban.pt/api/v1/entries/newsletter-subscribers?status=published&limit=500" \
  -H "Authorization: Bearer kiban_live_xxxxx" | \
  jq -r '.data[].content.email'
```

**Nota:** Export CSV esta planeado para a v1.4 — vai permitir download direto do admin.

---

## Usar com webhook (envio de newsletters)

Se quiseres disparar uma acao quando alguem subscreve (ex: enviar email de boas-vindas):

1. Configura um **webhook** no CMS (Settings > Webhooks ou via API)
2. Evento: `entry.created`
3. Collection: `newsletter-subscribers`
4. O webhook dispara com os dados do subscritor
5. Liga a Make.com, Zapier, ou servico de email para enviar boas-vindas

---

## Troubleshooting

### Email nao aparece no CMS
1. Addon Newsletter esta instalado? (collection `newsletter-subscribers` existe?)
2. API Key valida?
3. Ver consola do browser para erros de rede

### Emails duplicados
Nao deve acontecer — a API verifica se o email ja existe antes de criar.
Se por alguma razao houver duplicados, pode ter sido criado manualmente no admin.

### Rate limit atingido
Limite de 20 subscricoes por 15 minutos por IP.
Normal em uso real. Se precisar de mais, ajustar `formsLimiter` em `server.ts`.
