# 🔧 Fix Onboarding Errors - Quick Guide

## Problema

O onboarding estava falhando porque a tabela `profiles` não tinha os campos `onboarding_completed` e `project_manifesto`.

## ✅ Solução (3 minutos)

### Opção 1: Reset Completo (Recomendado) ⚡

**Esta opção vai DELETAR todos os dados e recriar tudo do zero.**

1. Vá ao [Supabase Dashboard](https://supabase.com/dashboard)
2. Selecione seu projeto
3. Clique em **SQL Editor**
4. Clique em **New Query**
5. Copie **TODO** o conteúdo do arquivo: `database/migrations/RESET_AND_SEED.sql`
6. Cole no editor
7. **IMPORTANTE**: Na linha 281, atualize o email para o seu:
   ```sql
   WHERE email = 'seu-email@aqui.com'  -- ← Troque pelo email que você usou para se registrar
   ```
8. Clique em **Run** (▶️)
9. Aguarde ~5 segundos
10. Você verá uma mensagem: "✅ Database reset & seed completed!"

**Pronto!** Agora recarregue a página do admin (http://localhost:5173) e faça login novamente.

---

### Opção 2: Adicionar Campos Apenas (Se não quer perder dados)

Se você já tem dados e não quer perder, rode este SQL:

```sql
-- Adicionar campos que faltavam
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS project_manifesto JSONB DEFAULT NULL;

-- Marcar seu usuário como tendo completado onboarding
UPDATE profiles
SET onboarding_completed = true
WHERE email = 'seu-email@aqui.com';  -- ← Troque pelo seu email
```

---

## 📋 Verificar se Funcionou

Depois de executar uma das opções acima:

1. **Recarregue** a página do admin (http://localhost:5173)
2. Se pedir login, faça login com seu email e senha
3. Você deve ver o **Dashboard** diretamente (não o onboarding)
4. No dashboard, você verá:
   - Número de entries, collections, media, users
   - Se usou a Opção 1, verá 3 collections e 5 entries já criados

---

## 🎉 Próximos Passos

Agora que o banco está funcionando:

1. **Explorar Collections**:
   - Clique em **Content** no menu lateral
   - Você verá "Blog Posts", "Projects", "Site Settings"

2. **Criar seu Primeiro Entry**:
   - Clique em uma collection (ex: Blog Posts)
   - Clique em **New Entry**
   - Preencha os campos
   - Clique em **Save**

3. **Testar o Frontend Example**:
   ```bash
   # Na raiz do projeto
   pnpm setup:example
   pnpm dev:example
   ```
   Depois acesse: http://localhost:3000

---

## ❓ O Que Foi Corrigido

Arquivos atualizados:
- ✅ [database/migrations/001_initial_schema.sql](database/migrations/001_initial_schema.sql) - Adicionado `onboarding_completed` e `project_manifesto`
- ✅ [database/migrations/RESET_AND_SEED.sql](database/migrations/RESET_AND_SEED.sql) - Adicionado campos e seed data

Agora a tabela `profiles` tem a estrutura correta:
```sql
CREATE TABLE profiles (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role user_role DEFAULT 'viewer' NOT NULL,
    onboarding_completed BOOLEAN DEFAULT false NOT NULL,  ← NOVO
    project_manifesto JSONB DEFAULT NULL,                 ← NOVO
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

---

## 🆘 Ainda com Problemas?

Se continuar com erros:

1. **Limpe o localStorage do browser**:
   - Abra o Console (F12)
   - Digite: `localStorage.clear()`
   - Pressione Enter
   - Recarregue a página

2. **Verifique o console do browser**:
   - Pressione F12
   - Vá na aba Console
   - Veja se há erros em vermelho
   - Me envie um screenshot se precisar de ajuda

3. **Execute o diagnóstico**:
   ```bash
   bash diagnose.sh
   ```

---

**Dica**: Se você está começando do zero, sempre use a **Opção 1** (RESET_AND_SEED.sql). Ela já vem com collections e entries de exemplo prontas para você testar!
