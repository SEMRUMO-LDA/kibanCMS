# kibanCMS — Stripe Payments Setup

> Guia para configurar pagamentos via Stripe. Multi-cliente — cada projeto
> configura as suas proprias Stripe keys dentro do CMS.

---

## Arquitetura

```
Frontend → POST /api/v1/payments/create-session → API le Stripe keys do CMS
                                                 → Cria sessao no Stripe
                                                 → Retorna checkout_url
         → Redirect para checkout.stripe.com     → Cliente paga
         → Stripe envia webhook ao CMS           → Transacao registada
         → Redirect para success_url             → Cliente ve confirmacao
```

**Multi-cliente:** As Stripe keys ficam guardadas na collection `stripe-config`
dentro do CMS — nao em variaveis de ambiente. Cada instancia do kibanCMS tem
a sua propria conta Stripe.

**Seguranca:** O pagamento acontece na pagina hosted do Stripe.
O CMS nunca toca em dados de cartao. Zero complexidade PCI.

---

## Seguranca

| Dado | Onde fica | Exposto? |
|------|-----------|----------|
| **Secret Key** (sk_) | CMS DB (stripe-config collection) | Nunca sai do servidor. API le da DB, usa internamente |
| **Publishable Key** (pk_) | CMS DB + endpoint /payments/config | Seguro — e publico por design (Stripe) |
| **Webhook Secret** (whsec_) | CMS DB | Nunca exposto. Usado para verificar assinatura |
| **Dados de cartao** | Stripe.com | Nunca passam pelo kibanCMS |
| **API Key** (kiban_live_) | Frontend | Protege o endpoint, rate limited |

**Porque e seguro guardar a sk_ na DB:**
- A API usa **service role key** para ler a DB (bypassa RLS)
- A collection `stripe-config` tem RLS — users normais nao a veem
- O endpoint `/payments/config` so retorna a **publishable key** (publica)
- A secret key nunca aparece em nenhuma resposta da API

---

## Passo 1: Criar conta Stripe

1. Vai a [stripe.com](https://stripe.com) e cria conta
2. Completa a verificacao da empresa
3. No dashboard, vai a **Developers > API keys**
4. Copia:
   - **Publishable key** (`pk_test_...` ou `pk_live_...`)
   - **Secret key** (`sk_test_...` ou `sk_live_...`)

---

## Passo 2: Configurar webhook no Stripe

1. No Stripe dashboard > **Developers > Webhooks**
2. Clica **Add endpoint**
3. URL: `https://kiban.pt/api/v1/payments/webhook`
4. Eventos:
   - `checkout.session.completed`
   - `charge.refunded`
5. Clica **Add endpoint**
6. Copia o **Signing secret** (`whsec_...`)

---

## Passo 3: Instalar addon no CMS

1. Abre o admin (kiban.pt)
2. Vai a **Extensoes > Stripe Payments > Install**
3. Cria 3 collections: `stripe-config`, `stripe-products`, `stripe-transactions`

---

## Passo 4: Configurar Stripe keys no CMS

1. Vai a **Conteudo > Stripe Config**
2. Cria uma nova entry:

| Campo | Valor |
|-------|-------|
| **Title** | Default Config |
| **Slug** | `default` (obrigatorio — a API procura este slug) |
| **stripe_publishable_key** | `pk_test_xxxx` ou `pk_live_xxxx` |
| **stripe_secret_key** | `sk_test_xxxx` ou `sk_live_xxxx` |
| **stripe_webhook_secret** | `whsec_xxxx` |
| **default_currency** | `eur` |
| **Status** | Published |

---

## Passo 5: Criar produtos (opcional)

Se quiseres gerir produtos no CMS:

1. Vai a **Conteudo > Stripe Products**
2. Cria uma entry:

| Campo | Valor |
|-------|-------|
| **Title** | Consultoria 1h |
| **Slug** | `consultoria-1h` |
| **product_name** | Consultoria 1 hora |
| **description** | Sessao de consultoria tecnica |
| **price** | `5000` (50.00 EUR em centimos) |
| **currency** | `eur` |
| **is_active** | `true` |
| **Status** | Published |

---

## Passo 6: Integrar no frontend

### Opcao A: Pagar com produto do CMS

```javascript
const API = 'https://kiban.pt/api/v1';
const KEY = 'kiban_live_xxxxx';

async function checkout(productSlug) {
  const res = await fetch(`${API}/payments/create-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KEY}`,
    },
    body: JSON.stringify({
      product_slug: productSlug,
      success_url: window.location.origin + '/obrigado',
      cancel_url: window.location.href,
    }),
  });

  const { data } = await res.json();
  window.location.href = data.checkout_url;
}
```

