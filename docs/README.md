# 📚 Kiban CMS - Documentação

Bem-vindo à documentação completa do Kiban CMS!

---

## 🎯 Para Começar

### Novo no Kiban CMS?
1. **[QUICK_START.md](../QUICK_START.md)** - Setup inicial em 5 minutos
2. **[ARCHITECTURE.md](../ARCHITECTURE.md)** - Entende como funciona
3. **[FRONTEND_INTEGRATION.md](../FRONTEND_INTEGRATION.md)** - Liga ao teu frontend

### Publicar para Produção
1. **[GITHUB_PACKAGES_SETUP.md](./GITHUB_PACKAGES_SETUP.md)** ⭐ - Guia completo passo a passo
2. **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** - Comandos rápidos do dia-a-dia
3. **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Resolução de problemas

---

## 📖 Índice de Documentação

### 🚀 Getting Started
- [Quick Start](../QUICK_START.md) - Setup inicial
- [Architecture](../ARCHITECTURE.md) - Como funciona
- [Example Frontend](../EXAMPLE_FRONTEND.md) - App de exemplo

### 🔧 Desenvolvimento
- [Frontend Integration](../FRONTEND_INTEGRATION.md) - Integrar com React/Next/etc
- [Frontend Integration Guide](../FRONTEND_INTEGRATION_GUIDE.md) - Guia detalhado
- [Execute Agora](../EXECUTE_AGORA.md) - Primeiros passos

### 📦 Publicação & Deploy
- **[GitHub Packages Setup](./GITHUB_PACKAGES_SETUP.md)** - Publicar no GitHub Packages (NPM privado)
- **[Quick Reference](./QUICK_REFERENCE.md)** - Comandos rápidos
- **[Troubleshooting](./TROUBLESHOOTING.md)** - Resolução de problemas

### 🗄️ Database
- [Migration 001](../database/migrations/001_initial_schema.sql) - Schema inicial
- [Migration 005](../database/migrations/005_seed_data.sql) - Dados de exemplo
- [Migration 007](../database/migrations/007_api_keys.sql) - Sistema de API keys
- [Migration 009](../database/migrations/009_webhooks.sql) - Webhooks

### 📊 Releases
- [V1 Release Summary](../V1_RELEASE_SUMMARY.md) - O que há de novo
- [Implementation Summary](../IMPLEMENTATION_SUMMARY.md) - Detalhes técnicos

---

## 🎯 Guias por Caso de Uso

### Sou Developer e quero...

#### ...integrar Kiban num projeto React/Vite
```bash
# 1. Instala o client
pnpm add @teu-username/kiban-client

# 2. Configura
# Ver: FRONTEND_INTEGRATION.md
```

#### ...publicar o Kiban para usar em vários projetos
```bash
# Segue: GITHUB_PACKAGES_SETUP.md
# Tempo: ~15 minutos
# Resultado: Package privado no GitHub (grátis!)
```

#### ...atualizar para uma nova versão
```bash
# Ver: QUICK_REFERENCE.md - "Publicar Nova Versão"
npm version patch
pnpm build && pnpm publish
```

#### ...resolver um problema
```bash
# Ver: TROUBLESHOOTING.md
# Cobre 90% dos problemas comuns
```

---

## 🏗️ Estrutura do Projeto

```
KIBAN CMS/
├── apps/
│   ├── admin/          # Admin UI (React + Vite)
│   ├── api/            # API Server (Express + TypeScript)
│   └── example/        # Frontend de exemplo
├── packages/
│   ├── kiban-client/   # NPM package para clientes
│   ├── core/           # Lógica partilhada
│   ├── types/          # TypeScript types
│   └── ui/             # Componentes UI
├── database/
│   └── migrations/     # SQL migrations (Supabase)
└── docs/              # 📚 ESTÁS AQUI!
    ├── README.md                    # Este ficheiro
    ├── GITHUB_PACKAGES_SETUP.md     # Publicação
    ├── QUICK_REFERENCE.md           # Cheat sheet
    └── TROUBLESHOOTING.md           # Problemas comuns
```

---

## 🔗 Links Rápidos

### Desenvolvimento Local
- **Admin UI:** http://localhost:5173
- **API Server:** http://localhost:5001
- **Example App:** http://localhost:3000

### GitHub
- **Repositório:** https://github.com/teu-username/kiban-cms
- **Packages:** https://github.com/teu-username?tab=packages
- **Issues:** https://github.com/teu-username/kiban-cms/issues

### Supabase
- **Dashboard:** https://supabase.com/dashboard/project/tzlpqzrhnifsclxegnfa
- **SQL Editor:** https://supabase.com/dashboard/project/tzlpqzrhnifsclxegnfa/sql

---

## ❓ FAQ

### Qual a diferença entre publicar no NPM público vs GitHub Packages?

| Feature | NPM Público | GitHub Packages |
|---------|-------------|-----------------|
| **Custo** | Grátis | Grátis |
| **Privacidade** | ❌ Público | ✅ Privado |
| **Controlo de Acesso** | ❌ Não | ✅ Sim |
| **Ideal para** | Open source | Projetos privados/clientes |

**Recomendação:** GitHub Packages para a Kiban Agency!

### Como dou acesso a colaboradores?

Ver: [GITHUB_PACKAGES_SETUP.md - Dar Acesso a Colaboradores](./GITHUB_PACKAGES_SETUP.md#dar-acesso-a-colaboradores)

### Posso usar em projetos comerciais?

Sim! O Kiban CMS é MIT licensed. Podes usar em quantos projetos quiseres.

### Como faço update para nova versão?

```bash
# No Kiban CMS
cd packages/kiban-client
npm version patch
pnpm build && pnpm publish

# Nos projetos cliente
pnpm update @teu-username/kiban-client
```

---

## 🆘 Precisa de Ajuda?

1. **Documentação:** Procura neste diretório `/docs`
2. **Troubleshooting:** [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
3. **Issues:** [GitHub Issues](https://github.com/teu-username/kiban-cms/issues)
4. **Email:** dev@kiban.pt

---

## 🤝 Contribuir

Se encontrares erros na documentação ou queres melhorar algo:

1. Fork o repositório
2. Edita os ficheiros em `/docs`
3. Abre um Pull Request

---

## 📝 Changelog

### v1.0.0 (Abril 2026)
- ✅ Sistema completo de API Keys
- ✅ GitHub Packages integration
- ✅ React Client package
- ✅ TypeScript support
- ✅ Documentação completa

---

**Última atualização:** Abril 2026
**Maintainer:** Kiban Agency (dev@kiban.pt)
