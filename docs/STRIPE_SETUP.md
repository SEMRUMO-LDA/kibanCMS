# kibanCMS — Stripe Payments Setup

> Guia para configurar pagamentos via Stripe num frontend que usa o kibanCMS.

---

## Arquitetura

```
Frontend → POST /api/v1/payments/create-session → API cria sessao no Stripe
                                                 → Retorna checkout_url
         → Redirect para checkout.stripe.com     → Cliente paga
         → Stripe envia webhook ao CMS           → Transacao registada
         → Redirect para success_url             → Cliente ve confirmacao
```

O pagamento acontece na pagina hosted do Stripe (seguro, PCI compliant).
O CMS nunca toca em dados de cartao.

---

## Passo 1: Criar conta Stripe

1. Vai a [stripe.com](https://stripe.com) e cria conta
2. Completa a verificacao da empresa (necessario para modo live)
3. No dashboard, vai a **Developers > API keys**
4. Copia:
   - **Publishable key** (`pk_test_...` ou `pk_live_...`)
   - **Secret key** (`sk_test_...` ou `sk_live_...`)

**Nota:** Usa as chaves `test` durante o desenvolvimento. Muda para `live` quando for para producao.

---

## Passo 2: Configurar webhook no Stripe

1. No Stripe dashboard, vai a **Developers > Webhooks**
2. Clica **Add endpoint**
3. URL: `https://kiban.pt/api/v1/payments/webhook`
4. Eventos a escutar:
   - `checkout.session.completed`
   - `charge.refunded`
5. Clica **Add endpoint**
6. Copia o **Signing secret** (`whsec_...`)

---

## Passo 3: Configurar variaveis no servidor

Adiciona ao Railway (ou `.env` local):

```
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxx
STRIPE_DEFAULT_CURRENCY=eur
```

**Nunca** colocar a `STRIPE_SECRET_KEY` no frontend ou em ficheiros commitados.

---

## Passo 4: Instalar addon no CMS

1. Abre o admin do CMS (kiban.pt)
2. Vai a **Extensoes**
3. Encontra **Stripe Payments** e clica **Install**
4. Isto cria 2 collections:
   - **Stripe Transactions** — registo automatico de pagamentos
   - **Stripe Products** — produtos/servicos com preco

---

## Passo 5: Criar produtos no CMS (opcional)

Se quiseres gerir produtos no CMS em vez de enviar montantes hardcoded:

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
| **image_url** | (URL de imagem do produto) |
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
<button onclick="checkout('consultoria-1h')">
  Pagar Consultoria — 50,00 EUR
</button>
```

### Opcao B: Pagar montante custom (sem produto no CMS)

```javascript
async function payCustom(amount, description) {
  const res = await fetch(`${API}/payments/create-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KEY}`,
    },
    body: JSON.stringify({
      amount: amount,          // centimos (2500 = 25.00 EUR)
      currency: 'eur',
      name: description,
      customer_email: 'cliente@email.pt', // opcional, pre-preenche
      success_url: window.location.origin + '/obrigado',
      cancel_url: window.location.href,
      metadata: { order_ref: 'ORD-123' }, // dados custom
    }),
  });

  const { data } = await res.json();
  window.location.href = data.checkout_url;
}
```

```html
<button onclick="payCustom(2500, 'Orcamento Website')">
  Pagar 25,00 EUR
</button>
```

### Opcao C: React / Next.js

```tsx
'use client';

import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_KIBAN_API_URL;
const KEY = process.env.NEXT_PUBLIC_KIBAN_FORMS_KEY;

export function CheckoutButton({ productSlug, label }: { productSlug: string; label: string }) {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/payments/create-session`, {
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
    } catch (err) {
      alert('Erro ao processar pagamento. Tente novamente.');
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

### Modo test (chaves sk_test_ / pk_test_)

1. Usa o cartao de teste do Stripe: `4242 4242 4242 4242`
   - Validade: qualquer data futura
   - CVC: qualquer 3 digitos
2. Clica no botao de pagamento no frontend
3. Redireciona para Stripe Checkout → paga com cartao de teste
4. Redireciona para success_url
5. Verifica no CMS: **Conteudo > Stripe Transactions** — transacao deve aparecer
6. Verifica no Stripe dashboard: **Payments** — pagamento registado

### Mudar para producao

1. No Stripe, ativa o modo live (requer verificacao da empresa)
2. Troca as variaveis de ambiente:
   - `STRIPE_SECRET_KEY` → `sk_live_...`
   - `STRIPE_WEBHOOK_SECRET` → novo whsec_ do webhook live
3. No webhook do Stripe, cria um novo endpoint com URL de producao
4. Faz redeploy no Railway

---

## Fluxo completo

```
1. Visitante clica "Pagar" no frontend
2. Frontend faz POST /api/v1/payments/create-session
3. API cria Checkout Session no Stripe com preco/produto
4. API retorna checkout_url
5. Frontend redireciona para checkout.stripe.com
6. Visitante paga (cartao, Apple Pay, Google Pay, etc.)
7. Stripe processa pagamento
8. Stripe envia webhook POST /api/v1/payments/webhook
9. API verifica assinatura do webhook
10. API cria entry em stripe-transactions no CMS
11. Stripe redireciona visitante para success_url
12. Admin ve transacao no CMS (Conteudo > Stripe Transactions)
```

---

## Troubleshooting

### "Stripe not configured"
**Causa:** `STRIPE_SECRET_KEY` nao esta definida no servidor.
**Fix:** Adicionar a variavel no Railway > Variables.

### Webhook nao regista transacoes
1. Verificar no Stripe dashboard > Webhooks > eventos recentes
2. Confirmar que o URL esta correto: `https://kiban.pt/api/v1/payments/webhook`
3. Verificar que `STRIPE_WEBHOOK_SECRET` corresponde ao endpoint
4. Ver logs no Railway para erros de assinatura

### Pagamento funciona mas transacao nao aparece no CMS
1. Collection `stripe-transactions` existe? (addon instalado?)
2. Existe um user com role admin/super_admin? (necessario como author)
3. Ver Railway logs para erros do webhook handler

### Cartao de teste recusado
Usar: `4242 4242 4242 4242` (Visa de teste)
Para testar 3D Secure: `4000 0025 0000 3155`
Para testar recusa: `4000 0000 0000 0002`

---

## Seguranca

- **STRIPE_SECRET_KEY** nunca sai do servidor (variavel de ambiente)
- **Webhook** verificado com assinatura HMAC (whsec_)
- **Dados de cartao** nunca passam pelo kibanCMS (Stripe Checkout hosted)
- **PCI Compliance** e responsabilidade do Stripe, nao tua
- **API Key** protege o endpoint create-session de uso nao autorizado
