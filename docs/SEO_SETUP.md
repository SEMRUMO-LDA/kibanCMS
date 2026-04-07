# kibanCMS — SEO & Analytics Addon

> Addon completo para gerir SEO, Open Graph, analytics, indexacao,
> structured data e code injection. 23 campos que cobrem tudo o que
> um site precisa para rankear bem em 2026.

---

## O que inclui

| Categoria | Campos | Para que serve |
|-----------|--------|----------------|
| **Meta Tags** | meta_title, meta_description, favicon_url, canonical_url | Tags basicas que o Google le |
| **Open Graph** | og_title, og_description, og_image, og_type | Como o site aparece quando partilhado no Facebook/LinkedIn |
| **Twitter Cards** | twitter_card, twitter_handle | Como o site aparece quando partilhado no X/Twitter |
| **Analytics** | google_analytics, google_tag_manager, facebook_pixel | Tracking de visitas e conversoes |
| **Indexacao** | robots_txt, noindex_default | Controlar o que os motores de busca podem ver |
| **Sitemap** | sitemap_url | Apontar motores de busca para o mapa do site |
| **Multilingual** | hreflang | Indicar versoes do site em diferentes linguas |
| **Verificacao** | google_site_verification, bing_site_verification, pinterest_verification | Provar que es dono do dominio |
| **Structured Data** | structured_data | JSON-LD para rich snippets no Google |
| **Custom Code** | custom_head_code, custom_body_code | Injetar scripts, chat widgets, etc. |

---

## Passo 1: Instalar

1. Abre o admin do CMS
2. Vai a **Extensoes > SEO & Analytics > Install**
3. Cria a collection `seo-settings`

---

## Passo 2: Configurar

1. Vai a **Conteudo > SEO Settings**
2. Cria uma entry (titulo: "Default", slug: "default")
3. Preenche os campos relevantes para o projeto

### Campos essenciais (preencher sempre)

| Campo | Exemplo | Notas |
|-------|---------|-------|
| **meta_title** | `Solfil — Materiais de Construcao` | Max 60 chars. Aparece no tab do browser e no Google |
| **meta_description** | `Qualidade e rigor no fornecimento...` | Max 160 chars. Aparece no Google abaixo do titulo |
| **og_image** | URL da imagem | 1200x630px. Aparece quando partilhado em redes sociais |
| **favicon_url** | `https://solfil.pt/favicon.ico` | Icone do tab do browser |
| **google_analytics** | `G-XXXXXXXXXX` | ID do Google Analytics 4 |

### Campos recomendados

| Campo | Exemplo | Notas |
|-------|---------|-------|
| **canonical_url** | `https://solfil.pt` | Evita conteudo duplicado |
| **og_title** | (vazio = usa meta_title) | So preencher se quiser diferente |
| **og_type** | `website` | Ou `article` para blogs |
| **twitter_card** | `summary_large_image` | Tipo de card no X/Twitter |
| **robots_txt** | `User-agent: *\nAllow: /` | Controla crawling |
| **sitemap_url** | `https://solfil.pt/sitemap.xml` | Ajuda Google a indexar |
| **google_site_verification** | `google-site-verification=xxx` | Verificacao Search Console |
| **structured_data** | JSON-LD (ver abaixo) | Rich snippets no Google |

### Campos opcionais

| Campo | Quando usar |
|-------|-------------|
| **hreflang** | Site com mais de 1 lingua |
| **google_tag_manager** | Se usar GTM em vez de GA direto |
| **facebook_pixel** | Se fizer campanhas Facebook/Instagram |
| **bing_site_verification** | Se quiser aparecer no Bing |
| **pinterest_verification** | Se o site tiver forte presenca no Pinterest |
| **noindex_default** | Ativar em ambientes de staging/teste |
| **custom_head_code** | Scripts extra, meta tags, chat widgets |
| **custom_body_code** | Tracking scripts que vao antes de </body> |

---

## Passo 3: Integrar no frontend

O frontend faz fetch da entry e injeta os valores nos meta tags.

