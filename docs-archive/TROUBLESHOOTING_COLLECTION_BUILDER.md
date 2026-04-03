# Collection Builder - Troubleshooting Guide

## 🔴 Problema: "Error Loading Collections" / "Request timeout"

### Sintomas
- Página `/content` mostra erro vermelho
- Mensagem: "Request timeout. Please refresh the page"
- Collections não carregam
- Timeout após 5-10 segundos

### Causas Possíveis

#### 1. **Supabase Lento ou Offline** (mais comum)
O Supabase pode estar lento ou com problemas.

**Solução**:
```bash
# 1. Verifica se o Supabase está acessível
curl -I https://tzlpqzrhnifsclxegnfa.supabase.co

# 2. Testa a API diretamente no browser:
# Abre: https://tzlpqzrhnifsclxegnfa.supabase.co/rest/v1/
```

**Se estiver lento**:
- Aguarda 1-2 minutos
- Clica no botão "Retry" na página
- Ou recarrega com `Cmd+R`

#### 2. **Problemas de Autenticação**
O token JWT pode ter expirado.

**Solução**:
```bash
# No browser:
1. Abre DevTools (F12)
2. Application → Storage → Clear site data
3. Volta para /login
4. Faz login novamente
```

#### 3. **RLS Policies Incorrectas**
As Row Level Security policies podem estar a bloquear.

**Solução**:
```sql
-- No Supabase SQL Editor, verifica:
SELECT * FROM collections;

-- Se der erro, corre:
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Collections are viewable by authenticated users" ON collections;
CREATE POLICY "Collections are viewable by authenticated users"
  ON collections FOR SELECT
  TO authenticated
  USING (true);
```

#### 4. **User não tem Role Admin**
O user pode não ter role `admin` ou `super_admin`.

**Solução**:
```sql
-- No Supabase SQL Editor:
SELECT id, email, role FROM profiles;

-- Se role estiver NULL ou 'viewer', actualiza:
UPDATE profiles
SET role = 'super_admin'
WHERE email = 'tpacheco@aorubro.pt';
```

---

## 🔴 Problema: "user?.getSession is not a function"

### Sintomas
- Ao criar coleção, erro no submit
- Console mostra: `user?.getSession is not a function`

### Causa
Código estava a usar `user.getSession()` incorrectamente.

### Solução
✅ **JÁ CORRIGIDO** - Actualiza para usar `session.access_token` directamente.

Se ainda aparecer:
```bash
git pull origin main  # Ou recarrega os ficheiros
```

---

## 🔴 Problema: Botão "New Collection" não aparece

### Sintomas
- Página `/content` carrega normalmente
- Mas botão "New Collection" não aparece
- User está logado como admin

### Causa
User tem role `super_admin` mas código só verificava `admin`.

### Solução
✅ **JÁ CORRIGIDO** - Código agora aceita ambos `admin` e `super_admin`.

**Verifica no console**:
```javascript
// Abre DevTools → Console
// Na página /content, verifica:
console.log('Role:', window.__PROFILE_ROLE__);
```

---

## 🔴 Problema: API não responde (500/404)

### Sintomas
- Collection Builder submete mas dá erro 500 ou 404
- Console mostra: `Failed to fetch` ou `Network error`

### Causa
API não está a correr ou porta errada.

### Solução

#### Verifica se API está a correr:
```bash
lsof -i :5001
# Deve mostrar processo Node/tsx

curl http://localhost:5001/api/v1/collections
# Deve retornar JSON (não 404)
```

#### Se não estiver a correr:
```bash
cd /Users/tiagopacheco/Desktop/KIBAN\ CMS
pnpm dev:api
```

#### Se estiver noutra porta:
```bash
# Verifica .env do admin:
cat apps/admin/.env | grep VITE_API_URL

# Deve ser:
VITE_API_URL=http://localhost:5001
```

---

## 🔴 Problema: Erros de TypeScript ao desenvolver

### Sintomas
- VSCode mostra erros vermelhos
- `colors.red[600]` não existe
- `spacing[0.5]` dá erro

### Causa
Design tokens incompletos ou sintaxe inválida.

### Solução
✅ **JÁ CORRIGIDO** - Cores semânticas adicionadas, spacing corrigido.

**Se ainda houver erros**:
```bash
# Recompila TypeScript:
npx tsc --noEmit --project apps/admin/tsconfig.json

# Reinstala dependências:
cd apps/admin
rm -rf node_modules
pnpm install
```

---

## 📋 Checklist de Diagnóstico Rápido

Quando algo não funcionar, segue esta ordem:

### 1️⃣ **Verifica o Browser Console** (F12)
```
- Há erros vermelhos?
- Qual é a mensagem exacta?
- Há warnings amarelos?
```

### 2️⃣ **Verifica Auth State**
```javascript
// No console do browser:
localStorage.getItem('supabase.auth.token')
// Deve retornar um token JWT
```

### 3️⃣ **Testa Supabase Directamente**
```bash
# Curl no terminal:
curl -H "apikey: SEU_ANON_KEY" \
  https://tzlpqzrhnifsclxegnfa.supabase.co/rest/v1/collections
```

### 4️⃣ **Verifica Processos**
```bash
# Admin running?
lsof -i :5173

# API running?
lsof -i :5001

# Ambos devem mostrar processos Node
```

### 5️⃣ **Verifica Logs**
```bash
# Terminal onde corre `pnpm dev:admin`
# Deve mostrar: "Local: http://localhost:5173"

# Terminal onde corre `pnpm dev:api`
# Deve mostrar: "Server running on http://localhost:5001"
```

---

## 🚀 Reset Completo (Último Recurso)

Se nada funcionar, faz reset completo:

```bash
# 1. Para tudo
pkill -9 -f "tsx watch"
pkill -9 -f "vite"

# 2. Limpa node_modules
cd /Users/tiagopacheco/Desktop/KIBAN\ CMS
rm -rf node_modules apps/*/node_modules
pnpm install

# 3. Verifica .env files
cat apps/admin/.env
cat apps/api/.env
# Ambos devem ter SUPABASE_URL e keys

# 4. Reinicia serviços
# Terminal 1:
pnpm dev:api

# Terminal 2:
pnpm dev:admin

# 5. Logout/Login no admin
# Browser: vai para /login, faz logout, volta a logar
```

---

## 📞 Ainda com Problemas?

1. **Verifica os logs** - Terminal onde corre API/Admin
2. **Supabase Dashboard** - Logs → Real-time logs
3. **Network Tab** - Browser DevTools → Network (verifica requests falhados)

### Informação Útil para Debug:
```bash
# Copia este output:
echo "=== System Info ==="
node --version
pnpm --version
echo ""
echo "=== Running Processes ==="
lsof -i :5001
lsof -i :5173
echo ""
echo "=== Environment ==="
cat apps/admin/.env | grep -v "KEY"
```

---

**Última actualização**: 2026-04-02
**Versão Collection Builder**: 1.0
**Status**: Produção
