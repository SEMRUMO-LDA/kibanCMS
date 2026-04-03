# kibanCMS Database Setup

## 🚀 Quick Start - Reset & Seed Everything

Se queres começar do zero com tudo configurado corretamente, segue estes passos:

### 1. Abre o Supabase SQL Editor

Vai para: `https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new`

### 2. Copia o Script de Reset

Abre o ficheiro [`RESET_AND_SEED.sql`](./migrations/RESET_AND_SEED.sql) e copia **TODO** o conteúdo.

### 3. **⚠️ IMPORTANTE: Atualiza o Email**

Antes de executar, **procura esta linha** no script (linha ~254):

```sql
WHERE email = 'tpacheco@aorubro.pt'
```

E **substitui** pelo teu email do Supabase (o que usas para fazer login).

### 4. Executa o Script

- Cola o script completo no SQL Editor
- Clica em **"Run"**
- Aguarda 2-5 segundos

### 5. Verifica os Resultados

Deves ver uma mensagem como esta:

```
========================================
✅ Database reset & seed completed!
========================================
   - 3 collections created
   - 5 entries created
   - RLS policies enabled
   - Ready to use!
========================================
```

### 6. Atualiza o kibanCMS Admin

- Vai para: `http://localhost:5176` (ou a porta que o Vite escolheu)
- Faz refresh da página (⌘+R ou Ctrl+R)
- Navega para `/content`
- Deves ver 3 collections: **Blog Posts**, **Projects**, **Site Settings**

---

## 📦 O que o Script Cria

### Tables
- ✅ `profiles` - User profiles linked to Supabase Auth
- ✅ `collections` - Content type definitions
- ✅ `entries` - Actual content entries
- ✅ `media` - File uploads (structure ready)

### Collections (3)
1. **Blog Posts** - Articles com 6 fields (title, slug, excerpt, body, image, date)
2. **Projects** - Portfolio com 7 fields (title, slug, client, description, thumbnail, year, featured)
3. **Site Settings** - Global settings com 6 fields (site_name, description, logo, twitter, instagram, maintenance_mode)

### Sample Entries (5)
- 2 blog posts (1 published, 1 draft)
- 2 projects (both published)
- 1 settings entry

### Security
- ✅ Row Level Security (RLS) enabled em todas as tables
- ✅ Políticas para super_admin, admin, editor, author, viewer
- ✅ Users só podem ver/editar o que têm permissão

---

## 🔧 Estrutura das Tables

### `collections`
```sql
- id: UUID (primary key)
- name: TEXT (ex: "Blog Posts")
- slug: TEXT (ex: "blog")
- description: TEXT
- type: ENUM (post, page, custom)
- fields: JSONB (array of field definitions)
- icon: TEXT (lucide icon name)
- color: TEXT (badge color)
- created_by: UUID (references profiles)
```

### `entries`
```sql
- id: UUID (primary key)
- collection_id: UUID (references collections)
- title: TEXT
- slug: TEXT
- content: JSONB (all field data stored here)
- excerpt: TEXT
- status: ENUM (draft, review, scheduled, published, archived)
- author_id: UUID (references profiles)
- published_at: TIMESTAMPTZ
```

---

## 🛠️ Troubleshooting

### Erro: "User not found in auth.users"

**Causa**: O email no script não corresponde a nenhum utilizador no Supabase Auth.

**Solução**:
1. Vai para Supabase > Authentication > Users
2. Verifica o email do teu utilizador
3. Atualiza a linha 254 do script com esse email
4. Executa novamente

### Erro: "permission denied for schema public"

**Causa**: O teu utilizador não tem permissões para criar tables.

**Solução**:
1. Vai para Supabase > SQL Editor
2. Executa: `GRANT ALL ON SCHEMA public TO postgres, authenticated;`
3. Tenta novamente o script de reset

### Collections não aparecem no CMS

**Verificações**:
1. ✅ Script executado sem erros?
2. ✅ Email correto no script?
3. ✅ Refresh da página do CMS?
4. ✅ Console do browser sem erros? (F12 > Console)

**Debug**:
Abre o console do browser e escreve:
```javascript
// Verifica se está autenticado
const { data } = await supabase.auth.getSession()
console.log('Session:', data.session?.user?.email)

// Tenta buscar collections
const { data: cols, error } = await supabase.from('collections').select('*')
console.log('Collections:', cols, 'Error:', error)
```

Se o erro for de RLS policy, executa o script de reset novamente.

---

## 📁 Ficheiros Importantes

- `RESET_AND_SEED.sql` - **Script completo de reset** (usa este!)
- `001_initial_schema.sql` - Schema original (referência)
- `005_seed_data.sql` - Seed antigo (deprecated)

---

## ✅ Próximos Passos

Depois de teres a base de dados configurada:

1. **Testar CRUD completo**:
   - Criar uma entry
   - Editar uma entry
   - Apagar uma entry
   - Mudar status de draft para published

2. **Implementar Publishing Workflow**:
   - Dropdown de status no EntryEditor
   - Botão "Publish" vs "Save Draft"

3. **Media Library**:
   - Upload de imagens
   - Galeria de media
   - Integração com fields tipo "image"

4. **Search & Filters**:
   - Search global por título/slug
   - Filtro por status
   - Filtro por data

---

## 🆘 Precisa de Ajuda?

Se encontrares algum problema:

1. Verifica os logs do Supabase SQL Editor
2. Verifica o console do browser (F12)
3. Verifica a tab "Network" do browser para ver requests falhados
4. Partilha o erro exacto que aparece

---

**Última atualização**: 2026-04-01
**Versão do Schema**: 1.0.0