### Next.js (App Router)

```typescript
// lib/seo.ts
import { getKibanClient } from './kiban';

export async function getSEOSettings() {
  const kiban = getKibanClient();
  if (!kiban) return null;

  try {
    const entry = await kiban.getEntry('seo-settings', 'default');
    return entry.content as Record<string, any>;
  } catch {
    return null;
  }
}
```

```tsx
// app/layout.tsx
import { getSEOSettings } from '@/lib/seo';

export async function generateMetadata() {
  const seo = await getSEOSettings();
  if (!seo) return { title: 'Fallback Title' };

  return {
    title: seo.meta_title,
    description: seo.meta_description,
    openGraph: {
      title: seo.og_title || seo.meta_title,
      description: seo.og_description || seo.meta_description,
      images: seo.og_image ? [{ url: seo.og_image, width: 1200, height: 630 }] : [],
      type: seo.og_type || 'website',
    },
    twitter: {
      card: seo.twitter_card || 'summary_large_image',
      site: seo.twitter_handle,
    },
    alternates: {
      canonical: seo.canonical_url,
    },
    icons: {
      icon: seo.favicon_url,
    },
    verification: {
      google: seo.google_site_verification,
      other: {
        'msvalidate.01': seo.bing_site_verification,
        'p:domain_verify': seo.pinterest_verification,
      },
    },
    robots: seo.noindex_default ? { index: false, follow: false } : undefined,
  };
}
```

### Injetar analytics e custom code

