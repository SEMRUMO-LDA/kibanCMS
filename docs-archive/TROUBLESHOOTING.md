# 🔧 KibanCMS - Troubleshooting Guide

## Problema: "Não consigo ver informação no admin"

Se o admin dashboard não está mostrando dados, siga estes passos:

### 1. Verificar Conexão com Supabase

Execute o script de diagnóstico:

```bash
bash diagnose.sh
```

Isso vai verificar:
- ✅ Configuração do `.env`
- ✅ Conexão com Supabase
- ✅ Existência das tabelas
- ✅ Dados nas tabelas

---

### 2. Erro HTTP 401 - Credenciais Inválidas

Se você vê `Failed to connect to Supabase (HTTP 401)`, significa que há um problema com as suas credenciais.

**Solução:**

1. Vá ao [Supabase Dashboard](https://supabase.com/dashboard)
2. Selecione seu projeto
3. Vá em **Settings** (engrenagem) → **API**
4. Copie as credenciais corretas:

```
Project URL: https://xxxxx.supabase.co
anon public: eyJhbGciOiJIUzI1NiIsInR5c...
```

5. Atualize o arquivo `.env` na raiz do projeto:

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5c...
```

6. **IMPORTANTE**: Reinicie o servidor admin:

```bash
# Pare o servidor (Ctrl+C)
# Depois reinicie:
pnpm dev:admin
```

---

### 3. Tabelas Não Existem

Se o diagnóstico mostrar que as tabelas não existem, você precisa rodar as migrações.

**Solução:**

1. Vá ao [Supabase Dashboard](https://supabase.com/dashboard)
2. Clique em **SQL Editor** no menu lateral
3. Clique em **New Query**
4. Copie e cole **TODO** o conteúdo de cada arquivo de migração **NA ORDEM**:

```
1. database/migrations/001_initial_schema.sql
2. database/migrations/005_seed_data.sql
3. database/migrations/006_onboarding_manifesto.sql
4. database/migrations/007_api_keys.sql
5. database/migrations/009_webhooks.sql
```

5. Clique em **Run** (▶️) após colar cada arquivo
6. Aguarde a confirmação "Success"

**Dica**: Você pode rodar TODAS as migrações de uma vez copiando o conteúdo de:
```
database/migrations/RESET_AND_SEED.sql
```

---

### 4. RLS (Row Level Security) Bloqueando Acesso

Se as tabelas existem mas não aparecem dados, pode ser um problema de RLS.

**Verificar no Console do Browser:**

1. Abra o admin (http://localhost:5173)
2. Pressione **F12** para abrir o Developer Tools
3. Vá na aba **Console**
4. Procure por erros vermelhos

**Erros comuns:**

```
new row violates row-level security policy
```

**Solução:**

As políticas RLS estão nas migrações. Certifique-se de que rodou TODAS as migrações, especialmente a `001_initial_schema.sql` que contém as políticas.

---

### 5. Não Consigo Fazer Login

**Problema**: Página de login não funciona ou erro "Invalid credentials"

**Solução:**

Você precisa criar um usuário no Supabase primeiro!

#### Opção A: Criar via Dashboard (Recomendado)

1. Vá ao [Supabase Dashboard](https://supabase.com/dashboard)
2. Vá em **Authentication** → **Users**
3. Clique em **Add User** → **Create New User**
4. Preencha:
   - **Email**: seu-email@exemplo.com
   - **Password**: sua-senha-segura
   - **Auto Confirm User**: ✅ (marque esta opção!)
5. Clique em **Create User**

#### Opção B: Criar via SQL

1. Vá ao **SQL Editor** no Supabase
2. Execute:

```sql
-- Criar usuário no auth
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_sent_at,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@exemplo.com',  -- ← Seu email
  crypt('senha123', gen_salt('bf')),  -- ← Sua senha
  NOW(),
  NOW(),
  NOW(),
  NOW()
) RETURNING id;

-- Copie o UUID retornado e use no próximo comando:

