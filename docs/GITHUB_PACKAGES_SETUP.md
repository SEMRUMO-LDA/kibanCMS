# 📦 Guia Completo: Publicar Kiban CMS no GitHub Packages

> **Última atualização:** Abril 2026
> **Autor:** Kiban Agency
> **Tempo estimado:** 15-20 minutos

---

## 📋 Índice

1. [O que é GitHub Packages?](#o-que-é-github-packages)
2. [Pré-requisitos](#pré-requisitos)
3. [Passo 1: Preparar o Repositório GitHub](#passo-1-preparar-o-repositório-github)
4. [Passo 2: Configurar o Package](#passo-2-configurar-o-package)
5. [Passo 3: Criar GitHub Token](#passo-3-criar-github-token)
6. [Passo 4: Autenticar Localmente](#passo-4-autenticar-localmente)
7. [Passo 5: Publicar o Package](#passo-5-publicar-o-package)
8. [Passo 6: Instalar em Projetos](#passo-6-instalar-em-projetos)
9. [Troubleshooting](#troubleshooting)

---

## O que é GitHub Packages?

GitHub Packages é um **registry NPM privado gratuito** hospedado pelo GitHub que permite:

- ✅ Publicar packages NPM privados (grátis!)
- ✅ Controlar quem tem acesso (por utilizador ou organização)
- ✅ Versionamento automático integrado com Git
- ✅ Sem custos de servidor
- ✅ CDN global incluído
- ✅ Integração perfeita com GitHub Actions (CI/CD)

**Alternativa:** Pagar ~$10-50/mês por registries privados ou gerir o teu próprio servidor.

---

## Pré-requisitos

Antes de começar, certifica-te que tens:

- [ ] Conta GitHub (grátis)
- [ ] Git instalado localmente
- [ ] Node.js >= 18
- [ ] pnpm instalado (`npm install -g pnpm`)
- [ ] Kiban CMS clonado localmente

---

## Passo 1: Preparar o Repositório GitHub

### 1.1 Criar Repositório no GitHub

1. Vai a https://github.com/new
2. Preenche:
   - **Repository name:** `kiban-cms`
   - **Description:** "Headless CMS built with React, TypeScript, and Supabase"
   - **Visibility:** 🔒 **Private** (importante!)
3. **NÃO** inicializes com README (já tens código local)
4. Clica em **"Create repository"**

### 1.2 Conectar Repositório Local ao GitHub

```bash
# Navega para o Kiban CMS
cd /Users/tiagopacheco/Desktop/KIBAN\ CMS

# Inicializa Git (se ainda não estiver)
git init

# Adiciona remote do GitHub (SUBSTITUI 'teu-username' pelo teu username!)
git remote add origin https://github.com/teu-username/kiban-cms.git

# Verifica se ficou correto
git remote -v
# Deve mostrar:
# origin  https://github.com/teu-username/kiban-cms.git (fetch)
# origin  https://github.com/teu-username/kiban-cms.git (push)
```

### 1.3 Criar .gitignore (se não existir)

```bash
# Cria ou edita .gitignore
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
.pnpm-store/

# Build outputs
dist/
build/
.next/
out/

# Environment files
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
pnpm-debug.log*

# Cache
.cache/
.vite/
EOF
```

### 1.4 Primeiro Commit e Push

```bash
# Adiciona todos os ficheiros
git add .

# Cria o commit inicial
git commit -m "Initial commit: Kiban CMS v1.0.0"

# Envia para o GitHub
git branch -M main
git push -u origin main
```

✅ **Checkpoint:** O teu código deve estar agora no GitHub em modo privado!

---

## Passo 2: Configurar o Package

### 2.1 Atualizar package.json do @kiban/client

Edita: `packages/kiban-client/package.json`

```json
{
  "name": "@teu-username/kiban-client",
  "version": "1.0.0",
  "description": "Official JavaScript/TypeScript client for KibanCMS",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/types.d.ts",
      "require": "./dist/index.js",
      "import": "./dist/index.mjs"
    },
    "./react": {
      "types": "./dist/react.d.ts",
      "require": "./dist/react.js",
      "import": "./dist/react.mjs"
    }
  },
  "files": [
    "dist"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/teu-username/kiban-cms.git",
    "directory": "packages/kiban-client"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com",
    "access": "restricted"
  },
  "scripts": {
    "build": "tsup src/index.ts src/react.ts --format cjs,esm --dts --clean",
    "dev": "tsup src/index.ts src/react.ts --format cjs,esm --dts --watch",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "pnpm build"
  },
  "keywords": [
    "cms",
    "headless-cms",
    "kiban",
    "content-management",
    "api-client"
  ],
  "author": "Kiban Agency",
  "license": "MIT",
  "peerDependencies": {
    "react": ">=17.0.0"
  },
  "peerDependenciesMeta": {
    "react": {
      "optional": true
    }
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "react": "^18.2.0",
    "tsup": "^8.0.0",
    "typescript": "^5.3.0"
  }
}
```

**🚨 IMPORTANTE:** Substitui `teu-username` pelo teu username do GitHub!

### 2.2 Verificar se está tudo correto

```bash
cd packages/kiban-client

# Limpa e reconstrói
rm -rf dist
pnpm install
pnpm build

# Verifica se a build funcionou
ls -la dist/
# Deves ver: index.js, index.mjs, types.d.ts, etc.
```

✅ **Checkpoint:** O package está pronto para ser publicado!

---

## Passo 3: Criar GitHub Token

### 3.1 Aceder à Página de Tokens

1. Vai a: https://github.com/settings/tokens
2. Clica em **"Generate new token"** → **"Generate new token (classic)"**

### 3.2 Configurar Permissões

Preenche:
- **Note:** `Kiban CMS - NPM Registry` (nome descritivo)
- **Expiration:** `No expiration` (ou 90 days se preferires renovar)
- **Select scopes:** Marca estas checkboxes:
  - ✅ `write:packages` - Upload packages
  - ✅ `read:packages` - Download packages
  - ✅ `delete:packages` - Delete packages (opcional)
  - ✅ `repo` - Full control of private repositories (se o repo for privado)

### 3.3 Gerar e Guardar Token

1. Clica em **"Generate token"** no fundo da página
2. **🚨 ATENÇÃO:** Copia o token IMEDIATAMENTE!
   - Parece algo como: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - **Nunca mais vais ver este token!**
3. Guarda-o num local seguro (Password Manager recomendado)

📝 **GUARDA ESTE TOKEN!** Vais precisar dele nos próximos passos.

---

## Passo 4: Autenticar Localmente

### 4.1 Criar ficheiro .npmrc local

```bash
# Navega para a pasta do package
cd /Users/tiagopacheco/Desktop/KIBAN\ CMS/packages/kiban-client

# Cria .npmrc
cat > .npmrc << 'EOF'
@teu-username:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
EOF
```

**🚨 SUBSTITUI `teu-username` pelo teu username GitHub!**

### 4.2 Adicionar .npmrc ao .gitignore

```bash
# Na raiz do projeto
cd /Users/tiagopacheco/Desktop/KIBAN\ CMS

# Adiciona ao .gitignore (se não existir)
echo "**/.npmrc" >> .gitignore
echo ".npmrc" >> .gitignore
```

**🔒 IMPORTANTE:** NUNCA faças commit de tokens!

### 4.3 Configurar Token como variável de ambiente

**Opção A: Temporariamente (válido para a sessão atual)**
```bash
export NPM_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Opção B: Permanentemente (recomendado)**

```bash
# Adiciona ao teu shell config
echo 'export NPM_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' >> ~/.zshrc
# ou se usas bash:
# echo 'export NPM_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' >> ~/.bashrc

# Recarrega o shell
source ~/.zshrc  # ou source ~/.bashrc
```

### 4.4 Verificar autenticação

```bash
# Testa se está autenticado
npm whoami --registry=https://npm.pkg.github.com

# Deve mostrar o teu username do GitHub
```

✅ **Checkpoint:** Estás autenticado no GitHub Packages!

---

## Passo 5: Publicar o Package

### 5.1 Build Final

```bash
cd /Users/tiagopacheco/Desktop/KIBAN\ CMS/packages/kiban-client

# Limpa e reconstrói
rm -rf dist
pnpm build

# Verifica os ficheiros
ls -la dist/
```

### 5.2 Publicar!

```bash
# Publica para o GitHub Packages
pnpm publish

# Ou se preferires ver mais detalhes:
pnpm publish --verbose
```

**Possíveis outputs:**

✅ **Sucesso:**
```
npm notice Publishing to https://npm.pkg.github.com
+ @teu-username/kiban-client@1.0.0
```

❌ **Erro comum:** "You must sign in to publish packages"
- **Solução:** Verifica se o `NPM_TOKEN` está correto (passo 4.3)

❌ **Erro:** "Package already exists"
- **Solução:** Incrementa a versão no package.json (ex: 1.0.0 → 1.0.1)

### 5.3 Verificar no GitHub

1. Vai ao teu repositório: `https://github.com/teu-username/kiban-cms`
2. Clica no tab **"Packages"** (lado direito)
3. Deves ver: `@teu-username/kiban-client`

🎉 **PARABÉNS!** O teu package está publicado!

---

## Passo 6: Instalar em Projetos

Agora vamos configurar o projeto **Lunes** (ou qualquer outro) para usar o package do GitHub Packages.

### 6.1 Criar .npmrc no Projeto Lunes

```bash
cd /Users/tiagopacheco/Documents/GitHub/lunes

# Cria .npmrc
cat > .npmrc << 'EOF'
@teu-username:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
EOF
```

**🚨 SUBSTITUI `teu-username`!**

### 6.2 Remover a Dependência Local

```bash
# Remove o package local
pnpm remove @kiban/client

# Limpa node_modules
rm -rf node_modules/@kiban
```

### 6.3 Instalar do GitHub Packages

```bash
# Instala a versão do GitHub Packages
pnpm add @teu-username/kiban-client

# Ou com versão específica:
pnpm add @teu-username/kiban-client@1.0.0
```

### 6.4 Atualizar Imports no Código

**Antes:**
```typescript
import { KibanClient } from '@kiban/client';
```

**Depois:**
```typescript
import { KibanClient } from '@teu-username/kiban-client';
```

**Atualizar ficheiros:**
- `src/services/kibanClient.ts`
- `src/hooks/useKiban.ts`
- Qualquer outro ficheiro que importe

### 6.5 Testar

```bash
# Reinicia o dev server
pnpm dev

# Abre http://localhost:3000
# Deve funcionar igual!
```

✅ **Checkpoint:** Projeto Lunes está a usar o package do GitHub Packages!

---

## 📚 Comandos Úteis

### Publicar Nova Versão

```bash
cd packages/kiban-client

# 1. Atualiza versão (escolhe um)
npm version patch  # 1.0.0 → 1.0.1 (bug fixes)
npm version minor  # 1.0.0 → 1.1.0 (novas features)
npm version major  # 1.0.0 → 2.0.0 (breaking changes)

# 2. Build e publica
pnpm build
pnpm publish

# 3. Commit e push da nova versão
git add package.json
git commit -m "chore: release v1.0.1"
git tag v1.0.1
git push origin main --tags
```

### Atualizar em Projetos

```bash
cd /caminho/do/projeto

# Ver versão atual
pnpm list @teu-username/kiban-client

# Atualizar para latest
pnpm update @teu-username/kiban-client

# Ou instalar versão específica
pnpm add @teu-username/kiban-client@1.0.1
```

### Ver Packages Publicados

```bash
# Lista todas as versões publicadas
npm view @teu-username/kiban-client versions

# Ver info do package
npm view @teu-username/kiban-client
```

---

## 🔒 Segurança: Dar Acesso a Colaboradores

### Para dar acesso a outros developers:

1. Vai ao repositório GitHub
2. **Settings** → **Packages**
3. Clica no package `@teu-username/kiban-client`
4. **Package settings** → **Manage Actions access**
5. Adiciona colaboradores

**Ou por organização:**
- Se criares uma GitHub Organization (ex: `kiban-agency`)
- Todos os membros da org têm acesso automaticamente

---

## ⚠️ Troubleshooting

Ver ficheiro: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

---

## 📖 Recursos Adicionais

- [GitHub Packages Documentation](https://docs.github.com/en/packages)
- [Semantic Versioning](https://semver.org/)
- [npm Documentation](https://docs.npmjs.com/)

---

## ✅ Checklist Final

- [ ] Repositório GitHub criado (privado)
- [ ] Código pushed para o GitHub
- [ ] package.json configurado com `publishConfig`
- [ ] GitHub Token criado e guardado
- [ ] Autenticação local configurada (NPM_TOKEN)
- [ ] Package publicado com sucesso
- [ ] Verificado no GitHub Packages
- [ ] .npmrc criado nos projetos cliente
- [ ] Imports atualizados
- [ ] Projeto testado e funcionando

🎉 **SUCESSO!** O Kiban CMS está agora disponível via GitHub Packages!

---

**Dúvidas?** Consulta o [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) ou abre uma issue.
