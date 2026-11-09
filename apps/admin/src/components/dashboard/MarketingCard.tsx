/**
 * MarketingCard — dashboard summary of cookie consent and conversions, so the
 * client sees what the CMS measures for them (and what blocks it).
 * Hidden for roles that can't read it and when nothing is set up.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { api, type MarketingOverview } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { colors, spacing, typography, borders } from '../../shared/styles/design-tokens';

const Card = styled.div`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  overflow: hidden;
`;

const Header = styled.div`
  padding: ${spacing[5]};
  border-bottom: 1px solid ${colors.gray[100]};
  display: flex; align-items: center; justify-content: space-between;
  h3 { margin: 0; font-size: ${typography.fontSize.base}; font-weight: 600; color: ${colors.gray[900]}; }
  button {
    font-size: 13px; color: ${colors.accent[600]}; background: none; border: none; cursor: pointer;
    font-weight: 500; display: flex; align-items: center; gap: 4px; font-family: ${typography.fontFamily.sans};
    &:hover { color: ${colors.accent[700]}; }
  }
`;

const Body = styled.div`
  padding: ${spacing[4]} ${spacing[5]};
  display: flex; flex-direction: column; gap: ${spacing[4]};
`;

const SectionLabel = styled.div`
  font-size: 11px; font-weight: 600; color: ${colors.gray[500]};
  text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: ${spacing[2]};
`;

const ConsentBar = styled.div`
  display: flex; height: 10px; border-radius: 99px; overflow: hidden; background: ${colors.gray[100]};
  span { height: 100%; }
`;

const Legend = styled.div`
  display: flex; flex-wrap: wrap; gap: ${spacing[3]}; margin-top: ${spacing[2]};
  font-size: 12px; color: ${colors.gray[600]};
  i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; }
`;

const Numbers = styled.div`
  display: grid; grid-template-columns: repeat(3, 1fr); gap: ${spacing[3]};
  div { text-align: center; }
  b { display: block; font-size: ${typography.fontSize['2xl']}; font-weight: ${typography.fontWeight.bold}; color: ${colors.gray[900]}; }
  small { font-size: 12px; color: ${colors.gray[500]}; }
`;

const Status = styled.div`
  display: flex; flex-direction: column; gap: ${spacing[2]};
  div { display: flex; align-items: flex-start; gap: ${spacing[2]}; font-size: 13px; color: ${colors.gray[700]}; line-height: 1.4; }
  svg { width: 16px; height: 16px; flex-shrink: 0; margin-top: 1px; }
  .ok { color: #16a34a; }
  .warn { color: #d97706; }
`;

const GREEN = '#16a34a';
const AMBER = '#f59e0b';
const RED = '#dc2626';

export function MarketingCard() {
  const { locale } = useI18n();
  const navigate = useNavigate();
  const [data, setData] = useState<MarketingOverview | null>(null);
  const L = (pt: string, en: string) => (locale === 'pt' ? pt : en);

  useEffect(() => {
    let alive = true;
    api.getMarketingOverview().then(({ data: d }) => { if (alive && d) setData(d); });
    return () => { alive = false; };
  }, []);

  if (!data) return null;
  const { consent, conversions, meta, google } = data;
  const googleOn = !!(google.analytics || google.ads || google.tagManager);
  if (!meta.pixelId && !googleOn && consent.visitors === 0) return null;

  const total = consent.visitors || 0;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const n = (v: number | null) => (v == null ? '—' : String(v));
  const marketingCategory = consent.offered.includes('marketing');
  const analyticsCategory = consent.offered.includes('analytics');

  const lines: Array<{ ok: boolean; text: string }> = [];
  if (!consent.banner && (meta.pixelId || googleOn)) {
    lines.push({ ok: false, text: L('Banner de cookies desligado: o Pixel e o Google nunca carregam.', 'Cookie banner is off: the Pixel and Google never load.') });
  }
  if (meta.pixelId) {
    if (meta.pixelAutoload && !marketingCategory) {
      lines.push({ ok: false, text: L('Meta Pixel: falta a categoria "Marketing" no banner de cookies.', 'Meta Pixel: the cookie banner has no "Marketing" category.') });
    } else {
      lines.push({ ok: true, text: L(`Meta Pixel ${meta.pixelId} ativo (após consentimento de marketing).`, `Meta Pixel ${meta.pixelId} active (after marketing consent).`) });
    }
    if (meta.capiEnabled && !meta.capiConfigured) {
      lines.push({ ok: false, text: L('Conversions API ligada mas sem token de acesso.', 'Conversions API on but has no access token.') });
    } else if (meta.capiEnabled && meta.lastError && (!meta.lastSentAt || (meta.lastErrorAt || '') > meta.lastSentAt)) {
      lines.push({ ok: false, text: L(`Conversions API com erro: ${meta.lastError}`, `Conversions API error: ${meta.lastError}`) });
    } else if (meta.capiEnabled) {
      lines.push({ ok: true, text: L(`Conversions API: ${meta.sentSinceRestart} eventos enviados para a Meta desde o último arranque.`, `Conversions API: ${meta.sentSinceRestart} events sent to Meta since the last restart.`) });
    }
  }
  if (googleOn) {
    const ids = [google.analytics, google.ads, google.tagManager].filter(Boolean).join(' · ');
    if (google.autoload && google.analytics && !analyticsCategory) {
      lines.push({ ok: false, text: L('Google Analytics: falta a categoria "Analíticos" no banner de cookies.', 'Google Analytics: the cookie banner has no "Analytics" category.') });
    } else {
      lines.push({ ok: true, text: google.autoload
        ? L(`Google (${ids}) com Consent Mode v2 — modo ${google.consentMode === 'advanced' ? 'avançado' : 'básico'}.`, `Google (${ids}) with Consent Mode v2 — ${google.consentMode} mode.`)
        : L(`Google (${ids}) instalado pelo próprio site.`, `Google (${ids}) installed by the site.`) });
    }
  }

  return (
    <Card>
      <Header>
        <h3>Marketing</h3>
        <button onClick={() => navigate('/addons/cookie-notice')}>{L('Cookies', 'Cookies')} <ArrowRight size={14} /></button>
      </Header>
      <Body>
        {consent.available && total > 0 && (
          <div>
            <SectionLabel>{L(`Cookies — ${total} visitantes, últimos 30 dias`, `Cookies — ${total} visitors, last 30 days`)}</SectionLabel>
            <ConsentBar>
              <span style={{ width: `${pct(consent.all)}%`, background: GREEN }} />
              <span style={{ width: `${pct(consent.custom)}%`, background: AMBER }} />
              <span style={{ width: `${pct(consent.rejected)}%`, background: RED }} />
            </ConsentBar>
            <Legend>
              <span><i style={{ background: GREEN }} />{L('Aceitaram tudo', 'Accepted all')} {pct(consent.all)}%</span>
              <span><i style={{ background: AMBER }} />{L('Personalizaram', 'Customised')} {pct(consent.custom)}%</span>
              <span><i style={{ background: RED }} />{L('Rejeitaram', 'Rejected')} {pct(consent.rejected)}%</span>
            </Legend>
          </div>
        )}
        <div>
          <SectionLabel>{L('Conversões este mês', 'Conversions this month')}</SectionLabel>
          <Numbers>
            <div><b>{n(conversions.leads)}</b><small>{L('Contactos', 'Leads')}</small></div>
            <div><b>{n(conversions.signups)}</b><small>Newsletter</small></div>
            <div><b>{n(conversions.orders)}</b><small>{L('Encomendas pagas', 'Paid orders')}</small></div>
          </Numbers>
        </div>
        {lines.length > 0 && (
          <Status>
            {lines.map((l, i) => (
              <div key={i}>{l.ok ? <CheckCircle className="ok" /> : <AlertCircle className="warn" />}<span>{l.text}</span></div>
            ))}
          </Status>
        )}
      </Body>
    </Card>
  );
}