-- Criar profile
INSERT INTO profiles (id, email, full_name, role, onboarding_completed)
VALUES (
  'cole-o-uuid-aqui',  -- ← Cole o UUID do comando anterior
  'admin@exemplo.com',
  'Admin User',
  'admin',
  true
);
```

---

### 6. Admin Carregando mas Sem Dados

Se o admin abre mas o dashboard mostra "0" em tudo:

**Isso é normal!** Você precisa criar conteúdo primeiro.

#### Passo 1: Verificar se tem Collections

1. Clique em **Content** no menu lateral
2. Se não aparecer nenhuma collection, você precisa rodar as seed migrations:
   - `database/migrations/005_seed_data.sql`
   - `database/migrations/006_onboarding_manifesto.sql`

#### Passo 2: Criar seu primeiro Entry

1. Clique em **Content** → Escolha uma collection (ex: Blog)
2. Clique em **New Entry**
3. Preencha os campos
4. Clique em **Save**

---

### 7. Erro "Loading kibanCMS..." Infinito

Se a página fica travada em "Loading kibanCMS...", há um problema de autenticação.

**Solução:**

1. Limpe o localStorage do browser:
   ```javascript
   // No Console do browser (F12 → Console):
   localStorage.clear()
   location.reload()
   ```

2. Faça login novamente

---

### 8. API Não Está Respondendo

Se o frontend admin funciona mas as requisições falham:

**Verificar se a API está rodando:**

```bash
# Verificar porta 5000
lsof -i :5000

# Se não estiver rodando:
pnpm dev:api
```

**Testar a API manualmente:**

```bash
curl http://localhost:5000/health
```

Deve retornar:
```json
{"status":"ok","timestamp":"..."}
```

---

### 9. Erros no Console do Browser

Abra o Developer Tools (F12) e procure por erros. Os erros mais comuns:

#### `Missing Supabase environment variables`

→ Seu `.env` não está configurado ou o servidor não foi reiniciado após configurar.

**Solução:** Reinicie o admin:
```bash
# Ctrl+C para parar
pnpm dev:admin
```

#### `Failed to fetch` ou `Network error`

→ O admin não consegue se conectar ao Supabase.

**Solução:**
1. Verifique sua conexão de internet
2. Verifique se as credenciais no `.env` estão corretas
3. Verifique se o projeto Supabase está ativo (não pausado)

#### `PGRST116` ou `relation does not exist`

→ As tabelas não foram criadas.

**Solução:** Execute TODAS as migrações SQL no Supabase.

---

### 10. Checklist Completo

Use este checklist para verificar tudo:

- [ ] Node.js >= 18.0.0 instalado
- [ ] pnpm instalado
- [ ] `.env` existe na raiz do projeto
- [ ] `VITE_SUPABASE_URL` está correto no `.env`
- [ ] `VITE_SUPABASE_ANON_KEY` está correto no `.env`
- [ ] Projeto Supabase está ativo (não pausado)
- [ ] Todas as migrações SQL foram executadas no Supabase
- [ ] Pelo menos 1 usuário foi criado em Authentication
- [ ] Profile foi criado para o usuário na tabela `profiles`
- [ ] Admin rodando em http://localhost:5173
- [ ] Consegui fazer login no admin
- [ ] Sem erros no console do browser (F12)

---

## 🆘 Ainda Precisa de Ajuda?

Se seguiu todos os passos e ainda não funciona:

1. **Execute o diagnóstico:**
   ```bash
   bash diagnose.sh
   ```

2. **Capture os erros:**
   - Abra o browser (F12)
   - Vá em Console
   - Tire um screenshot dos erros

3. **Verifique os logs do servidor:**
   ```bash
   # No terminal onde o admin está rodando
   # Procure por erros em vermelho
   ```

4. **Informações úteis para reportar:**
   - Output do `bash diagnose.sh`
   - Screenshot do console do browser
   - Logs do terminal
   - Versão do Node.js: `node -v`
   - Sistema operacional

---

## 📚 Recursos Adicionais

- [Supabase Documentation](https://supabase.com/docs)
- [README.md](README.md) - Instruções de instalação
- [QUICK_START.md](QUICK_START.md) - Guia rápido
- [ARCHITECTURE.md](ARCHITECTURE.md) - Arquitetura do sistema

---

**Última atualização**: 2026-04-01
