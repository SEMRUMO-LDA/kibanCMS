/**
 * Commission Report
 * Monthly commission breakdown per affiliate, CSV export, and mark-as-paid.
 * Balances below the affiliate's minimum payout threshold are flagged
 * "carry over" — they are NOT paid out and roll into next month.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { ArrowLeft, RefreshCw, Download, DollarSign, AlertCircle } from 'lucide-react';
import { colors, spacing, typography, borders } from '../shared/styles/design-tokens';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';

const fadeIn = keyframes`from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); }`;

const Container = styled.div`max-width: 1300px; animation: ${fadeIn} 0.4s ease-out;`;

const Header = styled.header`
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: ${spacing[6]};
  h1 { font-size: ${typography.fontSize['3xl']}; font-weight: ${typography.fontWeight.bold}; margin: 0 0 ${spacing[1]}; color: ${colors.gray[900]}; }
  p { font-size: ${typography.fontSize.sm}; color: ${colors.gray[500]}; margin: 0; }
`;

const HeaderActions = styled.div`display: flex; gap: ${spacing[2]}; align-items: center;`;

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

const MonthInput = styled.input`
  padding: ${spacing[2]} ${spacing[3]};
  border-radius: ${borders.radius.md};
  border: 1px solid ${colors.gray[300]};
  font-family: ${typography.fontFamily.sans};
  font-size: ${typography.fontSize.sm};
`;

const TableWrap = styled.div`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  overflow: auto;
`;

const Table = styled.table`
  width: 100%; border-collapse: collapse; font-size: ${typography.fontSize.sm};
  min-width: 900px;
  th { text-align: left; padding: ${spacing[3]} ${spacing[4]}; background: ${colors.gray[50]}; font-weight: ${typography.fontWeight.semibold}; color: ${colors.gray[600]}; border-bottom: 1px solid ${colors.gray[200]}; font-size: ${typography.fontSize.xs}; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }
  td { padding: ${spacing[3]} ${spacing[4]}; border-bottom: 1px solid ${colors.gray[100]}; color: ${colors.gray[800]}; }
  tr:last-child td { border-bottom: none; }
`;

const Pill = styled.span<{ $tone: 'green' | 'amber' | 'gray' }>`
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px ${spacing[2]};
  border-radius: ${borders.radius.full};
  font-size: ${typography.fontSize.xs}; font-weight: 600;
  background: ${p => p.$tone === 'green' ? '#dcfce7' : p.$tone === 'amber' ? '#fef3c7' : '#f3f4f6'};
  color: ${p => p.$tone === 'green' ? '#166534' : p.$tone === 'amber' ? '#92400e' : '#4b5563'};
  svg { width: 12px; height: 12px; }
`;

interface ReportRow {
  affiliate_id: string;
  name: string;
  email: string;
  commission_rate: number;
  payment_method: string;
  iban: string;
  payment_details: string;
  tax_id: string;
  status: string;
  orders_in_month: number;
  accruals_cents: number;
  reversals_cents: number;
  payouts_cents: number;
  net_month_cents: number;
  balance_cents: number;
  currency: string;
  min_payout_eur: number;
  payable: boolean;
}

const formatEUR = (cents: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(cents / 100);

const currentMonthIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const CommissionReport = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [month, setMonth] = useState(currentMonthIso());
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalMinPayout, setGlobalMinPayout] = useState(100);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error, meta } = await api.getAffiliateReport(month);
    if (error) {
      toast.show(`Erro: ${error}`, 'error');
      setLoading(false);
      return;
    }
    setRows((data as unknown as ReportRow[]) || []);
    if (meta?.global_min_payout_eur != null) setGlobalMinPayout(meta.global_min_payout_eur);
    setLoading(false);
  }, [month, toast]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = () => {
    if (rows.length === 0) return;
    const header = [
      'Affiliate', 'Email', 'Tax ID', 'Commission %', 'Payment Method', 'IBAN', 'Payment Details',
      'Orders (month)', 'Accruals (€)', 'Reversals (€)', 'Net (month) (€)',
      'Balance (€)', 'Min Payout (€)', 'Payable',
    ];
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [header.map(escape).join(',')];
    for (const r of rows) {
      lines.push([
        r.name, r.email, r.tax_id, r.commission_rate, r.payment_method, r.iban, r.payment_details,
        r.orders_in_month,
        (r.accruals_cents / 100).toFixed(2),
        (r.reversals_cents / 100).toFixed(2),
        (r.net_month_cents / 100).toFixed(2),
        (r.balance_cents / 100).toFixed(2),
        r.min_payout_eur.toFixed(2),
        r.payable ? 'YES' : 'NO',
      ].map(v => escape(String(v))).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commissions-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const markPaid = async (r: ReportRow) => {
    if (!r.payable) {
      toast.show(`Saldo abaixo do mínimo (€${r.min_payout_eur}) — transita para o próximo mês.`, 'info');
      return;
    }
    const confirmed = window.confirm(
      `Confirmar pagamento de ${formatEUR(r.balance_cents)} a ${r.name}?\n\nSerá registada uma linha de payout no ledger e o saldo será zerado.`,
    );
    if (!confirmed) return;
    const notes = window.prompt('Notas (opcional — ex: "Transferência bancária ref XYZ")', `Payout ${month}`) || '';
    const { error } = await api.payoutAffiliate(r.affiliate_id, r.balance_cents, notes);
    if (error) {
      toast.show(`Erro: ${error}`, 'error');
      return;
    }
    toast.show('Pagamento registado.', 'success');
    load();
  };

  const totals = rows.reduce(
    (acc, r) => ({
      accruals: acc.accruals + r.accruals_cents,
      reversals: acc.reversals + r.reversals_cents,
      net: acc.net + r.net_month_cents,
      balance: acc.balance + r.balance_cents,
      payable: acc.payable + (r.payable ? r.balance_cents : 0),
    }),
    { accruals: 0, reversals: 0, net: 0, balance: 0, payable: 0 },
  );

  return (
    <Container>
      <Header>
        <div>
          <Btn onClick={() => navigate('/affiliates')} style={{ marginBottom: spacing[3] }}>
            <ArrowLeft /> Afiliados
          </Btn>
          <h1>Relatório de Comissões</h1>
          <p>
            Saldos abaixo do mínimo de pagamento (default global: €{globalMinPayout}) transitam automaticamente para o mês seguinte. Cada afiliado pode ter um mínimo próprio definido no seu perfil.
          </p>
        </div>
        <HeaderActions>
          <MonthInput
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
          />
          <Btn onClick={load} disabled={loading}>
            <RefreshCw /> Atualizar
          </Btn>
          <Btn onClick={exportCsv} disabled={rows.length === 0}>
            <Download /> Export CSV
          </Btn>
        </HeaderActions>
      </Header>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: spacing[4], marginBottom: spacing[6],
      }}>
        <SummaryCard label="Acumulado no mês" value={formatEUR(totals.accruals)} />
        <SummaryCard label="Reversões no mês" value={formatEUR(totals.reversals)} />
        <SummaryCard label="Líquido do mês" value={formatEUR(totals.net)} />
        <SummaryCard label="Saldo total a pagar" value={formatEUR(totals.balance)} />
        <SummaryCard label="Pagável agora (≥ mín.)" value={formatEUR(totals.payable)} accent="#10b981" />
      </div>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <th>Afiliado</th>
              <th style={{ textAlign: 'right' }}>Orders</th>
              <th style={{ textAlign: 'right' }}>Acumulado</th>
              <th style={{ textAlign: 'right' }}>Reversões</th>
              <th style={{ textAlign: 'right' }}>Líquido (mês)</th>
              <th style={{ textAlign: 'right' }}>Saldo total</th>
              <th>Estado</th>
              <th style={{ textAlign: 'right' }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: spacing[6], color: colors.gray[500] }}>
                {loading ? 'A carregar…' : 'Sem dados para este mês.'}
              </td></tr>
            ) : rows.map(r => (
              <tr key={r.affiliate_id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontSize: typography.fontSize.xs, color: colors.gray[500] }}>
                    {r.email} · {r.commission_rate}% · {r.payment_method || '—'}
                  </div>
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.orders_in_month}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatEUR(r.accruals_cents)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.reversals_cents > 0 ? '#991b1b' : colors.gray[500] }}>
                  {r.reversals_cents > 0 ? `−${formatEUR(r.reversals_cents)}` : formatEUR(0)}
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {formatEUR(r.net_month_cents)}
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                  {formatEUR(r.balance_cents)}
                </td>
                <td>
                  {r.payable ? (
                    <Pill $tone="green">Pagável</Pill>
                  ) : r.balance_cents > 0 ? (
                    <Pill $tone="amber"><AlertCircle /> Carry over (mín. €{r.min_payout_eur})</Pill>
                  ) : (
                    <Pill $tone="gray">—</Pill>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <Btn $variant="primary" disabled={!r.payable} onClick={() => markPaid(r)}>
                    <DollarSign /> Marcar pago
                  </Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </Container>
  );
};

const SummaryCard = ({ label, value, accent }: { label: string; value: string; accent?: string }) => (
  <div style={{
    background: colors.white, border: `1px solid ${colors.gray[200]}`,
    borderLeft: `4px solid ${accent || colors.accent[500]}`,
    borderRadius: borders.radius.lg,
    padding: `${spacing[4]} ${spacing[5]}`,
  }}>
    <div style={{ fontSize: typography.fontSize.xs, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.gray[500], marginBottom: spacing[1] }}>{label}</div>
    <div style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.gray[900], fontVariantNumeric: 'tabular-nums' }}>{value}</div>
  </div>
);
