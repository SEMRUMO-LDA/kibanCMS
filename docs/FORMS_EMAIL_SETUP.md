# kibanCMS — Configurar Notificacoes de Email (Forms Addon)

> Guia para configurar o envio de emails automaticos quando um formulario e submetido num frontend.

---

## Arquitetura

```
Frontend → POST /api/v1/forms/submit → Lead guardada no CMS
                                      → Webhook → Make.com → Email enviado
```

O CMS guarda a lead e dispara um webhook. O Make.com recebe e envia o email. Zero codigo no backend.

---

## Pre-requisitos

1. Addon **Forms** instalado no CMS (Extensoes > Forms > Install)
2. Conta no Make.com (gratis ate 1000 operacoes/mes)

---

## Passo 1: Criar Scenario no Make.com

1. Vai a [make.com](https://www.make.com) e cria conta (ou faz login)
2. Clica **Create a new scenario**

---

## Passo 2: Adicionar modulo Webhook (trigger)

1. Clica no **+** e procura **Webhooks**
2. Seleciona **Custom webhook**
3. Clica **Add** para criar um novo webhook
4. Da-lhe um nome: `kibanCMS Forms`
5. Clica **Save**
6. Aparece um URL como: `https://hook.eu2.make.com/abc123xyz`
7. **Copia este URL** — vais precisar no Passo 5

---

## Passo 3: Adicionar modulo Email (acao)

1. Clica no **+** a direita do webhook
2. Escolhe uma destas opcoes:

### Opcao A: Email generico (SMTP)
- Procura **Email > Send an email**
- Configura uma conexao SMTP (Gmail, Outlook, etc.)

### Opcao B: Gmail direto
- Procura **Gmail > Send an email**
- Autoriza a tua conta Gmail

### Opcao C: Outlook/Microsoft 365
- Procura **Microsoft 365 Email > Send an email**
- Autoriza a tua conta

---

## Passo 4: Configurar os campos do email

Depois de escolher o modulo de email, configura os campos assim:

| Campo | Valor |
|-------|-------|
| **To** | `geral@solfil.pt` (ou o email da empresa) |
| **Subject** | `Nova mensagem de {{submission.name}} — Website` |
| **Body (HTML)** | Ver template abaixo |

### Template do body (HTML)

```html
<h2>Nova Mensagem do Website</h2>

<table style="border-collapse: collapse; width: 100%; max-width: 600px; font-family: Arial, sans-serif;">
  <tr>
    <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; width: 140px;">Nome</td>
    <td style="padding: 10px; border: 1px solid #ddd;">{{submission.name}}</td>
  </tr>
  <tr>
    <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Email</td>
    <td style="padding: 10px; border: 1px solid #ddd;"><a href="mailto:{{submission.email}}">{{submission.email}}</a></td>
  </tr>
  <tr>
    <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Telefone</td>
    <td style="padding: 10px; border: 1px solid #ddd;">{{submission.phone}}</td>
  </tr>
  <tr>
    <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Tipo de Cliente</td>
    <td style="padding: 10px; border: 1px solid #ddd;">{{submission.extra.client_type}}</td>
  </tr>
  <tr>
    <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Mensagem</td>
    <td style="padding: 10px; border: 1px solid #ddd;">{{submission.message}}</td>
  </tr>
  <tr>
    <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Pagina</td>
    <td style="padding: 10px; border: 1px solid #ddd;">{{submission.source_url}}</td>
  </tr>
  <tr>
    <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Data</td>
    <td style="padding: 10px; border: 1px solid #ddd;">{{submission.submitted_at}}</td>
  </tr>
</table>

<p style="color: #888; font-size: 12px; margin-top: 20px;">
  Enviado automaticamente pelo kibanCMS — <a href="https://kiban.pt">Abrir CMS</a>
</p>
```

### Mapeamento de variaveis no Make.com

O webhook recebe este payload do kibanCMS:

```json
{
  "event": "form.submitted",
  "form_name": "contact",
  "entry_id": "uuid",
  "submission": {
    "form_name": "contact",
    "name": "Joao Silva",
    "email": "joao@email.pt",
    "phone": "+351 912 345 678",
    "message": "Gostaria de mais informacoes...",
    "submitted_at": "2026-04-06T12:00:00.000Z",
    "is_read": false,
    "source_url": "https://solfil.pt/#contacto"
  },
  "notification": {
    "to": "geral@solfil.pt",
    "subject": "New contact from Joao Silva",
    "auto_reply": null
  },
  "timestamp": "2026-04-06T12:00:00.000Z"
}
```

No Make.com, para aceder aos campos usa:
- `{{submission.name}}` → nome
- `{{submission.email}}` → email
- `{{submission.phone}}` → telefone
- `{{submission.message}}` → mensagem
- `{{submission.source_url}}` → pagina de origem
- `{{notification.to}}` → email de destino configurado no CMS
- `{{notification.subject}}` → subject configurado no CMS

---

## Passo 5: Configurar no kibanCMS

1. Abre o admin do CMS
2. Vai a **Conteudo > Forms Config**
3. Cria uma nova entry:

| Campo | Valor |
|-------|-------|
| **Title** | Contact Form Config |
| **Slug** | contact-config |
| **form_name** | `contact` |
| **notification_emails** | `geral@solfil.pt` |
| **email_subject_template** | `Nova mensagem de {name} — Solfil` |
| **webhook_url** | `https://hook.eu2.make.com/abc123xyz` (o URL do Passo 2) |
| **is_active** | `true` |
| **auto_reply** | (vazio, ou mensagem de auto-resposta) |
| **Status** | Published |

---

## Passo 6: Ativar o Scenario no Make.com

1. No Make.com, clica **Run once** para testar
2. Submete um formulario de teste no website
3. Verifica que o Make.com recebeu os dados e enviou o email
4. Se tudo ok, ativa o **Scheduling** (toggle ON no canto inferior)
5. Define para **Immediately** (processa assim que recebe)

---

## Passo 7: Testar

1. Vai ao website (ex: solfil.pt)
2. Preenche e submete o formulario de contacto
3. Verifica:
   - [ ] Lead aparece em **Conteudo > Form Submissions** no CMS
   - [ ] Email chegou a `geral@solfil.pt`
   - [ ] Dados estao corretos no email

---

## Troubleshooting

### Formulario submete mas nao recebo email
1. Verifica no CMS se a lead foi criada (Conteudo > Form Submissions)
2. Se sim, o problema e no webhook. Verifica:
   - Forms Config tem `is_active: true` e `webhook_url` preenchido?
   - O Scenario no Make.com esta ativo (Scheduling ON)?
   - Verifica o historico de execucoes no Make.com

### Formulario da erro no frontend
1. Abre a consola do browser (F12 > Console)
2. Verifica o erro. Causas comuns:
   - API Key incorreta ou expirada
   - Addon Forms nao instalado (collection `form-submissions` nao existe)
   - CORS bloqueado (verificar `ALLOWED_ORIGINS` no servidor)

### Make.com nao recebe dados
1. Confirma que o URL do webhook esta correto na Forms Config
2. Testa com `curl`:
```bash
curl -X POST https://hook.eu2.make.com/SEU_URL \
  -H "Content-Type: application/json" \
  -d '{"event":"form.submitted","submission":{"name":"Teste","email":"teste@email.pt","message":"Hello"}}'
```

### Quero enviar para mais de um email
No campo `notification_emails` da Forms Config, separa por virgulas:
```
geral@solfil.pt, comercial@solfil.pt
```
No Make.com, usa `{{notification.to}}` no campo "To".

---

## Alternativas ao Make.com

| Servico | Gratis | Notas |
|---------|--------|-------|
| **Make.com** | 1000 ops/mes | Recomendado. Visual, facil |
| **Zapier** | 100 tasks/mes | Similar ao Make, menos generoso |
| **Resend.com** | 100 emails/dia | API direta, precisa de endpoint intermediario |
| **n8n** | Self-hosted gratis | Open source, mais tecnico |

---

## Resumo

- **Leads** ficam sempre guardadas no CMS, com ou sem webhook
- **Email** e enviado via Make.com (webhook externo)
- **Configuracao por form** — cada formulario pode ter emails e webhook diferentes
- **Zero codigo** no backend para email — tudo via webhook + Make.com
