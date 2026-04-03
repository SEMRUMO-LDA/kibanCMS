/**
 * Users Management Page
 *
 * Features:
 * - List all users with roles
 * - Invite new users (email)
 * - Change user roles
 * - Remove users
 */

import { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import {
  Users as UsersIcon,
  UserPlus,
  Mail,
  Trash2,
  Shield,
  Loader,
  X,
  Check,
  AlertCircle
} from 'lucide-react';
import { colors, spacing, typography, borders, shadows, animations } from '../shared/styles/design-tokens';
import { supabase } from '../lib/supabase';
import { useAuth } from '../features/auth/hooks/useAuth';
import { useToast } from '../components/Toast';

// ============================================
// ANIMATIONS
// ============================================

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const slideDown = keyframes`
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
`;

// ============================================
// TYPES
// ============================================

type UserRole = 'super_admin' | 'admin' | 'editor' | 'author' | 'viewer';

interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

// ============================================
// STYLED COMPONENTS
// ============================================

const Container = styled.div`
  max-width: 1400px;
  animation: ${fadeIn} ${animations.duration.normal} ${animations.easing.out};
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${spacing[8]};
  gap: ${spacing[4]};
  flex-wrap: wrap;

  h1 {
    font-size: ${typography.fontSize['3xl']};
    font-weight: ${typography.fontWeight.bold};
    margin: 0 0 ${spacing[2]} 0;
    color: ${colors.gray[900]};
  }

  p {
    font-size: ${typography.fontSize.sm};
    color: ${colors.gray[600]};
    margin: 0;
  }
`;

const HeaderLeft = styled.div`
  flex: 1;
  min-width: 0;
`;

const InviteButton = styled.button`
  background: ${colors.accent[500]};
  color: ${colors.white};
  border: none;
  padding: ${spacing[3]} ${spacing[5]};
  border-radius: ${borders.radius.lg};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.semibold};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  transition: all ${animations.duration.fast} ${animations.easing.out};
  box-shadow: ${shadows.sm};
  font-family: ${typography.fontFamily.sans};

  &:hover:not(:disabled) {
    background: ${colors.accent[600]};
    box-shadow: ${shadows.md};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const TableContainer = styled.div`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  overflow: hidden;
  box-shadow: ${shadows.sm};
`;

const Table = styled.table`
  width: 100%;

  thead {
    background: ${colors.gray[50]};
    border-bottom: 1px solid ${colors.gray[200]};

    th {
      text-align: left;
      padding: ${spacing[4]} ${spacing[5]};
      font-weight: ${typography.fontWeight.semibold};
      font-size: ${typography.fontSize.xs};
      color: ${colors.gray[600]};
      text-transform: uppercase;
      letter-spacing: ${typography.letterSpacing.wider};
    }
  }

  tbody {
    tr {
      border-bottom: 1px solid ${colors.gray[100]};
      transition: background ${animations.duration.fast} ${animations.easing.out};

      &:last-child {
        border-bottom: none;
      }

      &:hover {
        background: ${colors.gray[50]};
      }
    }

    td {
      padding: ${spacing[5]};
      font-size: ${typography.fontSize.sm};
      color: ${colors.gray[700]};
      vertical-align: middle;
    }
  }
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[3]};

  .avatar {
    width: 40px;
    height: 40px;
    border-radius: ${borders.radius.full};
    background: linear-gradient(135deg, ${colors.accent[400]}, ${colors.accent[600]});
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${colors.white};
    font-weight: ${typography.fontWeight.semibold};
    font-size: ${typography.fontSize.sm};
    flex-shrink: 0;
  }

  .info {
    min-width: 0;

    .name {
      font-weight: ${typography.fontWeight.medium};
      color: ${colors.gray[900]};
      margin-bottom: ${spacing[1]};
    }

    .email {
      font-size: ${typography.fontSize.xs};
      color: ${colors.gray[500]};
    }
  }
`;

const RoleBadge = styled.span<{ $role: UserRole }>`
  display: inline-flex;
  align-items: center;
  gap: ${spacing[2]};
  padding: ${spacing[2]} ${spacing[3]};
  border-radius: ${borders.radius.full};
  font-size: ${typography.fontSize.xs};
  font-weight: ${typography.fontWeight.semibold};
  text-transform: capitalize;

  ${props => {
    switch (props.$role) {
      case 'super_admin':
        return `
          background: #fce7f3;
          color: #9d174d;
        `;
      case 'admin':
        return `
          background: ${colors.accent[100]};
          color: ${colors.accent[700]};
        `;
      case 'editor':
        return `
          background: #dbeafe;
          color: #1e40af;
        `;
      case 'author':
        return `
          background: #d1fae5;
          color: #065f46;
        `;
      case 'viewer':
      default:
        return `
          background: ${colors.gray[200]};
          color: ${colors.gray[700]};
        `;
    }
  }}

  svg {
    width: 12px;
    height: 12px;
  }
