/**
 * Affiliate Detail
 * Shows the commission ledger for one affiliate, lifetime totals, and the
 * "record payout" action. Edit the affiliate profile via /content/affiliates/edit/:id.
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { ArrowLeft, RefreshCw, Edit, DollarSign } from 'lucide-react';
import { colors, spacing, typography, borders } from '../shared/styles/design-tokens';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';

const fadeIn = keyframes`from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); }`;

const Container = styled.div`max-width: 1200px; animation: ${fadeIn} 0.4s ease-out;`;

const Header = styled.header`
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: ${spacing[6]};
  h1 { font-size: ${typography.fontSize['3xl']}; font-weight: ${typography.fontWeight.bold}; margin: 0 0 ${spacing[1]}; color: ${colors.gray[900]}; }
  .meta { font-size: ${typography.fontSize.sm}; color: ${colors.gray[500]}; }
`;

const HeaderActions = styled.div`display: flex; gap: ${spacing[2]};`;

const Btn = styled.button<{ $variant?: 'primary' | 'ghost' }>`
  display: inline-flex; align-items: center; gap: ${spacing[2]};
  padding: ${spacing[2]} ${spacing[3]};
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

const Stats = styled.div`
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${spacing[4]}; margin-bottom: ${spacing[6]};
`;
const StatCard = styled.div<{ $accent?: string }>`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-left: 4px solid ${p => p.$accent || colors.accent[500]};
  border-radius: ${borders.radius.lg};
  padding: ${spacing[4]} ${spacing[5]};
  .label { font-size: ${typography.fontSize.xs}; text-transform: uppercase; letter-spacing: 0.05em; color: ${colors.gray[500]}; margin-bottom: ${spacing[1]}; }
  .value { font-size: ${typography.fontSize['2xl']}; font-weight: ${typography.fontWeight.bold}; color: ${colors.gray[900]}; font-variant-numeric: tabular-nums; }
`;

const TableWrap = styled.div`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%; border-collapse: collapse; font-size: ${typography.fontSize.sm};
  th { text-align: left; padding: ${spacing[3]} ${spacing[4]}; background: ${colors.gray[50]}; font-weight: ${typography.fontWeight.semibold}; color: ${colors.gray[600]}; border-bottom: 1px solid ${colors.gray[200]}; font-size: ${typography.fontSize.xs}; text-transform: uppercase; letter-spacing: 0.05em; }
  td { padding: ${spacing[3]} ${spacing[4]}; border-bottom: 1px solid ${colors.gray[100]}; color: ${colors.gray[800]}; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
`;

const TypeBadge = styled.span<{ $type: string }>`
  display: inline-block; padding: 2px ${spacing[2]};
  border-radius: ${borders.radius.full};
  font-size: ${typography.fontSize.xs}; font-weight: 600;
  background: ${p =>
    p.$type === 'accrual' ? '#dcfce7' :
    p.$type === 'reversal' ? '#fee2e2' :
    p.$type === 'payout' ? '#dbeafe' : '#f3f4f6'};
  color: ${p =>
    p.$type === 'accrual' ? '#166534' :
    p.$type === 'reversal' ? '#991b1b' :
    p.$type === 'payout' ? '#1e40af' : '#4b5563'};
`;

interface LedgerRow {
  id: string;
  type: 'accrual' | 'reversal' | 'payout' | 'adjustment';
  amount_cents: number;
  currency: string;
  period: string;
  status: string;
  created_at: string;
  coupon_code?: string;
  order_id?: string;
  booking_id?: string;
  commission_rate_snapshot?: number;
  order_total_cents_snapshot?: number;
  notes?: string;
}

interface AffiliateInfo {
  id: string;
  name: string;
  email: string;
  commission_rate: number;
  status: string;
  payment_method: string;
  iban?: string;
  payment_details?: string;
  balance_cents: number;
  total_accruals_cents: number;
  total_payouts_cents: number;
}

const formatEUR = (cents: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(cents / 100);

const formatDate = (iso: string) => {
  try { return new Date(iso).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso; }
};

export const AffiliateDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [info, setInfo] = useState<AffiliateInfo | null>(null);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [a, l] = await Promise.all([api.getAffiliate(id), api.getAffiliateLedger(id)]);
    if (a.error) toast.show(`Erro afiliado: ${a.error}`, 'error');
    if (l.error) toast.show(`Erro ledger: ${l.error}`, 'error');
    setInfo(a.data || null);
    setRows(l.data || []);
    setLoading(false);
  }, [id, toast]);

  useEffect(() => { load(); }, [load]);

  const recordPayout = async () => {
    if (!info) return;
    if (info.balance_cents <= 0) {
      toast.show('Saldo a zero — nada para pagar.', 'info');
      return;
    }
    const value = window.prompt(
      `Registar pagamento ao afiliado ${info.name}.\n\nValor (€) a pagar — saldo atual: ${formatEUR(info.balance_cents)}`,
      (info.balance_cents / 100).toFixed(2),
    );
    if (!value) return;
    const eur = Number(value.replace(',', '.'));
    if (!Number.isFinite(eur) || eur <= 0) {
      toast.show('Valor inválido', 'error');
      return;
    }
    const notes = window.prompt('Notas (opcional — ex: "Bank transfer ref XYZ")', '') || '';
    const cents = Math.round(eur * 100);
    const { error } = await api.payoutAffiliate(info.id, cents, notes);
    if (error) {
      toast.show(`Erro: ${error}`, 'error');
      return;
    }
    toast.show('Pagamento registado.', 'success');
    load();
  };

  if (loading && !info) return <Container><p style={{ color: colors.gray[500] }}>A carregar…</p></Container>;
  if (!info) return <Container><p style={{ color: colors.gray[500] }}>Afiliado não encontrado.</p></Container>;

  return (
    <Container>
      <Header>
        <div>
          <Btn onClick={() => navigate('/affiliates')} style={{ marginBottom: spacing[3] }}>
            <ArrowLeft /> Afiliados
          </Btn>
          <h1>{info.name}</h1>
          <div className="meta">
            {info.email} · Comissão {info.commission_rate}% · {info.payment_method || 'Sem método de pagamento definido'}
            {info.iban ? ` · IBAN ${info.iban}` : ''}
            {info.payment_details ? ` · ${info.payment_details}` : ''}
          </div>
        </div>
        <HeaderActions>
          <Btn onClick={load} disabled={loading}>
            <RefreshCw />
            Atualizar
          </Btn>
          <Btn onClick={() => navigate(`/content/affiliates/edit/${info.id}`)}>
            <Edit />
            Editar perfil
          </Btn>
          <Btn $variant="primary" onClick={recordPayout} disabled={info.balance_cents <= 0}>
            <DollarSign />
            Registar pagamento
          </Btn>
        </HeaderActions>
      </Header>

      <Stats>
        <StatCard $accent="#10b981">
          <div className="label">Saldo a pagar</div>
          <div className="value">{formatEUR(info.balance_cents)}</div>
        </StatCard>
        <StatCard $accent="#6366f1">
          <div className="label">Total acumulado (lifetime)</div>
          <div className="value">{formatEUR(info.total_accruals_cents)}</div>
        </StatCard>
        <StatCard $accent="#0ea5e9">
          <div className="label">Total pago (lifetime)</div>
          <div className="value">{formatEUR(info.total_payouts_cents)}</div>
        </StatCard>
      </Stats>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Período</th>
              <th>Cupão</th>
              <th>Order / Booking</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th style={{ textAlign: 'right' }}>%</th>
              <th style={{ textAlign: 'right' }}>Comissão</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: spacing[6], color: colors.gray[500] }}>Sem movimentos no ledger.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td>{formatDate(r.created_at)}</td>
                <td><TypeBadge $type={r.type}>{r.type}</TypeBadge></td>
                <td>{r.period}</td>
                <td>{r.coupon_code || '—'}</td>
                <td style={{ fontSize: typography.fontSize.xs, color: colors.gray[600] }}>
                  {r.order_id ? `Order ${r.order_id.slice(0, 8)}` : r.booking_id ? `Booking ${r.booking_id.slice(0, 8)}` : (r.notes || '—')}
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {r.order_total_cents_snapshot ? formatEUR(r.order_total_cents_snapshot) : '—'}
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {r.commission_rate_snapshot ? `${r.commission_rate_snapshot}%` : '—'}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: r.amount_cents >= 0 ? colors.gray[900] : '#991b1b' }}>
                  {formatEUR(r.amount_cents)}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </Container>
  );
};
