/**
 * Settings → AI & Performance
 *
 * Choices (saved with the other site settings) + copy-paste code for the
 * client's Next.js site: optimised images, robots.txt, sitemap, llms.txt and
 * JSON-LD. Snippets already contain this client's API URL and tenant.
 */

import { useEffect, useState } from 'react';
import { Sparkles, Gauge, Copy, Check } from 'lucide-react';
import { spacing } from '../../shared/styles/design-tokens';
import { api } from '../../lib/api';
import { Panel, PanelHeader, Button, CodeBlock, Step, Banner } from './panel-styles';

type Policy = 'allow' | 'block';

export interface AiPerformanceSettings {
  ai_search_bots: string;
  ai_training_bots: string;
  business_type: string;
}

interface Props {
  locale: 'pt' | 'en';
  values: AiPerformanceSettings;
  siteUrl: string;
  onChange: (key: keyof AiPerformanceSettings, value: string) => void;
}

const BUSINESS_TYPES: Array<{ value: string; pt: string; en: string }> = [
  { value: 'Organization', pt: 'Empresa / organização', en: 'Company / organisation' },
  { value: 'TravelAgency', pt: 'Agência de viagens / operador turístico', en: 'Travel agency / tour operator' },
  { value: 'LocalBusiness', pt: 'Negócio local', en: 'Local business' },
  { value: 'LodgingBusiness', pt: 'Alojamento', en: 'Lodging' },
  { value: 'Restaurant', pt: 'Restaurante', en: 'Restaurant' },
  { value: 'Store', pt: 'Loja', en: 'Store' },
  { value: 'ProfessionalService', pt: 'Serviços profissionais', en: 'Professional services' },
  { value: 'SportsActivityLocation', pt: 'Atividades / desporto', en: 'Activities / sports' },
  { value: 'TouristInformationCenter', pt: 'Posto de turismo', en: 'Tourist information' },
];

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (id: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 2000); } catch { /* manual copy */ }
  };
  return { copied, copy };
}

