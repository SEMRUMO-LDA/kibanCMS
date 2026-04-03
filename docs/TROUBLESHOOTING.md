# 🔧 Troubleshooting: GitHub Packages

Soluções para problemas comuns ao usar GitHub Packages com o Kiban CMS.

---

## 🚫 Erro: "You must sign in to publish packages"

### Sintoma
```bash
pnpm publish
npm ERR! code ENEEDAUTH
npm ERR! need auth This command requires you to be logged in.
```

### Solução

**1. Verifica se o token existe:**
```bash
echo $NPM_TOKEN
# Deve mostrar: ghp_xxxxxxxxxxxx...
# Se estiver vazio, configura:
export NPM_TOKEN=ghp_seu_token_aqui
```

**2. Verifica o .npmrc:**
```bash
cat packages/kiban-client/.npmrc
# Deve ter:
# @teu-username:registry=https://npm.pkg.github.com
# //npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

**3. Testa a autenticação:**
```bash
npm whoami --registry=https://npm.pkg.github.com
# Deve mostrar o teu username
```

---

## 🚫 Erro: "404 Not Found - Package not found"

### Sintoma
```bash
pnpm add @teu-username/kiban-client
ERR_PNPM_FETCH_404  GET https://npm.pkg.github.com/@teu-username%2Fkiban-client: Not Found - 404
```

### Causas e Soluções

**Causa 1: Package ainda não foi publicado**
```bash
# Verifica se o package existe no GitHub
# Vai a: https://github.com/teu-username?tab=packages
```

**Causa 2: Username errado no .npmrc**
```bash
# Verifica o .npmrc do projeto
cat .npmrc
# Deve ter o MESMO username que usaste ao publicar
```

**Causa 3: Falta autenticação**
```bash
# Verifica se o NPM_TOKEN está configurado
echo $NPM_TOKEN

# Reconfigura se necessário
export NPM_TOKEN=ghp_seu_token_aqui
```

---

## 🚫 Erro: "403 Forbidden"

### Sintoma
```bash
npm ERR! code E403
npm ERR! 403 Forbidden - GET https://npm.pkg.github.com/@teu-username/kiban-client
```

### Soluções

**1. Token expirado ou inválido**
```bash
# Cria um novo token em:
# https://github.com/settings/tokens

# Atualiza a variável
export NPM_TOKEN=ghp_novo_token_aqui
```

**2. Permissões insuficientes**
- Vai a https://github.com/settings/tokens
- Edita o token
- Certifica-te que tem:
  - ✅ `write:packages`
  - ✅ `read:packages`
  - ✅ `repo` (se o repositório for privado)

**3. Não tens acesso ao package**
- Pede ao owner do repositório para te dar acesso
- Ou usa uma conta que tenha permissões

---

## 🚫 Erro: "Package already exists"

### Sintoma
```bash
pnpm publish
npm ERR! code E403
npm ERR! 403 403 Forbidden - PUT https://npm.pkg.github.com/@teu-username/kiban-client
npm ERR! 403 You cannot publish over the previously published versions: 1.0.0.
```

### Solução

**Incrementa a versão:**
```bash
cd packages/kiban-client

# Escolhe uma:
npm version patch  # 1.0.0 → 1.0.1
npm version minor  # 1.0.0 → 1.1.0
npm version major  # 1.0.0 → 2.0.0

# Publica novamente
pnpm build
pnpm publish
```

---

## 🚫 Erro: "ENOENT: no such file or directory"

### Sintoma
```bash
pnpm publish
npm ERR! enoent ENOENT: no such file or directory, open '/path/to/dist/index.js'
```

### Solução

**Build não foi feito ou falhou:**
```bash
cd packages/kiban-client

# Limpa e reconstrói
rm -rf dist
pnpm install
pnpm build

# Verifica se criou os ficheiros
ls -la dist/
# Deve mostrar: index.js, index.mjs, types.d.ts, etc.

# Publica
pnpm publish
```

---

## 🚫 Erro: "Cannot read properties of undefined"

### Sintoma no Browser
```
Uncaught TypeError: Cannot read properties of undefined (reading 'getEntries')
```

### Solução

**1. Verifica o import:**
```typescript
// ❌ Errado (import antigo)
import { KibanClient } from '@kiban/client';

// ✅ Correto (novo import)
import { KibanClient } from '@teu-username/kiban-client';
```

**2. Reinstala o package:**
```bash
rm -rf node_modules/@teu-username
pnpm install
```

**3. Limpa cache do Vite:**
```bash
rm -rf node_modules/.vite
pnpm dev
```

---

## 🚫 Erro: "Failed to resolve entry for package"

### Sintoma
```
Failed to resolve entry for package "@teu-username/kiban-client".
The package may have incorrect main/module/exports specified in its package.json.
```

### Solução

**1. Verifica o package.json do kiban-client:**
```json
{
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/types.d.ts",
      "require": "./dist/index.js",
      "import": "./dist/index.mjs"
    }
  }
}
```

**2. Reconstrói e republica:**
```bash
cd packages/kiban-client
rm -rf dist
pnpm build
npm version patch
pnpm publish
```

**3. Atualiza no projeto:**
```bash
cd /caminho/do/projeto
pnpm update @teu-username/kiban-client
```

---

## 🚫 Package não aparece no GitHub

### Sintoma
- `pnpm publish` teve sucesso
- Mas não vês o package em `https://github.com/teu-username?tab=packages`