```tsx
// app/layout.tsx (dentro do <head>)
export default async function RootLayout({ children }) {
  const seo = await getSEOSettings();

  return (
    <html>
      <head>
        {/* Google Analytics */}
        {seo?.google_analytics && (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${seo.google_analytics}`} />
            <script dangerouslySetInnerHTML={{ __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${seo.google_analytics}');
            `}} />
          </>
        )}

        {/* Google Tag Manager */}
        {seo?.google_tag_manager && (
          <script dangerouslySetInnerHTML={{ __html: `
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${seo.google_tag_manager}');
          `}} />
        )}

        {/* Facebook Pixel */}
        {seo?.facebook_pixel && (
          <script dangerouslySetInnerHTML={{ __html: `
            !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
            n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
            document,'script','https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${seo.facebook_pixel}');
            fbq('track', 'PageView');
          `}} />
        )}

        {/* Custom Head Code */}
        {seo?.custom_head_code && (
          <div dangerouslySetInnerHTML={{ __html: seo.custom_head_code }} />
        )}

        {/* Structured Data */}
        {seo?.structured_data && (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: seo.structured_data }} />
        )}
      </head>
      <body>
        {children}

        {/* Custom Body Code */}
        {seo?.custom_body_code && (
          <div dangerouslySetInnerHTML={{ __html: seo.custom_body_code }} />
        )}
      </body>
    </html>
  );
}
```

### HTML estatico

```html
<head>
  <title>{{meta_title}}</title>
  <meta name="description" content="{{meta_description}}">
  <link rel="canonical" href="{{canonical_url}}">
  <link rel="icon" href="{{favicon_url}}">

  <!-- Open Graph -->
  <meta property="og:title" content="{{og_title}}">
  <meta property="og:description" content="{{og_description}}">
  <meta property="og:image" content="{{og_image}}">
  <meta property="og:type" content="{{og_type}}">

  <!-- Twitter -->
  <meta name="twitter:card" content="{{twitter_card}}">
  <meta name="twitter:site" content="{{twitter_handle}}">

  <!-- Verification -->
  <meta name="google-site-verification" content="{{google_site_verification}}">
  <meta name="msvalidate.01" content="{{bing_site_verification}}">

  <!-- Hreflang (multilingual) -->
  <link rel="alternate" hreflang="pt" href="https://example.pt">
  <link rel="alternate" hreflang="en" href="https://example.com">

  <!-- Structured Data -->
  <script type="application/ld+json">{{structured_data}}</script>
</head>
```

---

## Structured Data — exemplos

### Empresa local (Local Business)

```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Solfil, SA",
  "description": "Materiais de construcao desde 1986",
  "url": "https://solfil.pt",
  "telephone": "+351289580320",
  "email": "geral@solfil.pt",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Estrada Nacional 125, Vale de Parra",
    "addressLocality": "Albufeira",
    "postalCode": "8200-427",
    "addressCountry": "PT"
  },
  "openingHours": "Mo-Fr 07:30-12:30,14:00-18:00",
  "sameAs": [
    "https://www.facebook.com/solfilpt/",
    "https://www.instagram.com/solfilpt/"
  ]
}
```

### Website generico

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Nome do Site",
  "url": "https://example.com",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://example.com/search?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
```

### Agencia (Organization)

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "AORUBRO",
  "url": "https://aorubro.pt",
  "logo": "https://aorubro.pt/logo.png",
  "contactPoint": {
    "@type": "ContactPoint",
    "email": "dev@kiban.pt",
    "contactType": "technical support"
  }
}
```

---

## Hreflang — como preencher

Para sites com mais de 1 lingua, preenche o campo `hreflang` com uma linha por lingua:

```
pt|https://solfil.pt
en|https://solfil.pt/en
```

O frontend converte isto em:
```html
<link rel="alternate" hreflang="pt" href="https://solfil.pt">
<link rel="alternate" hreflang="en" href="https://solfil.pt/en">
```

---

## Checklist SEO para novos projetos

Quando a AORUBRO lanca um novo site, preencher estes campos no addon:

- [ ] **meta_title** — Max 60 chars, com keyword principal
- [ ] **meta_description** — Max 160 chars, call-to-action incluido
- [ ] **favicon_url** — Favicon .ico ou .png
- [ ] **og_image** — Imagem 1200x630px (aparece no Facebook/LinkedIn)
- [ ] **canonical_url** — URL principal do site
- [ ] **google_analytics** — ID do GA4
- [ ] **robots_txt** — `User-agent: *\nAllow: /\nSitemap: URL`
- [ ] **sitemap_url** — URL do sitemap XML
- [ ] **structured_data** — JSON-LD da empresa (LocalBusiness ou Organization)
- [ ] **google_site_verification** — Verificar no Search Console
- [ ] **noindex_default** — OFF em producao, ON em staging

---

## API

O frontend le os dados via:

```
GET /api/v1/entries/seo-settings/default
Authorization: Bearer kiban_live_xxx
```

Resposta:
```json
{
  "data": {
    "content": {
      "meta_title": "Solfil — Materiais de Construcao",
      "meta_description": "Qualidade e rigor...",
      "og_image": "https://...",
      "google_analytics": "G-XXXXXXXXXX",
      ...
    }
  }
}
```

---

## Campos completos (23 total)

| # | Campo | Tipo | Obrigatorio |
|---|-------|------|-------------|
| 1 | meta_title | text | Sim |
| 2 | meta_description | textarea | Nao |
| 3 | favicon_url | url | Nao |
| 4 | canonical_url | url | Nao |
| 5 | og_title | text | Nao |
| 6 | og_description | textarea | Nao |
| 7 | og_image | image | Nao |
| 8 | og_type | text | Nao |
| 9 | twitter_card | text | Nao |
| 10 | twitter_handle | text | Nao |
| 11 | google_analytics | text | Nao |
| 12 | google_tag_manager | text | Nao |
| 13 | facebook_pixel | text | Nao |
| 14 | robots_txt | textarea | Nao |
| 15 | noindex_default | boolean | Nao |
| 16 | sitemap_url | url | Nao |
| 17 | hreflang | textarea | Nao |
| 18 | google_site_verification | text | Nao |
| 19 | bing_site_verification | text | Nao |
| 20 | pinterest_verification | text | Nao |
| 21 | structured_data | textarea | Nao |
| 22 | custom_head_code | textarea | Nao |
| 23 | custom_body_code | textarea | Nao |
