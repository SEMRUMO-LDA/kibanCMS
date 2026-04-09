/**
 * Bookings Manager
 * Dashboard for managing tour bookings with stats, filters, and quick actions.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import {
  CalendarCheck, Users, CreditCard, XCircle, CheckCircle,
  Clock, Filter, RefreshCw, ArrowRight, ChevronLeft, ChevronRight,
  MapPin, Mail, Phone, AlertCircle,
} from 'lucide-react';
import { colors, spacing, typography, borders, shadows } from '../shared/styles/design-tokens';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

// ============================================
// STYLED COMPONENTS
// ============================================

const Container = styled.div`
  max-width: 1200px;
  animation: ${fadeIn} 0.4s ease-out;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: ${spacing[6]};

  h1 {
    font-size: ${typography.fontSize['3xl']};
    font-weight: ${typography.fontWeight.bold};
    margin: 0 0 ${spacing[1]};
    color: ${colors.gray[900]};
  }
  p {
    font-size: ${typography.fontSize.sm};
    color: ${colors.gray[500]};
    margin: 0;
  }
`;

const HeaderActions = styled.div`
  display: flex;
  gap: ${spacing[2]};
`;

const IconBtn = styled.button<{ $variant?: 'ghost' | 'primary' }>`
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  padding: ${spacing[2]} ${spacing[3]};
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.sm};
  font-weight: 500;
  cursor: pointer;
  border: 1px solid ${colors.gray[200]};
  background: ${p => p.$variant === 'primary' ? colors.accent[500] : colors.white};
  color: ${p => p.$variant === 'primary' ? '#fff' : colors.gray[700]};
  font-family: ${typography.fontFamily.sans};
  transition: all 0.15s;
  svg { width: 16px; height: 16px; }

  &:hover {
    background: ${p => p.$variant === 'primary' ? colors.accent[600] : colors.gray[50]};
    border-color: ${p => p.$variant === 'primary' ? colors.accent[600] : colors.gray[300]};
  }
`;

// Stats Cards
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

  .stat-value {
    font-size: ${typography.fontSize['2xl']};
    font-weight: ${typography.fontWeight.bold};
    color: ${colors.gray[900]};
    line-height: 1;
  }
  .stat-label {
    font-size: 12px;
    color: ${colors.gray[500]};
    margin-top: 2px;
  }
`;

// Filters
const FiltersBar = styled.div`
  display: flex;
  gap: ${spacing[3]};
  margin-bottom: ${spacing[4]};
  flex-wrap: wrap;
  align-items: center;
  animation: ${fadeIn} 0.4s ease-out 100ms backwards;
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

  &:hover {
    border-color: ${colors.accent[300]};
    background: ${colors.accent[50]};
  }
`;

// Table
const TableWrapper = styled.div`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  overflow: hidden;
  animation: ${fadeIn} 0.4s ease-out 150ms backwards;
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
      default: return `background: ${colors.gray[100]}; color: ${colors.gray[600]};`;
    }
  }}
`;

const ActionBtn = styled.button<{ $color?: string }>`
  padding: 4px 10px;
  border-radius: ${borders.radius.md};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid ${p => p.$color ? p.$color + '40' : colors.gray[200]};
  background: transparent;
  color: ${p => p.$color || colors.gray[600]};
  font-family: ${typography.fontFamily.sans};
  transition: all 0.15s;
  white-space: nowrap;

  &:hover {
    background: ${p => p.$color ? p.$color + '10' : colors.gray[50]};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
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

const PaginationBtns = styled.div`
  display: flex;
  gap: ${spacing[1]};
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

// ============================================
// COMPONENT
// ============================================

const STATUS_FILTERS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const PAGE_SIZE = 20;

export const BookingsManager = () => {
  const toast = useToast();
  const navigate = useNavigate();

  const [stats, setStats] = useState({ total: 0, pending: 0, confirmed: 0, cancelled: 0, revenue: 0 });
  const [bookings, setBookings] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    const { data } = await api.getBookingStats();
    if (data) setStats(data);
  }, []);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = {
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    };
    if (statusFilter) params.status = statusFilter;

    const { data, meta } = await api.getBookingsList(params);
    setBookings(data || []);
    setTotalCount(meta?.pagination?.total || 0);
    setLoading(false);
  }, [statusFilter, page]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const handleConfirm = async (id: string) => {
    setActionLoading(id);
    const { error } = await api.confirmBooking(id);
    setActionLoading(null);
    if (error) { toast.error(error); return; }
    toast.success('Booking confirmed');
    fetchBookings();
    fetchStats();
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this booking? This action cannot be undone.')) return;
    setActionLoading(id);
    const { error } = await api.cancelBooking(id);
    setActionLoading(null);
    if (error) { toast.error(error); return; }
    toast.success('Booking cancelled');
    fetchBookings();
    fetchStats();
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const formatCurrency = (cents: number, currency = 'eur') =>
    new Intl.NumberFormat('pt-PT', { style: 'currency', currency: currency.toUpperCase() })
      .format(cents / 100);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'confirmed': return <CheckCircle />;
      case 'pending': return <Clock />;
      case 'cancelled': return <XCircle />;
      default: return <AlertCircle />;
    }
  };

  return (
    <Container>
      <Header>
        <div>
          <h1>Tours & Bookings</h1>
          <p>Manage tour reservations, payments, and availability</p>
        </div>
        <HeaderActions>
          <IconBtn onClick={() => { fetchStats(); fetchBookings(); }}>
            <RefreshCw /> Refresh
          </IconBtn>
          <IconBtn onClick={() => navigate('/content/tours')}>
            <MapPin /> Manage Tours
          </IconBtn>
        </HeaderActions>
      </Header>

      {/* Stats */}
      <StatsGrid>
        <StatCard $color={colors.accent[500]}>
          <div className="stat-icon"><CalendarCheck /></div>
          <div>
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Total Bookings</div>
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

      {/* Filters */}
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
          {totalCount} booking{totalCount !== 1 ? 's' : ''}
        </span>
      </FiltersBar>

      {/* Table */}
      <TableWrapper>
        {bookings.length > 0 ? (
          <>
            <Table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Tour</th>
                  <th>Date & Time</th>
                  <th>Guests</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map(booking => {
                  const c = booking.content || {};
                  const isActioning = actionLoading === booking.id;
                  return (
                    <tr key={booking.id}>
                      <td>
                        <CustomerInfo>
                          <div className="customer-name">{c.customer_name || '—'}</div>
                          <div className="customer-contact">
                            {c.customer_email && <><Mail />{c.customer_email}</>}
                          </div>
                          {c.customer_phone && (
                            <div className="customer-contact">
                              <Phone />{c.customer_phone}
                            </div>
                          )}
                        </CustomerInfo>
                      </td>
                      <td style={{ fontWeight: 500 }}>{c.tour_title || c.tour_slug || '—'}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{c.date || '—'}</div>
                        <div style={{ fontSize: 12, color: colors.gray[500] }}>{c.time_slot || ''}</div>
                      </td>
                      <td>
                        {c.adults || 0} adult{(c.adults || 0) !== 1 ? 's' : ''}
                        {Number(c.children) > 0 && <span style={{ color: colors.gray[500] }}>, {c.children} child{c.children !== 1 ? 'ren' : ''}</span>}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {c.amount ? formatCurrency(c.amount, c.currency) : '—'}
                      </td>
                      <td>
                        <StatusBadge $status={c.booking_status || 'pending'}>
                          {statusIcon(c.booking_status || 'pending')}
                          {c.booking_status || 'pending'}
                        </StatusBadge>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {c.booking_status === 'pending' && (
                            <>
                              <ActionBtn
                                $color={colors.green[600]}
                                onClick={() => handleConfirm(booking.id)}
                                disabled={isActioning}
                              >
                                Confirm
                              </ActionBtn>
                              <ActionBtn
                                $color={colors.red[600]}
                                onClick={() => handleCancel(booking.id)}
                                disabled={isActioning}
                              >
                                Cancel
                              </ActionBtn>
                            </>
                          )}
                          {c.booking_status === 'confirmed' && (
                            <ActionBtn
                              $color={colors.red[600]}
                              onClick={() => handleCancel(booking.id)}
                              disabled={isActioning}
                            >
                              Cancel
                            </ActionBtn>
                          )}
                          <ActionBtn
                            onClick={() => navigate(`/content/bookings/edit/${booking.id}`)}
                          >
                            Details
                          </ActionBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>

            {totalPages > 1 && (
              <Pagination>
                <span>Page {page + 1} of {totalPages}</span>
                <PaginationBtns>
                  <PageBtn onClick={() => setPage(p => p - 1)} disabled={page === 0}>
                    <ChevronLeft />
                  </PageBtn>
                  <PageBtn onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
                    <ChevronRight />
                  </PageBtn>
                </PaginationBtns>
              </Pagination>
            )}
          </>
        ) : (
          <EmptyState>
            <CalendarCheck size={48} />
            <p>{loading ? 'Loading bookings...' : 'No bookings found'}</p>
            <p>{!loading && 'Bookings will appear here when customers complete reservations'}</p>
          </EmptyState>
        )}
      </TableWrapper>
    </Container>
  );
};
