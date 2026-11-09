# kibanCMS — Meta Conversions API (CAPI)

> Envia conversões para a Meta a partir do servidor, além do Pixel no browser.
> Recupera conversões perdidas por bloqueadores e browsers com proteção de
> rastreamento. **Respeita o RGPD: sem consentimento de marketing, nada é enviado.**

## Que eventos são enviados

| Conversão | Evento Meta | `event_id` (deduplicação com o Pixel) |
|---|---|---|
| `POST /api/v1/forms/submit` | `Lead` | `tracking.event_id` ou `lead_<id da submissão>` |
| `POST /api/v1/newsletter/subscribe` | `CompleteRegistration` | `tracking.event_id` ou `sub_<hash do email>` |
| Pagamento confirmado (webhook Stripe, **só quando pago**) | `Purchase` (valor + moeda) | `tracking.event_id` ou `order_<id da encomenda>` / `booking_<id>` / `pay_<sessão>` |

Dados do cliente: email, telefone e nome **cifrados (SHA-256)** como a Meta exige,
mais IP, browser, página de origem e os cookies `_fbp`/`_fbc` enviados pelo site.
O token de acesso nunca sai do servidor.

## Configurar (por cliente)

Conteúdo → **SEO Settings**:

1. **Facebook Pixel ID**
2. **Meta Conversions API (CAPI)**: ligar
3. **CAPI Access Token**: Events Manager → Pixel → Definições → Conversions API → Gerar token
4. **CAPI Test Event Code** (opcional): para ver os eventos em Events Manager → Eventos de teste. Apagar depois de validar.
5. **CAPI Consent**: manter **"Only with marketing consent"** (recomendado). "Always send" só se o cliente tiver outra base legal — responsabilidade do cliente.

**Settings → Saúde → Meta Conversions API** mostra se está configurada, o último
evento enviado, quantos não foram enviados por falta de consentimento e o último erro.

## RGPD — o que o site TEM de fazer

### 1. Só carregar o Pixel depois do consentimento de marketing

O banner de cookies do Kiban expõe o consentimento e avisa quando muda:

```html
<script>
  function loadPixel() {
    if (window.fbq) return;
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', 'PIXEL_ID');
    fbq('track', 'PageView');
  }
  function hasMarketing() {
    return !!(window.KibanCookieNotice && KibanCookieNotice.hasConsentFor('marketing'));
  }
  if (hasMarketing()) loadPixel();
  window.addEventListener('kiban-consent-change', function () { if (hasMarketing()) loadPixel(); });
</script>
```

### 2. Enviar o consentimento (e o `event_id`) com cada conversão

```ts
function tracking() {
  const cookie = (n: string) => document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)'))?.[1];
  return {
    marketing_consent: !!(window as any).KibanCookieNotice?.hasConsentFor('marketing'),
    event_id: crypto.randomUUID(),     // o MESMO id vai para o Pixel
    fbp: cookie('_fbp'),
    fbc: cookie('_fbc'),
    source_url: location.href,
  };
}

// Formulário
const t = tracking();
await fetch(`${API}/api/v1/forms/submit`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, 'X-Tenant': TENANT },
  body: JSON.stringify({ form_name: 'contacto', email, name, message, tracking: t }),
});
if (t.marketing_consent) (window as any).fbq?.('track', 'Lead', {}, { eventID: t.event_id });
```

Para o checkout (`/checkout/create-session`, `/bookings/v2/checkout`,
`/payments/create-session`) envia o mesmo objeto `tracking` no pedido. O CMS só o
guarda **se houver consentimento** e usa-o quando o pagamento é confirmado.
Na página de sucesso, o Pixel deve usar o mesmo `eventID` (o `tracking.event_id`
enviado, ou `order_<order_id>`).

> Se o formulário for enviado **a partir do servidor** do site (Server Action,
> route handler), o CMS vê o IP e o browser do servidor, não do visitante. A
> correspondência na Meta continua a funcionar com o email, o telefone e os
> cookies `_fbp`/`_fbc`, mas é mais fraca. Sempre que possível, envia o pedido a
> partir do browser.

## Banner de cookies — o que mudou

- As escolhas feitas em **Preferências** (por categoria) passam a ser guardadas e
  registadas no log de consentimentos — antes só "Aceitar todos" / "Rejeitar" eram.
- `KibanCookieNotice.hasConsentFor('marketing' | 'analytics' | 'preferences')`
- Evento `kiban-consent-change` sempre que o visitante muda a escolha.