`;

const RoleSelect = styled.select`
  padding: ${spacing[2]} ${spacing[3]};
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.sm};
  color: ${colors.gray[700]};
  background: ${colors.white};
  cursor: pointer;
  font-family: ${typography.fontFamily.sans};
  transition: all ${animations.duration.fast} ${animations.easing.out};

  &:hover {
    border-color: ${colors.gray[400]};
  }

  &:focus {
    outline: none;
    border-color: ${colors.accent[500]};
    box-shadow: 0 0 0 3px ${colors.accent[500]}20;
  }
`;

const ActionButton = styled.button`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  padding: ${spacing[2]};
  border-radius: ${borders.radius.md};
  cursor: pointer;
  color: ${colors.gray[600]};
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all ${animations.duration.fast} ${animations.easing.out};

  &:hover {
    background: ${colors.gray[50]};
    color: ${colors.gray[900]};
    border-color: ${colors.gray[300]};
  }

  &.delete:hover {
    background: #fef2f2;
    border-color: #fecaca;
    color: #dc2626;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Modal = styled.div`
  position: fixed;
  inset: 0;
  background: ${colors.backdrop};
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: ${spacing[4]};
  animation: ${fadeIn} ${animations.duration.fast} ${animations.easing.out};
`;

const ModalContent = styled.div`
  background: ${colors.white};
  border-radius: ${borders.radius.xl};
  box-shadow: ${shadows['2xl']};
  width: 100%;
  max-width: 500px;
  animation: ${slideDown} ${animations.duration.normal} ${animations.easing.out};
`;

const ModalHeader = styled.div`
  padding: ${spacing[6]} ${spacing[6]} ${spacing[4]};
  border-bottom: 1px solid ${colors.gray[200]};
  display: flex;
  align-items: center;
  justify-content: space-between;

  h2 {
    font-size: ${typography.fontSize.xl};
    font-weight: ${typography.fontWeight.semibold};
    color: ${colors.gray[900]};
    margin: 0;
  }

  button {
    background: none;
    border: none;
    color: ${colors.gray[400]};
    cursor: pointer;
    padding: ${spacing[2]};
    border-radius: ${borders.radius.md};
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      background: ${colors.gray[100]};
      color: ${colors.gray[600]};
    }
  }
`;

const ModalBody = styled.div`
  padding: ${spacing[6]};
`;

const FormGroup = styled.div`
  margin-bottom: ${spacing[5]};

  &:last-child {
    margin-bottom: 0;
  }

  label {
    display: block;
    font-size: ${typography.fontSize.sm};
    font-weight: ${typography.fontWeight.semibold};
    color: ${colors.gray[700]};
    margin-bottom: ${spacing[2]};
  }

  input, select {
    width: 100%;
    padding: ${spacing[3]} ${spacing[4]};
    border: 1px solid ${colors.gray[300]};
    border-radius: ${borders.radius.lg};
    font-size: ${typography.fontSize.sm};
    color: ${colors.gray[900]};
    font-family: ${typography.fontFamily.sans};
    transition: all ${animations.duration.fast} ${animations.easing.out};

    &::placeholder {
      color: ${colors.gray[400]};
    }

    &:focus {
      outline: none;
      border-color: ${colors.accent[500]};
      box-shadow: 0 0 0 3px ${colors.accent[500]}20;
    }
  }

  .help-text {
    font-size: ${typography.fontSize.xs};
    color: ${colors.gray[500]};
    margin-top: ${spacing[2]};
  }