```html
<button onclick="checkout('consultoria-1h')">Pagar 50,00 EUR</button>
```

### Opcao B: Montante custom (sem produto no CMS)

```javascript
async function payCustom(amount, description) {
  const res = await fetch(`${API}/payments/create-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KEY}`,
    },
    body: JSON.stringify({
      amount: amount,
      currency: 'eur',
      name: description,
      success_url: window.location.origin + '/obrigado',
      cancel_url: window.location.href,
    }),
  });

  const { data } = await res.json();
  window.location.href = data.checkout_url;
}
```

### Opcao C: React / Next.js

```tsx
'use client';
import { useState } from 'react';

export function CheckoutButton({ productSlug, label }: { productSlug: string; label: string }) {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_KIBAN_API_URL}/api/v1/payments/create-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_KIBAN_FORMS_KEY}`,
        },
        body: JSON.stringify({
          product_slug: productSlug,
          success_url: window.location.origin + '/obrigado',
          cancel_url: window.location.href,
        }),
      });
      const { data } = await res.json();
      window.location.href = data.checkout_url;
    } catch {
      alert('Erro ao processar pagamento.');
      setLoading(false);
    }
  };

  return (
    <button onClick={handleCheckout} disabled={loading}>
      {loading ? 'A processar...' : label}
    </button>
  );
}
```

---

## Passo 7: Testar

1. Usa chaves `test` (sk_test_, pk_test_)
2. Cartao de teste: `4242 4242 4242 4242` (qualquer data futura, qualquer CVC)
3. Clica no botao de pagamento → redireciona para Stripe Checkout
4. Paga → redireciona para success_url
5. Verifica no CMS: **Conteudo > Stripe Transactions**
6. Verifica no Stripe dashboard: **Payments**

### Cartoes de teste uteis

| Cartao | Cenario |
|--------|---------|
| `4242 4242 4242 4242` | Pagamento bem-sucedido |
| `4000 0025 0000 3155` | Requer 3D Secure |
| `4000 0000 0000 0002` | Cartao recusado |

---

## Mudar para producao

1. Ativa o modo live no Stripe (requer verificacao da empresa)
2. No CMS, edita **Stripe Config > default**:
   - Troca `pk_test_` por `pk_live_`
   - Troca `sk_test_` por `sk_live_`
3. No Stripe, cria novo webhook para o URL de producao
4. Atualiza `stripe_webhook_secret` com o novo whsec_

---

## API Endpoints

| Rota | Metodo | Auth | Descricao |
|------|--------|------|-----------|
| `/api/v1/payments/create-session` | POST | API Key | Cria Stripe Checkout Session |
| `/api/v1/payments/webhook` | POST | Stripe signature | Recebe eventos (pagamento, reembolso) |
| `/api/v1/payments/transactions` | GET | API Key | Listar transacoes |
| `/api/v1/payments/config` | GET | API Key | Retorna publishable key e moeda (seguro) |

---

## Troubleshooting

### "Stripe not configured"
Stripe Config nao existe ou nao esta publicada. Verifica:
1. Collection `stripe-config` existe? (addon instalado?)
2. Entry com slug `default` existe e esta Published?
3. Campo `stripe_secret_key` esta preenchido?

### Webhook nao regista transacoes
1. Stripe dashboard > Webhooks > ver eventos recentes
2. URL correto? `https://kiban.pt/api/v1/payments/webhook`
3. `stripe_webhook_secret` na Stripe Config corresponde ao endpoint?
4. Railway logs para erros de assinatura

### Transacao nao aparece no CMS
1. Collection `stripe-transactions` existe?
2. Existe user com role admin? (necessario como author da entry)
3. Ver Railway logs

---

## Fallback (variavel de ambiente)

Para setups single-tenant ou migracao, a API tambem aceita:

```
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_DEFAULT_CURRENCY=eur
```

A config do CMS tem **prioridade** sobre variaveis de ambiente.