### Soluções

**1. Espera alguns minutos**
- GitHub pode demorar 1-2 minutos a indexar

**2. Verifica o nome do package**
```bash
# O package DEVE começar com @username/
# Verifica no package.json:
cat packages/kiban-client/package.json | grep name
# Deve mostrar: "name": "@teu-username/kiban-client"
```

**3. Verifica se o repositório está privado**
- Packages de repos privados só aparecem se tiveres acesso
- Faz login no GitHub e refresca a página

---

## 🚫 Colaborador não consegue instalar

### Sintoma
Colaborador tenta instalar e recebe 404 ou 403

### Soluções

**1. Dar acesso ao repositório:**
```
1. Vai ao repo: https://github.com/teu-username/kiban-cms
2. Settings → Collaborators
3. Add people → Adiciona o colaborador
```

**2. Colaborador precisa criar token próprio:**
```bash
# Colaborador deve:
# 1. Criar token em: https://github.com/settings/tokens
# 2. Scopes: read:packages, write:packages (opcional)
# 3. Configurar no terminal:
export NPM_TOKEN=ghp_token_do_colaborador
```

**3. Colaborador precisa criar .npmrc:**
```bash
# No projeto do colaborador
cat > .npmrc << 'EOF'
@teu-username:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
EOF
```

---

## 🚫 CI/CD: GitHub Actions falha

### Sintoma
GitHub Actions workflow falha ao tentar instalar o package

### Solução

**Adiciona o GITHUB_TOKEN ao workflow:**

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          registry-url: 'https://npm.pkg.github.com'

      - name: Install dependencies
        run: pnpm install
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Run tests
        run: pnpm test
```

---

## 🚫 Token aparece no Git History

### Sintoma
🚨 **PERIGO!** Token commitado acidentalmente

### Solução URGENTE

**1. Revoga o token IMEDIATAMENTE:**
```
1. Vai a: https://github.com/settings/tokens
2. Encontra o token comprometido
3. Clica "Delete"
4. Cria um novo token
```

**2. Remove do histórico Git:**
```bash
# Se foi o último commit:
git reset HEAD~1
git add .gitignore .npmrc
# (adiciona .npmrc ao .gitignore se não estiver)
git commit -m "fix: add .npmrc to gitignore"

# Se foi há mais tempo:
# Usa git filter-branch ou BFG Repo-Cleaner
# Documentação: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
```

**3. Force push (CUIDADO!):**
```bash
git push origin main --force
```

**4. Atualiza o novo token:**
```bash
export NPM_TOKEN=ghp_novo_token_aqui
```

---

## 🔍 Comandos de Diagnóstico

### Verificar configuração
```bash
# Ver config NPM
npm config list

# Ver registry do scope
npm config get @teu-username:registry

# Ver token (CUIDADO: não partilhes!)
echo $NPM_TOKEN
```

### Verificar package
```bash
# Ver versões disponíveis
npm view @teu-username/kiban-client versions

# Ver info completa
npm view @teu-username/kiban-client

# Descarregar sem instalar (debug)
npm pack @teu-username/kiban-client
tar -xzf teu-username-kiban-client-1.0.0.tgz
ls -la package/
```

### Limpar cache
```bash
# Limpar cache NPM
npm cache clean --force

# Limpar cache pnpm
pnpm store prune

# Limpar node_modules
rm -rf node_modules
rm -rf node_modules/.pnpm
pnpm install
```

---

## 📞 Precisa de Mais Ajuda?

**Se o teu problema não está aqui:**

1. **Verifica os logs completos:**
   ```bash
   pnpm publish --verbose
   ```

2. **Procura no GitHub:**
   - [GitHub Packages Issues](https://github.com/orgs/community/discussions/categories/packages)

3. **Documentação oficial:**
   - [GitHub Packages Docs](https://docs.github.com/en/packages)

4. **Contacta a equipa:**
   - Abre uma issue no repositório Kiban CMS
   - Email: dev@kiban.pt

---

## ✅ Checklist de Diagnóstico Rápido

Quando algo não funciona, verifica na ordem:

- [ ] `NPM_TOKEN` está definido? (`echo $NPM_TOKEN`)
- [ ] `.npmrc` existe e está correto?
- [ ] Username no package.json é igual ao GitHub?
- [ ] Package foi publicado? (verifica no GitHub)
- [ ] Token tem permissões corretas?
- [ ] Build do package funcionou? (`ls dist/`)
- [ ] Cache limpo? (`rm -rf node_modules/.vite`)

---

**Última atualização:** Abril 2026