export function AiPerformancePanel({ locale, values, siteUrl, onChange }: Props) {
  const pt = locale === 'pt';
  const L = (p: string, e: string) => (pt ? p : e);
  const { copied, copy } = useCopy();
  const [conn, setConn] = useState<{ apiUrl: string; tenantId: string } | null>(null);

  useEffect(() => {
    api.getSiteConnection().then(({ data }) => { if (data) setConn({ apiUrl: data.apiUrl, tenantId: data.tenantId }); });
  }, []);

  const apiUrl = conn?.apiUrl || 'https://kiban.pt';
  const search = (values.ai_search_bots || 'allow') as Policy;
  const training = (values.ai_training_bots || 'allow') as Policy;

  const loader = `// image-loader.ts  (next.config: images: { loader: 'custom', loaderFile: './image-loader.ts' })
export default function kibanLoader({ src, width, quality }: { src: string; width: number; quality?: number }) {
  if (!src.includes('/storage/v1/object/public/')) return src; // not a CMS image
  return \`${apiUrl}/api/v1/img?src=\${encodeURIComponent(src)}&w=\${width}&q=\${quality || 75}\`;
}`;

  const routes = `// lib/kiban.ts — server-side helper (key + tenant never reach the browser)
const KIBAN = process.env.NEXT_PUBLIC_KIBAN_API_URL!;
const headers = { Authorization: \`Bearer \${process.env.KIBAN_API_KEY}\`, 'X-Tenant': process.env.KIBAN_TENANT! };
export const kiban = (path: string) => fetch(\`\${KIBAN}/api/v1\${path}\`, { headers, next: { revalidate: 600 } });

// app/robots.txt/route.ts
import { kiban } from '@/lib/kiban';
export async function GET() {
  const r = await kiban('/seo/robots.txt');
  return new Response(await r.text(), { headers: { 'Content-Type': 'text/plain' } });
}

// app/llms.txt/route.ts
import { kiban } from '@/lib/kiban';
export async function GET() {
  const r = await kiban('/seo/llms.txt');
  return new Response(await r.text(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

// app/sitemap.xml/route.ts
import { kiban } from '@/lib/kiban';
export async function GET() {
  const r = await kiban('/seo/sitemap.xml');
  return new Response(await r.text(), { headers: { 'Content-Type': 'application/xml' } });
}`;

  const jsonld = `// In app/layout.tsx (once, business + website):
const { data: siteLd } = await (await kiban('/seo/jsonld')).json();
// <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteLd) }} />

// In an entry page — ask for JSON-LD together with the content:
const { data, meta } = await (await kiban(\`/entries/tours/\${slug}?jsonld=1\`)).json();
// <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(meta.jsonld) }} />`;

  const policyRow = (key: 'ai_search_bots' | 'ai_training_bots', value: Policy, title: string, help: string) => (
    <div style={{ display: 'flex', gap: spacing[4], alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: spacing[4] }}>
      <div style={{ flex: '1 1 320px' }}>
        <strong style={{ fontSize: 14 }}>{title}</strong>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#525252', lineHeight: 1.5 }}>{help}</p>
      </div>
      <select value={value} onChange={e => onChange(key, e.target.value)} aria-label={title}>
        <option value="allow">{L('Permitir', 'Allow')}</option>
        <option value="block">{L('Bloquear', 'Block')}</option>
      </select>
    </div>
  );

  const codeStep = (n: number, id: string, title: string, intro: string, code: string) => (
    <Step>
      <div className="num">{n}</div>
      <div>
        <h3>{title}</h3>
        <p>{intro}</p>
        <CodeBlock>{code}</CodeBlock>
        <div style={{ marginTop: spacing[2] }}>
          <Button $variant="secondary" onClick={() => copy(id, code)}>
            {copied === id ? <Check /> : <Copy />} {copied === id ? L('Copiado', 'Copied') : L('Copiar', 'Copy')}
          </Button>
        </div>
      </div>
    </Step>
  );

  return (
    <>
      <Panel>
        <PanelHeader>
          <div>
            <h2><Sparkles style={{ width: 18, height: 18, verticalAlign: '-3px', marginRight: 6 }} aria-hidden />{L('Pesquisa com IA', 'AI search')}</h2>
            <p>{L(
              'Ajuda o ChatGPT, o Perplexity, o Claude e o Google a perceber e citar este site. As escolhas são guardadas com o botão Guardar.',
              'Helps ChatGPT, Perplexity, Claude and Google understand and cite this site. Choices are saved with the Save button.',
            )}</p>
          </div>
        </PanelHeader>

        {policyRow('ai_search_bots', search,
          L('Aparecer nas respostas de assistentes de IA', 'Appear in AI assistant answers'),
          L('Robôs que leem páginas para responder a utilizadores e citam o site (ChatGPT search, Perplexity, Claude). Bloquear = o site deixa de aparecer nessas respostas.',
            'Bots that read pages to answer users and cite the site (ChatGPT search, Perplexity, Claude). Blocking = the site stops appearing in those answers.'))}
        {policyRow('ai_training_bots', training,
          L('Permitir uso do conteúdo para treinar modelos de IA', 'Allow content to be used to train AI models'),
          L('GPTBot, ClaudeBot, Common Crawl, Google-Extended… Bloquear não afeta o Google nem as respostas de IA acima.',
            'GPTBot, ClaudeBot, Common Crawl, Google-Extended… Blocking does not affect Google or the AI answers above.'))}

        <div style={{ display: 'flex', gap: spacing[4], alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px' }}>
            <strong style={{ fontSize: 14 }}>{L('Tipo de negócio', 'Business type')}</strong>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#525252', lineHeight: 1.5 }}>
              {L('Usado nos dados estruturados (schema.org) junto com o nome, logótipo, contactos e redes sociais do separador Geral.',
                 'Used in the structured data (schema.org) together with the name, logo, contacts and socials from the General tab.')}
            </p>
          </div>
          <select value={values.business_type || 'Organization'} onChange={e => onChange('business_type', e.target.value)} aria-label={L('Tipo de negócio', 'Business type')}>
            {BUSINESS_TYPES.map(b => <option key={b.value} value={b.value}>{pt ? b.pt : b.en}</option>)}
          </select>
        </div>

        {!/^https?:\/\//.test(siteUrl) && (
          <Banner $tone="warn" style={{ marginTop: spacing[4] }}>
            <Sparkles aria-hidden />
            <span>{L('Preenche o URL do site no separador Geral: é necessário para o sitemap, o llms.txt e os dados estruturados.',
                     'Fill in the site URL in the General tab: required for the sitemap, llms.txt and structured data.')}</span>
          </Banner>
        )}
      </Panel>

      <Panel>
        <PanelHeader>
          <div>
            <h2><Gauge style={{ width: 18, height: 18, verticalAlign: '-3px', marginRight: 6 }} aria-hidden />{L('Ligar ao site (Next.js)', 'Connect to the site (Next.js)')}</h2>
            <p>{L('Uma vez por site. Usa as mesmas variáveis do "Ligar o meu site" (separador API).',
                  'Once per site. Uses the same variables as "Connect my site" (API tab).')}</p>
          </div>
        </PanelHeader>
        {codeStep(1, 'loader', L('Imagens otimizadas', 'Optimised images'),
          L('O next/image passa a pedir cada imagem no tamanho certo, em AVIF/WebP. Costuma ser a maior melhoria de velocidade num site com muitas fotografias.',
            'next/image will request each image at the right size, in AVIF/WebP. Usually the biggest speed win on photo-heavy sites.'), loader)}
        {codeStep(2, 'routes', L('robots.txt, llms.txt e sitemap', 'robots.txt, llms.txt and sitemap'),
          L('Servidos pelo domínio do site, gerados pelo CMS.', 'Served from the site domain, generated by the CMS.'), routes)}
        {codeStep(3, 'jsonld', L('Dados estruturados (JSON-LD)', 'Structured data (JSON-LD)'),
          L('Tours, eventos, produtos, artigos e perguntas frequentes ganham o tipo schema.org certo automaticamente.',
            'Tours, events, products, articles and FAQs automatically get the right schema.org type.'), jsonld)}
      </Panel>
    </>
  );
}
