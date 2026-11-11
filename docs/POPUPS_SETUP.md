# Popups e barras de anúncio

Promoções, avisos e inscrições na newsletter mostrados no site **sem tocar no
site**: o script dos widgets do Kiban (o mesmo dos cookies, acessibilidade e
WhatsApp) desenha a barra ou o popup.

```
Admin → Add-ons → "Popups e barras de anúncio" → Instalar
Content → Popups → Nova entrada → Publicar
```

Só as entradas **publicadas**, **activas** e dentro das datas chegam ao site.
O widget só é carregado quando existe pelo menos uma; sem campanhas activas o
site não faz nenhum pedido extra.

## Uma campanha

| Campo | O que faz |
|-------|-----------|
| Formato | **Barra** (topo ou fundo, fica até o visitante fechar) ou **Popup** (janela ao centro, com fundo escurecido) |
| Título / Texto / Imagem | Texto simples; quebras de linha respeitadas. A imagem só no popup. |
| Botão + Acção | Abrir ligação (externa abre em nova aba) · WhatsApp (`wa.me` com mensagem) · Newsletter (formulário dentro do popup) · Código de desconto (mostra o código com "Copiar") · Só fechar |
| Páginas | Vazio = todas. `/` só a home, `/tours/*` tudo debaixo de `/tours`, várias separadas por vírgulas |
| Quando aparece | Ao abrir · após N segundos · ao descer N % da página · ao tentar sair (desktop; no telemóvel após 8 s) |
| Frequência | Sempre · uma vez por visita · uma vez a cada N dias (guardado no browser do visitante, sem cookies) |
| Início / Fim | Datas da campanha; o fim inclui o dia inteiro |
| Tema / Cor do botão / Prioridade | Claro ou escuro; cor hex; com várias campanhas na mesma página mostra-se **uma barra e um popup**, as de prioridade mais baixa primeiro |

## Newsletter no popup

A acção "Inscrição na newsletter" precisa do add-on Newsletter instalado. O
formulário envia para `/api/v1/newsletter/subscribe` com a origem indicada,
um honeypot invisível e, se o visitante tiver de marcar, a caixa de
consentimento (texto configurável). Com duplo opt-in ligado o visitante recebe
o email de confirmação, como em qualquer inscrição.

Se o site tiver o anti-spam Cloudflare Turnstile ligado (Settings → API →
secret key), preencha também a **site key** (campo ao lado): o popup mostra o
Turnstile antes de enviar. Sem a site key, as inscrições vindas do popup são
recusadas pelo anti-spam.

## Segurança e privacidade

- Tudo o que vem do admin é tratado como texto: nunca entra HTML na página.
  Ligações só `http(s)`, `/caminho`, `mailto:` ou `tel:`; cores só hex.
- Nenhum cookie nem rastreio. A frequência "uma vez por visita" usa
  `sessionStorage`, "a cada N dias" usa `localStorage`; ambos no browser do
  visitante, nunca enviados ao Kiban.
- Se o site tiver `dataLayer` (GTM/GA), o widget publica eventos
  `kiban_popup` (`view`, `click`, `close`, `subscribe`) com o nome da campanha,
  para medir no Analytics que o site já tenha, dentro do consentimento que o
  site aplica a esse `dataLayer`.
- Acessível: o popup é um `dialog` modal, fecha com Esc e ao clicar fora,
  devolve o foco; respeita `prefers-reduced-motion`.
- Nunca aparece enquanto o editor "Editar no site" está aberto.

## Limites conhecidos

- A barra no **topo** fica por cima de cabeçalhos fixos; nesses sites use a
  posição **fundo**.
- Uma barra e um popup por página de cada vez.
- A configuração dos widgets é guardada 5 minutos pelo browser: uma campanha
  nova pode demorar esse tempo a aparecer a quem já estava no site.

## API

```
GET /api/v1/widgets/bootstrap   → data.configs.popups = { items[], turnstileSiteKey }   (só com campanhas activas)
GET /api/v1/popups/config       → mesma estrutura (fallback do widget)     API key
GET /api/v1/popups/widget.js    → o widget (versionado pelo loader)
```