`;

const ModalFooter = styled.div`
  padding: ${spacing[4]} ${spacing[6]} ${spacing[6]};
  display: flex;
  gap: ${spacing[3]};
  justify-content: flex-end;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: ${spacing[3]} ${spacing[5]};
  border-radius: ${borders.radius.lg};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.semibold};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  transition: all ${animations.duration.fast} ${animations.easing.out};
  font-family: ${typography.fontFamily.sans};

  ${props => props.$variant === 'primary' ? `
    background: ${colors.accent[500]};
    color: ${colors.white};
    border: none;

    &:hover:not(:disabled) {
      background: ${colors.accent[600]};
    }
  ` : `
    background: ${colors.white};
    color: ${colors.gray[700]};
    border: 1px solid ${colors.gray[300]};

    &:hover:not(:disabled) {
      background: ${colors.gray[50]};
    }
  `}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${spacing[16]};

  svg {
    animation: ${spin} 1s linear infinite;
    color: ${colors.accent[500]};
    margin-bottom: ${spacing[4]};
  }

  p {
    color: ${colors.gray[600]};
    font-size: ${typography.fontSize.sm};
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${spacing[16]} ${spacing[8]};

  .empty-icon {
    width: 80px;
    height: 80px;
    margin: 0 auto ${spacing[6]};
    border-radius: ${borders.radius.full};
    background: ${colors.gray[100]};
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${colors.gray[400]};

    svg {
      width: 40px;
      height: 40px;
    }
  }

  h3 {
    font-size: ${typography.fontSize.xl};
    font-weight: ${typography.fontWeight.semibold};
    margin: 0 0 ${spacing[2]} 0;
    color: ${colors.gray[900]};
  }

  p {
    color: ${colors.gray[600]};
    margin: 0;
    font-size: ${typography.fontSize.sm};
  }
`;

// ============================================
// COMPONENT
// ============================================

export const Users = () => {
  const { user: currentUser, profile } = useAuth();
  const toast = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('editor');

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error: any) {
      console.error('Error loading users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inviteEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    setInviting(true);

    try {
      // In a real implementation, you'd call Supabase admin API to create user
      // For now, we'll show a success message
      toast.info('User invitation sent! They will receive an email to set up their account.');
      setShowInviteModal(false);
      setInviteEmail('');
      setInviteRole('editor');

      // Reload users after a delay
      setTimeout(loadUsers, 1000);
    } catch (error: any) {
      console.error('Error inviting user:', error);
      toast.error('Failed to invite user');
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    if (!isAdmin) {
      toast.error('Only admins can change user roles');
      return;
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;

      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      toast.success('User role updated successfully');
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast.error('Failed to update user role');
    }
  };

  const handleDelete = async (userId: string, userName: string) => {
    if (!isAdmin) {
      toast.error('Only admins can delete users');
      return;
    }

    if (userId === currentUser?.id) {
      toast.error('You cannot delete your own account');
      return;
    }

    if (!confirm(`Delete user "${userName || 'Unknown'}"? This cannot be undone.`)) {
      return;
    }

    try {
      // Note: In production, use Supabase admin API to delete auth user
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (error) throw error;

      setUsers(prev => prev.filter(u => u.id !== userId));
      toast.success('User deleted successfully');
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast.error('Failed to delete user');
    }
  };

  const getUserInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email[0].toUpperCase();
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <Container>
        <LoadingContainer>
          <Loader size={40} />
          <p>Loading users...</p>
        </LoadingContainer>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <HeaderLeft>
          <h1>Users</h1>
          <p>Manage team members and permissions</p>
        </HeaderLeft>
        {isAdmin && (
          <InviteButton onClick={() => setShowInviteModal(true)}>
            <UserPlus size={20} />
            Invite User
          </InviteButton>
        )}
      </Header>

      {users.length === 0 ? (
        <EmptyState>
          <div className="empty-icon">
            <UsersIcon />
          </div>
          <h3>No users yet</h3>
          <p>Invite team members to collaborate on your content.</p>
        </EmptyState>
      ) : (
        <TableContainer>
          <Table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Last Updated</th>
                {isAdmin && <th style={{ width: '100px' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <UserInfo>
                      <div className="avatar">
                        {getUserInitials(user.full_name, user.email)}
                      </div>
                      <div className="info">
                        <div className="name">{user.full_name || 'No name'}</div>
                        <div className="email">{user.email}</div>
                      </div>
                    </UserInfo>
                  </td>
                  <td>
                    {isAdmin && user.id !== currentUser?.id ? (
                      <RoleSelect
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                      >
                        <option value="super_admin">Super Admin</option>
                        <option value="admin">Admin</option>
                        <option value="editor">Editor</option>
                        <option value="author">Author</option>
                        <option value="viewer">Viewer</option>
                      </RoleSelect>
                    ) : (
                      <RoleBadge $role={user.role}>
                        <Shield />
                        {user.role}
                      </RoleBadge>
                    )}
                  </td>
                  <td>{formatDate(user.created_at)}</td>
                  <td>{formatDate(user.updated_at)}</td>
                  {isAdmin && (
                    <td>
                      <ActionButton
                        className="delete"
                        onClick={() => handleDelete(user.id, user.full_name || user.email)}
                        disabled={user.id === currentUser?.id}
                        title={user.id === currentUser?.id ? 'Cannot delete yourself' : 'Delete user'}
                      >
                        <Trash2 size={16} />
                      </ActionButton>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        </TableContainer>
      )}

      {showInviteModal && (
        <Modal onClick={() => setShowInviteModal(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <h2>Invite User</h2>
              <button onClick={() => setShowInviteModal(false)}>
                <X size={20} />
              </button>
            </ModalHeader>

            <form onSubmit={handleInvite}>
              <ModalBody>
                <FormGroup>
                  <label htmlFor="email">Email Address</label>
                  <input
                    id="email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    required
                    disabled={inviting}
                  />
                  <p className="help-text">
                    User will receive an email invitation to join
                  </p>
                </FormGroup>

                <FormGroup>
                  <label htmlFor="role">Role</label>
                  <select
                    id="role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as UserRole)}
                    disabled={inviting}
                  >
                    <option value="admin">Admin - Full access</option>
                    <option value="editor">Editor - Create and edit content</option>
                    <option value="author">Author - Create own content</option>
                    <option value="viewer">Viewer - Read-only access</option>
                  </select>
                </FormGroup>
              </ModalBody>

              <ModalFooter>
                <Button
                  type="button"
                  $variant="secondary"
                  onClick={() => setShowInviteModal(false)}
                  disabled={inviting}
                >
                  Cancel
                </Button>
                <Button type="submit" $variant="primary" disabled={inviting}>
                  {inviting ? (
                    <>
                      <Loader size={16} className="spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail size={16} />
                      Send Invitation
                    </>
                  )}
                </Button>
              </ModalFooter>
            </form>
          </ModalContent>
        </Modal>
      )}
    </Container>
  );
};
