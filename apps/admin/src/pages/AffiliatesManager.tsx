/**
 * Affiliates Manager
 * List of business partners with current commission balance and quick actions.
 * Add/edit affiliates is handled by the generic entries editor at /content/affiliates.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { Handshake, Plus, RefreshCw, FileText, Eye, Download, AlertCircle } from 'lucide-react';
import { colors, spacing, typography, borders } from '../shared/styles/design-tokens';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import { getAddon } from '../config/addons-registry';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Container = styled.div`
  max-width: 1200px;
  animation: ${fadeIn} 0.4s ease-out;
`;

const Header = styled.header`
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: ${spacing[6]};
  h1 { font-size: ${typography.fontSize['3xl']}; font-weight: ${typography.fontWeight.bold}; margin: 0 0 ${spacing[1]}; color: ${colors.gray[900]}; }
  p { font-size: ${typography.fontSize.sm}; color: ${colors.gray[500]}; margin: 0; }
`;

const HeaderActions = styled.div`
  display: flex; gap: ${spacing[2]};
`;

const Btn = styled.button<{ $variant?: 'primary' | 'ghost' }>`
  display: inline-flex; align-items: center; gap: ${spacing[2]};
  padding: ${spacing[2]} ${spacing[3]};
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.sm}; font-weight: 500;
  cursor: pointer; font-family: ${typography.fontFamily.sans};
  border: 1px solid ${p => p.$variant === 'primary' ? colors.accent[500] : colors.gray[200]};
  background: ${p => p.$variant === 'primary' ? colors.accent[500] : colors.white};
  color: ${p => p.$variant === 'primary' ? '#fff' : colors.gray[700]};
  transition: all 0.15s;
  svg { width: 16px; height: 16px; }
  &:hover {
    background: ${p => p.$variant === 'primary' ? colors.accent[600] : colors.gray[50]};
  }
`;

const TableWrap = styled.div`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${typography.fontSize.sm};
  th {
    text-align: left; padding: ${spacing[3]} ${spacing[4]};
    background: ${colors.gray[50]};
    font-weight: ${typography.fontWeight.semibold};
    color: ${colors.gray[600]};
    border-bottom: 1px solid ${colors.gray[200]};
    font-size: ${typography.fontSize.xs};
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  td {
    padding: ${spacing[3]} ${spacing[4]};
    border-bottom: 1px solid ${colors.gray[100]};
    color: ${colors.gray[800]};
  }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: ${colors.gray[50]}; }
`;

const Badge = styled.span<{ $tone: 'green' | 'yellow' | 'gray' }>`
  display: inline-block;
  padding: 2px ${spacing[2]};
  border-radius: ${borders.radius.full};
  font-size: ${typography.fontSize.xs};
  font-weight: 600;
  background: ${p => p.$tone === 'green' ? '#dcfce7' : p.$tone === 'yellow' ? '#fef3c7' : '#f3f4f6'};
  color: ${p => p.$tone === 'green' ? '#166534' : p.$tone === 'yellow' ? '#92400e' : '#4b5563'};
`;

const Empty = styled.div`
  padding: ${spacing[10]};
  text-align: center;
  color: ${colors.gray[500]};
  svg { width: 40px; height: 40px; margin-bottom: ${spacing[3]}; opacity: 0.5; }
  h3 { margin: 0 0 ${spacing[2]}; color: ${colors.gray[700]}; font-size: ${typography.fontSize.lg}; }
  p { margin: 0 0 ${spacing[4]}; font-size: ${typography.fontSize.sm}; }
`;

const InstallBanner = styled.div`
  padding: ${spacing[10]};
  text-align: center;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: ${borders.radius.xl};
  svg.warn { width: 40px; height: 40px; color: #b45309; margin-bottom: ${spacing[3]}; }
  h3 { margin: 0 0 ${spacing[2]}; color: #78350f; font-size: ${typography.fontSize.lg}; }
  p { margin: 0 auto ${spacing[4]}; max-width: 480px; color: #78350f; font-size: ${typography.fontSize.sm}; line-height: 1.55; }
`;

interface AffiliateRow {
  id: string;
  name: string;
  email: string;
  commission_rate: number;
  status: string;
  payment_method: string;
  balance_cents: number;
  currency: string;
}

const formatEUR = (cents: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(cents / 100);

export const AffiliatesManager = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState<AffiliateRow[]>([]);
  const [loading, setLoading] = useState(true);
  // The Affiliates add-on stores its data in two custom collections
  // (affiliates + commission-ledger). If either is missing the new-entry
  // editor will hard-fail with "Collection not found" — detect that up
  // front and render an install CTA instead of pushing the user into a
  // broken page.
  const [needsInstall, setNeedsInstall] = useState(false);
  const [installing, setInstalling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // Probe collection existence first — getAffiliates returns [] for both
    // "no rows" and "collection missing", so we can't distinguish from the
    // list endpoint alone.
    const aff = await api.getCollection('affiliates');
    const ledger = await api.getCollection('commission-ledger');
    if (aff.error || ledger.error || !aff.data || !ledger.data) {
      setNeedsInstall(true);
      setLoading(false);
      return;
    }
    setNeedsInstall(false);
    const { data, error } = await api.getAffiliates();
    if (error) {
      toast.show(`Erro: ${error}`, 'error');
      setLoading(false);
      return;
    }
    setRows(data || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleInstall = async () => {
    const addon = getAddon('affiliates');
    if (!addon) {
      toast.show('Definição do add-on não encontrada', 'error');
      return;
    }
    setInstalling(true);
    try {
      for (const col of addon.collections) {
        const { error } = await api.createCollection({
          name: col.name, slug: col.slug, description: col.description,
          type: col.type, fields: col.fields,
        });
        // Already-exists is fine — the other collection might still be
        // missing, so don't bail on the loop.
        if (error && !error.toLowerCase().includes('already exists')) {
          throw new Error(error);
        }
      }
      toast.show('Add-on instalado', 'success');
      await load();
    } catch (err: any) {
      toast.show(`Falha ao instalar: ${err.message}`, 'error');
    } finally {
      setInstalling(false);
    }
  };

  return (
    <Container>
      <Header>
        <div>
          <h1>Afiliados</h1>
          <p>Parceiros de negócio que recebem comissão sobre vendas com cupão associado.</p>
        </div>
        <HeaderActions>
          <Btn onClick={load} disabled={loading}>
            <RefreshCw style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Atualizar
          </Btn>
          <Btn onClick={() => navigate('/affiliates/report')} disabled={needsInstall}>
            <FileText />
            Relatório mensal
          </Btn>
          <Btn $variant="primary" onClick={() => navigate('/content/affiliates/new')} disabled={needsInstall}>
            <Plus />
            Novo afiliado
          </Btn>
        </HeaderActions>
      </Header>

      {needsInstall ? (
        <InstallBanner>
          <AlertCircle className="warn" />
          <h3>Add-on por instalar neste tenant</h3>
          <p>
            Os Afiliados precisam das coleções <strong>affiliates</strong> e <strong>commission-ledger</strong>,
            que ainda não existem aqui. Clica para criá-las agora — depois podes registar o primeiro afiliado.
          </p>
          <Btn $variant="primary" onClick={handleInstall} disabled={installing}>
            <Download style={{ animation: installing ? 'spin 1s linear infinite' : 'none' }} />
            {installing ? 'A instalar…' : 'Instalar add-on'}
          </Btn>
        </InstallBanner>
      ) : (
      <TableWrap>
        {rows.length === 0 && !loading ? (
          <Empty>
            <Handshake />
            <h3>Sem afiliados registados</h3>
            <p>Cria o primeiro afiliado e associa-lhe um cupão para começar a registar comissões.</p>
            <Btn $variant="primary" onClick={() => navigate('/content/affiliates/new')}>
              <Plus /> Criar primeiro afiliado
            </Btn>
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Comissão</th>
                <th>Método</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Saldo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.name || '—'}</td>
                  <td>{r.email}</td>
                  <td>{r.commission_rate}%</td>
                  <td>{r.payment_method || '—'}</td>
                  <td>
                    <Badge $tone={r.status === 'active' ? 'green' : r.status === 'paused' ? 'yellow' : 'gray'}>
                      {r.status}
                    </Badge>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {formatEUR(r.balance_cents)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Btn onClick={() => navigate(`/affiliates/${r.id}`)}>
                      <Eye /> Ver ledger
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableWrap>
      )}
    </Container>
  );
};
