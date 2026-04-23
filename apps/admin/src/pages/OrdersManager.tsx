/**
 * Orders Manager
 * Unified view of all checkout orders (bookings + products + custom line items).
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import {
  ShoppingBag, CreditCard, Clock, CheckCircle, XCircle,
  RefreshCw, Filter, ChevronLeft, ChevronRight, Mail, Phone,
  Package, CalendarCheck, AlertCircle,
} from 'lucide-react';
import { colors, spacing, typography, borders, shadows } from '../shared/styles/design-tokens';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Container = styled.div`
  max-width: 1200px;
  animation: ${fadeIn} 0.4s ease-out;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: ${spacing[6]};

  h1 { font-size: ${typography.fontSize['3xl']}; font-weight: ${typography.fontWeight.bold}; margin: 0 0 ${spacing[1]}; color: ${colors.gray[900]}; }
  p { font-size: ${typography.fontSize.sm}; color: ${colors.gray[500]}; margin: 0; }
`;

const IconBtn = styled.button`
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  padding: ${spacing[2]} ${spacing[3]};
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.sm};
  font-weight: 500;
  cursor: pointer;
  border: 1px solid ${colors.gray[200]};
  background: ${colors.white};
  color: ${colors.gray[700]};
  font-family: ${typography.fontFamily.sans};
  transition: all 0.15s;
  svg { width: 16px; height: 16px; }
  &:hover { background: ${colors.gray[50]}; border-color: ${colors.gray[300]}; }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${spacing[4]};
  margin-bottom: ${spacing[6]};
  animation: ${fadeIn} 0.4s ease-out 50ms backwards;
`;

const StatCard = styled.div<{ $color: string }>`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  padding: ${spacing[5]};
  display: flex;
  align-items: center;
  gap: ${spacing[4]};

  .stat-icon {
    width: 48px; height: 48px;
    border-radius: ${borders.radius.lg};
    background: ${p => p.$color}15;
    color: ${p => p.$color};
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    svg { width: 24px; height: 24px; }
  }
  .stat-value { font-size: ${typography.fontSize['2xl']}; font-weight: ${typography.fontWeight.bold}; color: ${colors.gray[900]}; line-height: 1; }
  .stat-label { font-size: 12px; color: ${colors.gray[500]}; margin-top: 2px; }
`;

const FiltersBar = styled.div`
  display: flex;
  gap: ${spacing[3]};
  margin-bottom: ${spacing[4]};
  flex-wrap: wrap;
  align-items: center;
`;

const FilterChip = styled.button<{ $active?: boolean }>`
  padding: ${spacing[1.5]} ${spacing[3]};
  border-radius: 99px;
  font-size: ${typography.fontSize.sm};
  font-weight: 500;
  cursor: pointer;
  border: 1px solid ${p => p.$active ? colors.accent[300] : colors.gray[200]};
  background: ${p => p.$active ? colors.accent[50] : colors.white};
  color: ${p => p.$active ? colors.accent[700] : colors.gray[600]};
  font-family: ${typography.fontFamily.sans};
  transition: all 0.15s;
  &:hover { border-color: ${colors.accent[300]}; background: ${colors.accent[50]}; }
`;

const TableWrapper = styled.div`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;

  th {
    text-align: left;
    padding: ${spacing[3]} ${spacing[4]};
    font-size: 12px;
    font-weight: 600;
    color: ${colors.gray[500]};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: ${colors.gray[50]};
    border-bottom: 1px solid ${colors.gray[200]};
  }

  td {
    padding: ${spacing[3]} ${spacing[4]};
    font-size: ${typography.fontSize.sm};
    color: ${colors.gray[700]};
    border-bottom: 1px solid ${colors.gray[100]};
    vertical-align: middle;
  }

  tr:last-child td { border-bottom: none; }
  tr:hover td { background: ${colors.gray[50]}; }
`;

const StatusBadge = styled.span<{ $status: string }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  svg { width: 14px; height: 14px; }

  ${p => {
    switch (p.$status) {
      case 'confirmed': return `background: ${colors.green[50]}; color: ${colors.green[700]};`;
      case 'pending': return `background: ${colors.yellow[50]}; color: ${colors.yellow[700]};`;
      case 'cancelled': return `background: ${colors.red[50]}; color: ${colors.red[700]};`;
      case 'refunded': return `background: ${colors.gray[100]}; color: ${colors.gray[700]};`;
      case 'expired': return `background: ${colors.gray[100]}; color: ${colors.gray[500]};`;
      default: return `background: ${colors.gray[100]}; color: ${colors.gray[600]};`;
    }
  }}
`;

const LineItemTag = styled.span<{ $type: string }>`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: ${borders.radius.sm};
  font-size: 11px;
  font-weight: 500;
  svg { width: 11px; height: 11px; }

  ${p => {
    switch (p.$type) {
      case 'booking': return `background: #ea580c15; color: #ea580c;`;
      case 'product': return `background: #6366f115; color: #6366f1;`;
      case 'custom': return `background: ${colors.gray[100]}; color: ${colors.gray[600]};`;
      default: return `background: ${colors.gray[100]}; color: ${colors.gray[600]};`;
    }
  }}
`;

const CustomerInfo = styled.div`
  .customer-name { font-weight: 600; color: ${colors.gray[900]}; }
  .customer-contact {
    display: flex;
    gap: ${spacing[2]};
    margin-top: 2px;
    font-size: 12px;
    color: ${colors.gray[500]};
    svg { width: 12px; height: 12px; flex-shrink: 0; margin-top: 1px; }
  }
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${spacing[3]} ${spacing[4]};
  border-top: 1px solid ${colors.gray[200]};
  font-size: ${typography.fontSize.sm};
  color: ${colors.gray[500]};
`;

const PageBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px; height: 32px;
  border-radius: ${borders.radius.md};
  border: 1px solid ${colors.gray[200]};
  background: ${colors.white};
  cursor: pointer;
  color: ${colors.gray[600]};
  svg { width: 16px; height: 16px; }
  &:hover { background: ${colors.gray[50]}; }
  &:disabled { opacity: 0.3; cursor: not-allowed; }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${spacing[12]} ${spacing[4]};
  color: ${colors.gray[400]};
  svg { margin-bottom: ${spacing[3]}; }
  p:first-of-type { font-weight: 500; color: ${colors.gray[600]}; margin-bottom: ${spacing[1]}; }
  p { font-size: ${typography.fontSize.sm}; }
`;

const STATUS_FILTERS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'refunded', label: 'Refunded' },
];

const PAGE_SIZE = 25;

function parseLineItems(raw: any): Array<{ type: string; label: string; total: number; quantity: number }> {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

export const OrdersManager = () => {
  const toast = useToast();
  const navigate = useNavigate();

  const [stats, setStats] = useState({ total: 0, pending: 0, confirmed: 0, cancelled: 0, revenue: 0 });
  const [orders, setOrders] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    const { data } = await api.getCheckoutStats();
    if (data) setStats(data);
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = {
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    };
    if (statusFilter) params.status = statusFilter;
    const { data, meta, error } = await api.getOrders(params);
    if (error) toast.error(error);
    setOrders(data || []);
    setTotalCount(meta?.pagination?.total || 0);
    setLoading(false);
  }, [statusFilter, page, toast]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const formatCurrency = (cents: number, currency = 'eur') =>
    new Intl.NumberFormat('pt-PT', { style: 'currency', currency: currency.toUpperCase() })
      .format((cents || 0) / 100);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'confirmed': return <CheckCircle />;
      case 'pending': return <Clock />;
      case 'cancelled': return <XCircle />;
      case 'refunded': return <RefreshCw />;
      default: return <AlertCircle />;
    }
  };

  const lineItemIcon = (type: string) => {
    switch (type) {
      case 'booking': return <CalendarCheck />;
      case 'product': return <Package />;
      case 'custom': return <ShoppingBag />;
      default: return null;
    }
  };

  return (
    <Container>
      <Header>
        <div>
          <h1>Orders</h1>
          <p>Unified checkout — bookings, products, and custom charges</p>
        </div>
        <IconBtn onClick={() => { fetchStats(); fetchOrders(); }}>
          <RefreshCw /> Refresh
        </IconBtn>
      </Header>

      <StatsGrid>
        <StatCard $color={colors.accent[500]}>
          <div className="stat-icon"><ShoppingBag /></div>
          <div>
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Total Orders</div>
          </div>
        </StatCard>
        <StatCard $color="#eab308">
          <div className="stat-icon"><Clock /></div>
          <div>
            <div className="stat-value">{stats.pending}</div>
            <div className="stat-label">Pending</div>
          </div>
        </StatCard>
        <StatCard $color={colors.green[500]}>
          <div className="stat-icon"><CheckCircle /></div>
          <div>
            <div className="stat-value">{stats.confirmed}</div>
            <div className="stat-label">Confirmed</div>
          </div>
        </StatCard>
        <StatCard $color={colors.accent[600]}>
          <div className="stat-icon"><CreditCard /></div>
          <div>
            <div className="stat-value">{formatCurrency(stats.revenue)}</div>
            <div className="stat-label">Revenue</div>
          </div>
        </StatCard>
      </StatsGrid>

      <FiltersBar>
        <Filter size={16} style={{ color: colors.gray[400] }} />
        {STATUS_FILTERS.map(f => (
          <FilterChip
            key={f.key}
            $active={statusFilter === f.key}
            onClick={() => { setStatusFilter(f.key); setPage(0); }}
          >
            {f.label}
          </FilterChip>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 13, color: colors.gray[400] }}>
          {totalCount} order{totalCount !== 1 ? 's' : ''}
        </span>
      </FiltersBar>

      <TableWrapper>
        {orders.length > 0 ? (
          <>
            <Table>
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Line items</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => {
                  const c = order.content || {};
                  const items = parseLineItems(c.line_items);
                  const typeCounts: Record<string, number> = {};
                  for (const it of items) typeCounts[it.type] = (typeCounts[it.type] || 0) + 1;

                  return (
                    <tr key={order.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{c.order_number || '—'}</td>
                      <td>
                        <CustomerInfo>
                          <div className="customer-name">{c.customer_name || '—'}</div>
                          {c.customer_email && <div className="customer-contact"><Mail />{c.customer_email}</div>}
                          {c.customer_phone && <div className="customer-contact"><Phone />{c.customer_phone}</div>}
                        </CustomerInfo>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {Object.entries(typeCounts).map(([type, count]) => (
                            <LineItemTag key={type} $type={type}>
                              {lineItemIcon(type)}
                              {count} {type}{count !== 1 ? 's' : ''}
                            </LineItemTag>
                          ))}
                          {items.length === 0 && <span style={{ color: colors.gray[400], fontSize: 12 }}>—</span>}
                        </div>
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {c.total != null ? formatCurrency(c.total, c.currency) : '—'}
                        {c.discount_amount > 0 && (
                          <div style={{ fontSize: 11, color: colors.gray[500], fontWeight: 400 }}>
                            −{formatCurrency(c.discount_amount, c.currency)} {c.coupon_code ? `(${c.coupon_code})` : ''}
                          </div>
                        )}
                      </td>
                      <td>
                        <StatusBadge $status={c.status || 'pending'}>
                          {statusIcon(c.status || 'pending')}
                          {c.status || 'pending'}
                        </StatusBadge>
                      </td>
                      <td style={{ fontSize: 12, color: colors.gray[500] }}>
                        {new Date(order.created_at).toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <IconBtn onClick={() => navigate(`/content/orders/edit/${order.id}`)}>
                          Details
                        </IconBtn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>

            {totalPages > 1 && (
              <Pagination>
                <span>Page {page + 1} of {totalPages}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <PageBtn onClick={() => setPage(p => p - 1)} disabled={page === 0}><ChevronLeft /></PageBtn>
                  <PageBtn onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}><ChevronRight /></PageBtn>
                </div>
              </Pagination>
            )}
          </>
        ) : (
          <EmptyState>
            <ShoppingBag size={48} />
            <p>{loading ? 'Loading orders...' : 'No orders found'}</p>
            <p>{!loading && 'Orders will appear here when customers complete checkout'}</p>
          </EmptyState>
        )}
      </TableWrapper>
    </Container>
  );
};
