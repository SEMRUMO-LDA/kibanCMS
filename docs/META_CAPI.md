# kibanCMS — Marketing: Meta Pixel, Conversions API e Google

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

## Modo automático (todos os sites com os widgets do Kiban)

Se o site carrega o script dos widgets (`/widgets/loader.js` com `data-tenant`),
**não é preciso mexer no código do site**:

1. **Pixel instalado automaticamente** a partir do *Facebook Pixel ID* das SEO
   Settings, **só depois de o visitante aceitar cookies de Marketing** no banner
   do Kiban (e logo que aceite, sem recarregar a página). Envia `PageView`, também
   nas mudanças de página em sites SPA.
2. **Conversões rastreadas automaticamente**: os pedidos `fetch` do browser para
   a API do Kiban (`forms/submit`, `newsletter/subscribe`, checkout, reservas,
   pagamentos) recebem o objeto `tracking` (consentimento, `event_id`, `_fbp`, `_fbc`).
   Quando o pedido corre bem, o Pixel dispara `Lead` / `CompleteRegistration` /
   `InitiateCheckout` com o **mesmo `event_id`**, e a Meta deduplica com a CAPI.
3. Se o site **já tem o seu próprio Pixel** (`window.fbq` existe), o Kiban não
   instala outro, mas continua a acrescentar o `tracking` às conversões.

Requisitos:
- Add-ons → **Cookie Notice** ligado, **com a categoria "Marketing"**. Sem isto o
  Pixel nunca carrega, e Settings → Saúde avisa.
- SEO Settings → *Install Pixel automatically* ligado (vem ligado por omissão).
  Desliga-o se o site instala o Pixel por conta própria.

Limites: só são apanhados os pedidos feitos com `fetch` no browser. Formulários
enviados a partir do servidor do site (Server Actions, route handlers) ou com
`XMLHttpRequest` precisam do código manual abaixo. Para esses, a CAPI continua a
funcionar, mas o consentimento tem de ser enviado pelo site; sem ele, nada é enviado.

### Eventos automáticos

| O visitante… | Meta (Pixel + CAPI) | Google (GA4 / Ads) |
|---|---|---|
| envia um formulário | `Lead` | `generate_lead` |
| subscreve a newsletter | `CompleteRegistration` | `sign_up` |
| começa um checkout / reserva | `InitiateCheckout` | `begin_checkout` |
| clica em WhatsApp, `tel:` ou `mailto:` | `Contact` (browser + servidor) | `contact` (com `method`) |
| paga (webhook Stripe) | `Purchase` (+ `Schedule` se for reserva) | — (importar do GA4 se preciso) |

Para o Tag Manager, cada evento também vai para o `dataLayer` como `kiban_lead`,
`kiban_signup`, `kiban_checkout` ou `kiban_contact` (com `kiban_event_id`).

## Google: Analytics, Ads e Tag Manager (Consent Mode v2)

SEO Settings → **Google Analytics ID** (`G-…`), **Google Ads ID** (`AW-…`) e/ou
**Google Tag Manager** (`GTM-…`). Com *Install Google tags automatically* ligado
(vem ligado por omissão), o script dos widgets:

1. define o Consent Mode v2 com tudo **recusado** por omissão;
2. atualiza-o conforme o banner: *Analíticos* → `analytics_storage`;
   *Marketing* → `ad_storage`, `ad_user_data`, `ad_personalization`;
3. **Modo básico** (por omissão, recomendado): o GA4 só carrega depois de
   aceitar *Analíticos*, o Google Ads depois de aceitar *Marketing*.
   **Modo avançado**: as tags carregam logo e enviam sinais sem cookies até
   haver consentimento, o que deixa o Google estimar conversões de quem recusa.
   Decisão legal do cliente.

Se o site já tem o seu próprio `gtag`/GTM, o Kiban não carrega nada em
duplicado e só mantém o Consent Mode sincronizado com o banner.

## Validade do consentimento

Add-ons → Cookie Notice → **Validade do consentimento**:

- **Voltar a perguntar ao fim de** 12 meses (por omissão; 6 ou 13 opcional).
- O banner volta a aparecer **sozinho** quando se liga/desliga uma categoria.
- **Pedir consentimento a todos outra vez**: para mudanças de política.
- **Apagar registos com mais de** 24 meses (por omissão). Nunca apaga registos
  mais novos do que a validade do consentimento + 1 mês.
- **Exportar registo (CSV)**: data, escolha por categoria, IP e browser.

Enquanto o banner não validou a escolha guardada (ou se estiver desligado),
`KibanCookieNotice.hasConsentFor()` responde `false` e nada carrega. Quando fica
pronto dispara o evento `kiban-consent-ready`.

## Dashboard

O cartão **Marketing** no dashboard mostra a percentagem de visitantes que
aceitam, personalizam ou rejeitam cookies (últimos 30 dias), as conversões do
mês (contactos, newsletter, encomendas pagas) e avisa quando algo impede o
Pixel ou o Google de carregar.

## RGPD — modo manual (sites sem o script dos widgets)

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
- "Aceitar todos" só aceita as categorias que o banner mostra (antes aceitava
  também categorias escondidas, como Marketing).
- `KibanCookieNotice.hasConsentFor('marketing' | 'analytics' | 'preferences')`
- `KibanCookieNotice.getOfferedCategories()`
- Evento `kiban-consent-change` sempre que o visitante muda a escolha.
