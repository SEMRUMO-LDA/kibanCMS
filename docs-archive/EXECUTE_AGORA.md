# ⚡ Execute Agora - Fix Onboarding

## Passo 1: Copiar o SQL

O arquivo [database/migrations/RESET_AND_SEED.sql](database/migrations/RESET_AND_SEED.sql) já está atualizado e pronto para usar.

**IMPORTANTE**: Na linha 281, está configurado para o email `tpacheco@aorubro.pt`.

Se esse **NÃO** for o seu email de login, você precisa trocar antes de executar!

---

## Passo 2: Executar no Supabase

### 1. Abra o Supabase SQL Editor

🔗 [https://supabase.com/dashboard](https://supabase.com/dashboard)

1. Selecione seu projeto
2. Clique em **SQL Editor** no menu lateral
3. Clique em **New Query**

### 2. Cole o SQL Completo

1. Abra o arquivo: [database/migrations/RESET_AND_SEED.sql](database/migrations/RESET_AND_SEED.sql)
2. Copie **TODO** o conteúdo (todas as 671 linhas)
3. Cole no SQL Editor do Supabase

### 3. Ajuste o Email (Se necessário)

Procure pela linha **281**:

```sql
WHERE email = 'tpacheco@aorubro.pt'
```

**Se esse não for o seu email**, troque para o email que você usa para fazer login no admin.

Por exemplo:
```sql
WHERE email = 'seuemail@exemplo.com'
```

Troque também na linha **290**:
```sql
VALUES (v_admin_id, 'seuemail@exemplo.com', 'Admin User', 'super_admin', true)
```

### 4. Execute

Clique no botão **Run** (▶️) no canto superior direito.

Aguarde ~5-10 segundos.

### 5. Veja o Resultado

Você deve ver na parte inferior:

```
✅ Database reset & seed completed!
   - 3 collections created
   - 5 entries created
   - RLS policies enabled
   - Ready to use!
```

---

## Passo 3: Testar o Admin

1. **Volte para o admin**: http://localhost:5176
2. **Limpe o cache do browser**:
   - Pressione `F12` para abrir o DevTools
   - Vá na aba **Console**
   - Digite: `localStorage.clear()`
   - Pressione Enter
3. **Recarregue a página** (Ctrl+R ou Cmd+R)
4. **Faça login** novamente com seu email e senha

---

## ✅ O Que Deve Acontecer

Depois de fazer login, você deve ver:

1. **Dashboard** (não o onboarding!)
2. **Métricas** no dashboard:
   - 3 Collections
   - 5 Entries
   - 1 User (você)
3. **Menu Content** com 3 collections:
   - Blog Posts
   - Projects
   - Site Settings

---

## 🔍 Verificar se Funcionou

Execute o diagnóstico:

```bash
bash diagnose.sh
```

Deve mostrar **SEM ERROS**:
```
✓ Environment configured
✓ Admin running on port 5176
✓ Successfully connected to Supabase
✓ profiles table exists
✓ collections table exists (3)
✓ entries table exists (5)
✓ users exists (1)
```

---

## ❌ Se Ainda Houver Erros

### Erro: "User tpacheco@aorubro.pt not found"

Significa que você não trocou o email. Volte ao SQL Editor e:
1. Troque `tpacheco@aorubro.pt` pelo **seu email** (linhas 281 e 290)
2. Execute novamente

### Erro: HTTP 400 ainda aparece

1. Limpe o localStorage: `localStorage.clear()`
2. Feche TODAS as abas do admin
3. Abra uma nova aba em modo anônimo
4. Acesse http://localhost:5176
5. Faça login

### Erro: "Relation already exists"

Significa que você já tinha tabelas criadas. Execute este SQL primeiro para limpar:

```sql
DROP TABLE IF EXISTS entry_revisions CASCADE;
DROP TABLE IF EXISTS media CASCADE;
DROP TABLE IF EXISTS entries CASCADE;
DROP TABLE IF EXISTS collections CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TYPE IF EXISTS collection_type CASCADE;
DROP TYPE IF EXISTS content_status CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;
```

Depois execute o RESET_AND_SEED.sql completo novamente.

---

## 🆘 Precisa de Ajuda?

Me mostre:
1. A mensagem de erro do Supabase SQL Editor
2. O console do browser (F12 → Console)
3. O resultado do `bash diagnose.sh`

---

**Boa sorte!** 🚀
