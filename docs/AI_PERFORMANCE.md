# kibanCMS — Performance e Pesquisa com IA

> Imagens otimizadas automaticamente e visibilidade nos motores de pesquisa
> com IA (ChatGPT, Perplexity, Claude, Google). Configuração por cliente em
> **Settings → IA & Performance**, que também mostra o código pronto a colar
> com o URL e o cliente certos.

O kibanCMS é headless: a velocidade final depende do site. O CMS trata
automaticamente do que é dele — imagens, robots.txt, sitemap, llms.txt e dados
estruturados. Cada site precisa de uma pequena integração, feita uma vez.

Todos os pedidos do site usam as variáveis de **Settings → API → Ligar o meu site**:

```
NEXT_PUBLIC_KIBAN_API_URL=https://kiban.pt
KIBAN_TENANT=<cliente>
KIBAN_API_KEY=kiban_live_…
```

---

## 1. Imagens otimizadas

`GET /api/v1/img?src=<URL pública da imagem>&w=828&q=75` (público, sem key)

- Redimensiona para a largura pedida (nunca aumenta) e corrige a orientação das fotos de telemóvel
- Converte para **AVIF** ou **WebP** quando o browser suporta; SVG e GIF são servidos como estão
- Cada variante é gerada uma vez e guardada no storage do cliente (`media/_variants/`); cache HTTP de 30 dias
- Só aceita imagens do storage público dos clientes do CMS (não serve como proxy de URLs externos)

**Next.js** — `next.config.js`:

```js
module.exports = { images: { loader: 'custom', loaderFile: './image-loader.ts' } };
```

`image-loader.ts`:

```ts
export default function kibanLoader({ src, width, quality }: { src: string; width: number; quality?: number }) {
  if (!src.includes('/storage/v1/object/public/')) return src; // não é uma imagem do CMS
  return `${process.env.NEXT_PUBLIC_KIBAN_API_URL}/api/v1/img?src=${encodeURIComponent(src)}&w=${width}&q=${quality || 75}`;
}
```

A partir daí, todos os `<Image src={entry.content.image} … />` passam a ser otimizados.

## 2. Robôs de IA (robots.txt)

Duas escolhas independentes por cliente:

| Opção | Robôs | Bloquear significa |
|---|---|---|
| Aparecer nas respostas de assistentes de IA | OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, Claude-SearchBot, Claude-User | O site deixa de ser citado nessas respostas |
| Uso para treino de modelos | GPTBot, ClaudeBot, CCBot, Google-Extended, Applebot-Extended, Meta-ExternalAgent, Bytespider | O conteúdo não é usado para treinar modelos (não afeta o Google nem as respostas de IA) |

O Google (incluindo os AI Overviews) usa o Googlebot normal, que nunca é bloqueado aqui.

`GET /api/v1/seo/robots.txt` (público) junta as regras de SEO, as regras de IA e a linha `Sitemap:`.

## 3. llms.txt

`GET /api/v1/seo/llms.txt` (público) — resumo do site num formato pensado para modelos de
IA ([llmstxt.org](https://llmstxt.org)): nome, descrição, contactos e as páginas
publicadas por coleção (até 50 por coleção). É uma proposta recente, ainda não
um padrão garantido, mas o custo é nulo.

## 4. Dados estruturados (JSON-LD)

- `GET /api/v1/seo/jsonld` — o negócio (tipo escolhido em IA & Performance,
  nome, logótipo, contactos, morada, redes sociais) e o website. Pôr uma vez no layout.
- `GET /api/v1/entries/:collection/:slug?jsonld=1` — o conteúdo vem com
  `meta.jsonld` para essa entrada.

Tipos detetados automaticamente pela coleção e pelos campos:

| Coleção / campos | Tipo schema.org |
|---|---|
| tours, passeios, experiências, atividades | `TouristTrip` (com preço e ponto de encontro) |
| eventos, agenda, ou campo `start_date` | `Event` |
| produtos, loja | `Product` |
| faq, perguntas (campo `faqs: [{question, answer}]`) | `FAQPage` |
| blog, notícias, artigos | `BlogPosting` |
| outros | `WebPage` |

Para forçar um tipo numa coleção: `collection.settings.jsonld_type`
(`TouristTrip`, `Event`, `Product`, `FAQPage`, `BlogPosting`, `WebPage`).

## 5. Rotas no site (Next.js App Router)

`robots.txt`, `sitemap.xml` e `llms.txt` são públicos (não precisam de key), mas
como todos os clientes partilham o domínio da API, o site tem de os servir no
seu próprio domínio, pedindo-os com o cabeçalho `X-Tenant`:

```ts
// lib/kiban.ts
const KIBAN = process.env.NEXT_PUBLIC_KIBAN_API_URL!;
const headers = { Authorization: `Bearer ${process.env.KIBAN_API_KEY}`, 'X-Tenant': process.env.KIBAN_TENANT! };
export const kiban = (path: string) => fetch(`${KIBAN}/api/v1${path}`, { headers, next: { revalidate: 600 } });

// app/robots.txt/route.ts
import { kiban } from '@/lib/kiban';
export async function GET() {
  const r = await kiban('/seo/robots.txt');
  return new Response(await r.text(), { headers: { 'Content-Type': 'text/plain' } });
}

// app/llms.txt/route.ts  — igual, com '/seo/llms.txt'
// app/sitemap.xml/route.ts — igual, com '/seo/sitemap.xml' e Content-Type application/xml
```

## Requisitos

- **Settings → Geral → URL do site** preenchido (sitemap, llms.txt e JSON-LD usam-no)
- Permalinks (Settings → Permalinks) iguais às rotas reais do site
