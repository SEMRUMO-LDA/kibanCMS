# ⚡ Quick Reference: Kiban CMS + GitHub Packages

Comandos rápidos para uso diário. Guarda esta página nos favoritos!

---

## 🚀 Publicar Nova Versão

```bash
cd /Users/tiagopacheco/Desktop/KIBAN\ CMS/packages/kiban-client

# 1. Atualiza versão
npm version patch  # bug fixes: 1.0.0 → 1.0.1
npm version minor  # new features: 1.0.0 → 1.1.0
npm version major  # breaking changes: 1.0.0 → 2.0.0

# 2. Build e publica
pnpm build && pnpm publish

# 3. Commit e tag
git add package.json
git commit -m "chore: release v1.0.1"
git push origin main --tags
```

---

## 📦 Instalar em Novo Projeto

```bash
cd /caminho/do/projeto

# 1. Cria .npmrc
cat > .npmrc << 'EOF'
@teu-username:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
EOF

# 2. Instala
pnpm add @teu-username/kiban-client

# 3. Usa no código
# src/services/kibanClient.ts
import { KibanClient } from '@teu-username/kiban-client';

const kiban = new KibanClient({
  url: process.env.VITE_KIBAN_API_URL,
  apiKey: process.env.VITE_KIBAN_API_KEY,
});
```

---

## 🔄 Atualizar Package em Projeto

```bash
cd /caminho/do/projeto

# Ver versão atual
pnpm list @teu-username/kiban-client

# Atualizar para latest
pnpm update @teu-username/kiban-client

# Ou versão específica
pnpm add @teu-username/kiban-client@1.0.5
```

---

## 🔑 Configurar Token (One-time Setup)

```bash
# 1. Cria token em:
# https://github.com/settings/tokens
# Scopes: write:packages, read:packages, repo

# 2. Adiciona ao shell config
echo 'export NPM_TOKEN=ghp_SEU_TOKEN_AQUI' >> ~/.zshrc
source ~/.zshrc

# 3. Verifica
echo $NPM_TOKEN
npm whoami --registry=https://npm.pkg.github.com
```

---

## 🧹 Limpar Cache

```bash
# Limpar tudo
rm -rf node_modules
rm -rf node_modules/.vite
rm -rf node_modules/.pnpm
pnpm install

# Só cache Vite
rm -rf node_modules/.vite
```

---

## 🔍 Verificar Package

```bash
# Ver versões publicadas
npm view @teu-username/kiban-client versions

# Info do package
npm view @teu-username/kiban-client

# Baixar e inspecionar
npm pack @teu-username/kiban-client
tar -xzf *.tgz
ls -la package/
```

---

## 🎯 Comandos de Desenvolvimento

### Kiban CMS

```bash
cd /Users/tiagopacheco/Desktop/KIBAN\ CMS

# Admin UI (http://localhost:5173)
pnpm dev:admin

# API Server (http://localhost:5001)
pnpm dev:api

# Ou ambos
pnpm dev

# Build do client
cd packages/kiban-client
pnpm build
```

### Projeto Cliente (ex: Lunes)

```bash
cd /Users/tiagopacheco/Documents/GitHub/lunes

# Dev server
pnpm dev

# Build para produção
pnpm build

# Preview da build
pnpm preview
```

---

## 🐛 Troubleshooting Rápido

### "You must sign in"
```bash
export NPM_TOKEN=ghp_SEU_TOKEN
npm whoami --registry=https://npm.pkg.github.com
```

### "404 Not Found"
```bash
# Verifica nome do package
cat packages/kiban-client/package.json | grep '"name"'

# Deve ser: "@teu-username/kiban-client"
```

### "403 Forbidden"
```bash
# Token expirou - cria novo
# https://github.com/settings/tokens
export NPM_TOKEN=ghp_NOVO_TOKEN
```

### Package não funciona após instalar
```bash
# Limpa e reinstala
rm -rf node_modules/@teu-username
rm -rf node_modules/.vite
pnpm install
pnpm dev
```

---

## 📊 Semantic Versioning

| Change Type | Version | Example | Quando usar |
|-------------|---------|---------|-------------|
| **PATCH** | x.x.**1** | 1.0.0 → 1.0.1 | Bug fixes |
| **MINOR** | x.**1**.x | 1.0.0 → 1.1.0 | Novas features (backward compatible) |
| **MAJOR** | **2**.x.x | 1.0.0 → 2.0.0 | Breaking changes |

---

## 🔗 Links Úteis

- **GitHub Packages:** https://github.com/teu-username?tab=packages
- **Criar Token:** https://github.com/settings/tokens
- **Repo Kiban:** https://github.com/teu-username/kiban-cms
- **Docs Completas:** [GITHUB_PACKAGES_SETUP.md](./GITHUB_PACKAGES_SETUP.md)

---

## 💾 Snippets Úteis

### .env Template
```env
# Kiban CMS Configuration
VITE_KIBAN_API_URL=http://localhost:5001
VITE_KIBAN_API_KEY=kiban_live_xxxxx
```

### .npmrc Template
```
@teu-username:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

### React Hook Example
```typescript
import { useKiban } from '@teu-username/kiban-client/react';

function MyComponent() {
  const { data, loading, error } = useKiban({
    collectionSlug: 'blog',
    filters: { status: 'published' }
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>{/* render data */}</div>;
}
```

---

**Guarda esta página!** É tudo o que precisas para o dia-a-dia.

**Última atualização:** Abril 2026
