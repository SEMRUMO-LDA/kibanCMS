/**
 * Post-Tour Reviews — settings page
 * Edits a single entry (slug='config') in the 'post-tour-reviews' collection.
 */

import { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { Star, Save, RefreshCw, AlertCircle } from 'lucide-react';
import { colors, spacing, typography, borders, shadows } from '../shared/styles/design-tokens';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';

const fadeIn = keyframes`from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); }`;

const Container = styled.div`max-width: 920px; animation: ${fadeIn} 0.4s ease-out;`;

const Header = styled.header`
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: ${spacing[6]};
  h1 { font-size: ${typography.fontSize['3xl']}; font-weight: ${typography.fontWeight.bold}; margin: 0 0 ${spacing[1]}; color: ${colors.gray[900]}; display: flex; align-items: center; gap: ${spacing[3]}; }
  h1 svg { width: 28px; height: 28px; color: #f59e0b; }
  p { font-size: ${typography.fontSize.sm}; color: ${colors.gray[500]}; margin: 0; max-width: 720px; line-height: 1.55; }
`;

const Section = styled.section`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  padding: ${spacing[6]};
  margin-bottom: ${spacing[5]};
  h2 { font-size: ${typography.fontSize.lg}; font-weight: ${typography.fontWeight.semibold}; margin: 0 0 ${spacing[1]}; color: ${colors.gray[900]}; }
  .desc { font-size: ${typography.fontSize.sm}; color: ${colors.gray[500]}; margin: 0 0 ${spacing[5]}; line-height: 1.55; }
`;

const Grid = styled.div`
  display: grid; grid-template-columns: 1fr 1fr; gap: ${spacing[4]};
  @media (max-width: 720px) { grid-template-columns: 1fr; }
`;

const Field = styled.div<{ $full?: boolean }>`
  ${p => p.$full && 'grid-column: 1 / -1;'}
  display: flex; flex-direction: column; gap: ${spacing[1]};
  label { font-size: ${typography.fontSize.sm}; font-weight: 500; color: ${colors.gray[700]}; }
  input, textarea {
    padding: ${spacing[2]} ${spacing[3]};
    border: 1px solid ${colors.gray[300]};
    border-radius: ${borders.radius.md};
    font-size: ${typography.fontSize.sm};
    font-family: ${typography.fontFamily.sans};
    color: ${colors.gray[900]};
    background: ${colors.white};
    &:focus { outline: 2px solid ${colors.accent[500]}; outline-offset: -1px; border-color: transparent; }
  }
  textarea { resize: vertical; min-height: 110px; line-height: 1.5; }
  .help { font-size: ${typography.fontSize.xs}; color: ${colors.gray[500]}; margin: 2px 0 0; }
  .help code { background: ${colors.gray[100]}; padding: 1px 4px; border-radius: 3px; font-size: 11px; }
`;

const Toggle = styled.label`
  display: flex; align-items: center; gap: ${spacing[3]};
  padding: ${spacing[3]} ${spacing[4]};
  background: ${colors.gray[50]};
  border-radius: ${borders.radius.lg};
  cursor: pointer;
  margin-bottom: ${spacing[5]};
  input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; accent-color: ${colors.accent[500]}; }
  .label-text strong { display: block; font-size: ${typography.fontSize.sm}; color: ${colors.gray[900]}; }
  .label-text span { font-size: ${typography.fontSize.xs}; color: ${colors.gray[500]}; }
`;

const SaveBar = styled.div`
  position: sticky; bottom: ${spacing[4]}; z-index: 10;
  display: flex; justify-content: flex-end; gap: ${spacing[3]};
  padding: ${spacing[3]} ${spacing[4]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.lg};
  box-shadow: ${shadows.lg};
`;

const Btn = styled.button<{ $variant?: 'primary' | 'ghost' }>`
  display: inline-flex; align-items: center; gap: ${spacing[2]};
  padding: ${spacing[2]} ${spacing[4]};
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.sm}; font-weight: 500;
  cursor: pointer; font-family: ${typography.fontFamily.sans};
  border: 1px solid ${p => p.$variant === 'primary' ? colors.accent[500] : colors.gray[200]};
  background: ${p => p.$variant === 'primary' ? colors.accent[500] : colors.white};
  color: ${p => p.$variant === 'primary' ? '#fff' : colors.gray[700]};
  svg { width: 16px; height: 16px; }
  &:hover { background: ${p => p.$variant === 'primary' ? colors.accent[600] : colors.gray[50]}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const InfoBox = styled.div`
  display: flex; gap: ${spacing[3]};
  padding: ${spacing[3]} ${spacing[4]};
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: ${borders.radius.lg};
  margin-bottom: ${spacing[5]};
  font-size: ${typography.fontSize.sm};
  color: #92400e;
  line-height: 1.55;
  svg { width: 18px; height: 18px; flex-shrink: 0; margin-top: 2px; color: #f59e0b; }
`;

interface ReviewConfig {
  enabled: boolean;
  delay_days: string;
  google_review_url: string;
  tripadvisor_url: string;
  subject_pt: string;
  body_pt: string;
  cta_google_label_pt: string;
  cta_tripadvisor_label_pt: string;
  subject_en: string;
  body_en: string;
  cta_google_label_en: string;
  cta_tripadvisor_label_en: string;
}

const DEFAULTS: ReviewConfig = {
  enabled: true,
  delay_days: '2',
  google_review_url: '',
  tripadvisor_url: '',
  subject_pt: 'Como foi a sua experiência com {tour_name}?',
  body_pt: 'Obrigado por escolher-nos!\n\nEsperamos que tenha aproveitado {tour_name} no dia {tour_date}. Se tiver um momento, adoraríamos receber a sua opinião — ajuda-nos imenso e leva poucos segundos.',
  cta_google_label_pt: 'Avaliar no Google',
  cta_tripadvisor_label_pt: 'Avaliar no TripAdvisor',
  subject_en: 'How was your {tour_name} experience?',
  body_en: 'Thanks for choosing us!\n\nWe hope you enjoyed {tour_name} on {tour_date}. If you have a moment, we would love to hear your feedback — it helps us a lot and takes just a few seconds.',
  cta_google_label_en: 'Review on Google',
  cta_tripadvisor_label_en: 'Review on TripAdvisor',
};

const COLLECTION_SLUG = 'post-tour-reviews';
const ENTRY_SLUG = 'config';

export const PostTourReviewsSettings = () => {
  const toast = useToast();
  const [cfg, setCfg] = useState<ReviewConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data: cols } = await api.getCollections();
      const col = (cols || []).find((c: any) => c.slug === COLLECTION_SLUG);
      if (col) {
        setCollectionId(col.id);
        const { data: entries } = await api.getEntries(COLLECTION_SLUG);
        const e = (entries || []).find((x: any) => x.slug === ENTRY_SLUG);
        if (e) {
          setEntryId(e.id);
          setCfg({ ...DEFAULTS, ...(e.content || {}) });
        }
      }
    } catch (err) {
      console.error('[PostTourReviews] load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const update = <K extends keyof ReviewConfig>(key: K, value: ReviewConfig[K]) => {
    setCfg(prev => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      // Lazy-create the collection if it doesn't exist yet (the Addons page may
      // not have created it because settingsRoute addons are configuration-only).
      if (!collectionId) {
        const addonDef = (await import('../config/addons-registry')).getAddon('post-tour-reviews');
        const colSpec = addonDef?.collections.find(c => c.slug === COLLECTION_SLUG);
        if (!colSpec) throw new Error('Add-on registry missing post-tour-reviews collection');
        const { error: createErr } = await api.createCollection({
          name: colSpec.name, slug: colSpec.slug, description: colSpec.description,
          type: colSpec.type, fields: colSpec.fields,
        });
        if (createErr && !createErr.includes('already exists')) throw new Error(createErr);
        const { data: cols } = await api.getCollections();
        const col = (cols || []).find((c: any) => c.slug === COLLECTION_SLUG);
        if (!col) throw new Error('Failed to create collection');
        setCollectionId(col.id);
      }

      const payload = {
        title: 'Post-Tour Reviews Config',
        content: cfg,
        status: 'published' as const,
      };

      if (entryId) {
        await api.updateEntry(COLLECTION_SLUG, ENTRY_SLUG, payload);
      } else {
        await api.createEntry(COLLECTION_SLUG, { ...payload, slug: ENTRY_SLUG });
        const { data: entries } = await api.getEntries(COLLECTION_SLUG);
        const created = (entries || []).find((e: any) => e.slug === ENTRY_SLUG);
        if (created) setEntryId(created.id);
      }
      toast.show('Configuração guardada.', 'success');
    } catch (err: any) {
      toast.show('Erro ao guardar: ' + (err?.message || 'Erro'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Container><p style={{ color: colors.gray[500] }}>A carregar…</p></Container>;

  const linkConfigured = (cfg.google_review_url || '').trim() || (cfg.tripadvisor_url || '').trim();

  return (
    <Container>
      <Header>
        <div>
          <h1><Star /> Post-Tour Reviews</h1>
          <p>Email automático com pedido de review enviado X dias depois de cada tour confirmado, com CTAs para Google e/ou TripAdvisor. Bilingue (PT/EN). O envio é idempotente — cada booking é emailado no máximo uma vez.</p>
        </div>
      </Header>

      {!linkConfigured && (
        <InfoBox>
          <AlertCircle />
          <div>
            <strong>Adiciona pelo menos um link de review</strong> (Google ou TripAdvisor) na secção "Geral" abaixo. Sem links configurados, o email é enviado sem CTAs e perde toda a utilidade.
          </div>
        </InfoBox>
      )}

      <Toggle>
        <input
          type="checkbox"
          checked={cfg.enabled}
          onChange={e => update('enabled', e.target.checked)}
        />
        <div className="label-text">
          <strong>Worker ativo</strong>
          <span>Quando desativado, nenhum email novo é enviado. Bookings já marcados como enviados permanecem marcados.</span>
        </div>
      </Toggle>

      <Section>
        <h2>Geral</h2>
        <p className="desc">Configura quando envias e para onde encaminhas as reviews.</p>
        <Grid>
          <Field>
            <label>Dias depois do tour</label>
            <input
              type="number"
              min={1}
              value={cfg.delay_days}
              onChange={e => update('delay_days', e.target.value)}
            />
            <p className="help">Quantos dias depois da data do tour é enviado o email. Default: 2.</p>
          </Field>
          <Field />
          <Field $full>
            <label>Google Review URL</label>
            <input
              value={cfg.google_review_url}
              onChange={e => update('google_review_url', e.target.value)}
              placeholder="https://g.page/r/..."
            />
            <p className="help">Link directo para o formulário de review do teu Google Business. Deixa em branco para esconder o botão.</p>
          </Field>
          <Field $full>
            <label>TripAdvisor URL</label>
            <input
              value={cfg.tripadvisor_url}
              onChange={e => update('tripadvisor_url', e.target.value)}
              placeholder="https://www.tripadvisor.com/UserReviewEdit-..."
            />
            <p className="help">Link para a tua página no TripAdvisor. Deixa em branco para esconder o botão.</p>
          </Field>
        </Grid>
      </Section>

      <Section>
        <h2>Template — Português</h2>
        <p className="desc">Placeholders disponíveis: <code>{'{customer_name}'}</code>, <code>{'{tour_name}'}</code>, <code>{'{tour_date}'}</code>.</p>
        <Grid>
          <Field $full>
            <label>Assunto</label>
            <input value={cfg.subject_pt} onChange={e => update('subject_pt', e.target.value)} />
          </Field>
          <Field $full>
            <label>Corpo</label>
            <textarea rows={6} value={cfg.body_pt} onChange={e => update('body_pt', e.target.value)} />
            <p className="help">Texto simples — parágrafos separados por linha vazia.</p>
          </Field>
          <Field>
            <label>Botão Google (label)</label>
            <input value={cfg.cta_google_label_pt} onChange={e => update('cta_google_label_pt', e.target.value)} />
          </Field>
          <Field>
            <label>Botão TripAdvisor (label)</label>
            <input value={cfg.cta_tripadvisor_label_pt} onChange={e => update('cta_tripadvisor_label_pt', e.target.value)} />
          </Field>
        </Grid>
      </Section>

      <Section>
        <h2>Template — English</h2>
        <p className="desc">Same placeholders. Used for bookings whose <code>customer_language</code> is set to "en", or when the site default language is English.</p>
        <Grid>
          <Field $full>
            <label>Subject</label>
            <input value={cfg.subject_en} onChange={e => update('subject_en', e.target.value)} />
          </Field>
          <Field $full>
            <label>Body</label>
            <textarea rows={6} value={cfg.body_en} onChange={e => update('body_en', e.target.value)} />
          </Field>
          <Field>
            <label>Google CTA label</label>
            <input value={cfg.cta_google_label_en} onChange={e => update('cta_google_label_en', e.target.value)} />
          </Field>
          <Field>
            <label>TripAdvisor CTA label</label>
            <input value={cfg.cta_tripadvisor_label_en} onChange={e => update('cta_tripadvisor_label_en', e.target.value)} />
          </Field>
        </Grid>
      </Section>

      <SaveBar>
        <Btn onClick={load} disabled={saving}>
          <RefreshCw /> Recarregar
        </Btn>
        <Btn $variant="primary" onClick={save} disabled={saving}>
          <Save /> {saving ? 'A guardar…' : 'Guardar'}
        </Btn>
      </SaveBar>
    </Container>
  );
};
