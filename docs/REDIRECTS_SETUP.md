# kibanCMS — Redirects Manager

> Addon para gerir regras de redirect 301/302 diretamente no CMS.
> Essencial para migracoes de site, preservar SEO, e corrigir links partidos.

---

## Para que serve

Quando mudas o URL de uma pagina (ex: `/servicos` passa a `/services`),
os motores de busca e bookmarks antigos continuam a apontar para o URL antigo.
Um redirect 301 diz ao browser e ao Google: "esta pagina mudou para aqui".

Sem redirects:
- Links partidos (404)
- Perda de ranking SEO
- Ma experiencia do utilizador

Com este addon, o cliente gere tudo pelo admin do CMS — sem tocar no servidor.

---

## Arquitetura

```
Visitante acede /old-page
         ↓
Frontend chama GET /api/v1/redirects/resolve?path=/old-page
         ↓
API procura na collection "redirects" uma regra ativa para esse path
         ↓
Se encontra → retorna { from, to, type: "301" }
         → Frontend faz redirect para /new-page
         → Hit count incrementado automaticamente
         ↓
Se nao encontra → 404 (sem redirect)
```

---

## Passo 1: Instalar o addon

1. Abre o admin do CMS
2. Vai a **Extensoes > Redirects Manager > Install**
3. Cria a collection `redirects`

---

## Passo 2: Criar regras de redirect

1. Vai a **Conteudo > Redirects**
2. Cria uma nova entry para cada redirect:

| Campo | Valor | Descricao |
|-------|-------|-----------|
| **Title** | Servicos antigo → novo | Titulo descritivo |
| **Slug** | `servicos-redirect` | Identificador unico |
| **from_path** | `/servicos` | URL antigo (sem dominio) |
| **to_path** | `/services` | URL novo (sem dominio, ou URL completo) |
| **type** | `301` | 301 = permanente, 302 = temporario |
| **is_active** | `true` | Desativar sem apagar |
| **notes** | `Migracao PT→EN` | Nota interna (opcional) |
| **Status** | Published | So regras publicadas funcionam |

### Quando usar 301 vs 302

| Tipo | Quando usar | Efeito SEO |
|------|-------------|------------|
| **301** (permanente) | Pagina mudou definitivamente | Google transfere o ranking para o novo URL |
| **302** (temporario) | Redirect temporario (manutencao, A/B test) | Google mantem o ranking no URL antigo |

**Regra geral:** Usa sempre 301, a menos que o redirect seja temporario.

---

## Passo 3: Integrar no frontend

### Next.js (middleware)

```typescript
// middleware.ts (raiz do projeto Next.js)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const KIBAN_API = process.env.NEXT_PUBLIC_KIBAN_API_URL || 'https://kiban.pt';

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Skip static files and API routes
  if (path.startsWith('/_next') || path.startsWith('/api') || path.includes('.')) {
    return NextResponse.next();
  }

  try {
    const res = await fetch(
      `${KIBAN_API}/api/v1/redirects/resolve?path=${encodeURIComponent(path)}`,
      { next: { revalidate: 300 } } // cache 5 min
    );

    if (res.ok) {
      const { data } = await res.json();
      if (data?.to) {
        const redirectUrl = data.to.startsWith('http')
          ? data.to
          : new URL(data.to, request.url).toString();

        return NextResponse.redirect(redirectUrl, data.permanent ? 308 : 307);
      }
    }
  } catch {
    // Redirect service down — continue normally
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

### Site estatico (JavaScript)

```html
<script>
  // Correr no inicio de cada pagina (antes do conteudo carregar)
  (async function() {
    const path = window.location.pathname;
    try {
      const res = await fetch(
        `https://kiban.pt/api/v1/redirects/resolve?path=${encodeURIComponent(path)}`
      );
      if (res.ok) {
        const { data } = await res.json();
        if (data?.to) {
          window.location.replace(data.to.startsWith('http') ? data.to : data.to);
        }
      }
    } catch {}
  })();
</script>
```

### Nginx / servidor (alternativa server-side)

Se preferires fazer redirect no servidor sem JavaScript:

```bash
# Cron job que gera regras nginx a partir do CMS (correr a cada 5 min)
curl -s "https://kiban.pt/api/v1/entries/redirects?status=published&limit=500" \
  -H "Authorization: Bearer kiban_live_xxx" | \
  jq -r '.data[] | "rewrite ^" + .content.from_path + "$ " + .content.to_path + " permanent;"' \
  > /etc/nginx/conf.d/redirects.conf

nginx -s reload
```

---

## API Endpoint

| Rota | Metodo | Auth | Descricao |
|------|--------|------|-----------|
| `/api/v1/redirects/resolve?path=/x` | GET | Nenhuma (publico) | Resolver redirect para um path |

**Request:**
```
GET /api/v1/redirects/resolve?path=/servicos
```

**Resposta (encontrou):**
```json
{
  "data": {
    "from": "/servicos",
    "to": "/services",
    "type": "301",
    "permanent": true
  }
}
```

**Resposta (nao encontrou):**
```json
{
  "data": null,
  "message": "No redirect found"
}
```

---

## Funcionalidades

| Feature | Estado |
|---------|--------|
| Regras 301/302 geridas no admin | Funcional |
| Endpoint publico sem auth | Funcional |
| Toggle is_active (desativar sem apagar) | Funcional |
| Hit count (conta acessos por regra) | Funcional |
| Query direta por path (sem full table scan) | Funcional |
| Notas internas por regra | Funcional |

---

## Exemplos de uso

### Migracao de site (PT → EN)

| from_path | to_path | type |
|-----------|---------|------|
| `/sobre` | `/about` | 301 |
| `/servicos` | `/services` | 301 |
| `/contacto` | `/contact` | 301 |
| `/portfolio` | `/work` | 301 |

### Paginas removidas → homepage

| from_path | to_path | type |
|-----------|---------|------|
| `/promo-verao` | `/` | 301 |
| `/evento-2025` | `/` | 301 |

### Redirect para URL externo

| from_path | to_path | type |
|-----------|---------|------|
| `/loja` | `https://loja.solfil.pt` | 302 |
| `/booking` | `https://calendly.com/solfil` | 302 |

---

## Troubleshooting

### Redirect nao funciona
1. A entry tem **Status: Published**?
2. O campo **is_active** esta `true`?
3. O **from_path** corresponde exatamente (case-sensitive)?
4. O frontend esta a chamar a API de redirects?

### Performance com muitos redirects
A API faz query direta por `from_path` no PostgreSQL — nao carrega tudo em memoria.
Funciona bem com centenas de regras. Para milhares, considerar cache no frontend.
