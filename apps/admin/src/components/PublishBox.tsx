/**
 * PublishBox — sticky right-rail action panel (WordPress-style).
 *
 * Used in entry editing, collection editing, and any other CMS area where
 * the operator needs the save/status/back controls always visible while
 * scrolling a long form. Renders as a sticky card on desktop; on mobile
 * (≤900px) it collapses inline at the top of the page so it never hides
 * the form content.
 */

import type { ReactNode } from 'react';
import styled from 'styled-components';
import { ArrowLeft, Save, Clock, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { colors, spacing, typography, borders, shadows } from '../shared/styles/design-tokens';

export type PublishBoxSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface PublishBoxProps {
  /** Card title — defaults to "Publish". Pass a different label for non-entry usage. */
  title?: string;

  /** Current status value (e.g. "draft", "published"). Pass null/undefined to hide the selector. */
  status?: string;
  /** Status options to render. Hide selector by leaving undefined or empty. */
  statusOptions?: Array<{ value: string; label: string }>;
  /** Fired when the operator picks a different status. */
  onStatusChange?: (value: string) => void;

  /** Save button click handler. Returns a promise to update the saving indicator. */
  onSave?: () => void;
  /** Save button label override. Defaults to "Save". When status is 'published', defaults to "Update". */
  saveLabel?: string;
  /** Disable the save button (e.g. while validating). */
  saveDisabled?: boolean;

  /** Cancel/back handler. Hides the cancel link when not provided. */
  onCancel?: () => void;
  cancelLabel?: string;

  /** Live save status indicator. */
  saveStatus?: PublishBoxSaveStatus;
  /** Optional error string shown when saveStatus === 'error'. */
  saveError?: string | null;

  /** "Last edited" timestamp (ISO string). Hidden when not provided. */
  lastSavedAt?: string;

  /** Hint shown above the save button — typically "Unsaved changes" when isDirty. */
  hint?: string;

  /** Optional extra rows rendered above the action buttons (revisions, preview, share). */
  children?: ReactNode;
}

// ── Layout ──

const Wrapper = styled.aside`
  width: 280px;
  flex-shrink: 0;

  @media (max-width: 1024px) {
    width: 100%;
  }
`;

const StickyCard = styled.div`
  position: sticky;
  top: ${spacing[6]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  overflow: hidden;
  box-shadow: ${shadows.sm};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${spacing[4]} ${spacing[5]};
  border-bottom: 1px solid ${colors.gray[100]};

  h3 {
    font-size: ${typography.fontSize.sm};
    font-weight: ${typography.fontWeight.semibold};
    color: ${colors.gray[900]};
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
`;

const BackLink = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${spacing[1.5]};
  background: none;
  border: none;
  font-size: 12px;
  font-weight: 500;
  color: ${colors.gray[500]};
  cursor: pointer;
  padding: 0;
  font-family: ${typography.fontFamily.sans};
  transition: color 0.15s;
  &:hover { color: ${colors.gray[800]}; }
  svg { width: 13px; height: 13px; }
`;

const Body = styled.div`
  padding: ${spacing[4]} ${spacing[5]} ${spacing[5]};
  display: flex;
  flex-direction: column;
  gap: ${spacing[3]};
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${spacing[3]};
  font-size: 13px;
  color: ${colors.gray[600]};

  .row-label {
    color: ${colors.gray[500]};
    display: inline-flex;
    align-items: center;
    gap: ${spacing[1.5]};
    svg { width: 13px; height: 13px; }
  }
`;

const StatusSelect = styled.select`
  padding: ${spacing[1.5]} ${spacing[3]};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.md};
  background: ${colors.white};
  font-size: 13px;
  font-weight: 500;
  color: ${colors.gray[800]};
  cursor: pointer;
  font-family: ${typography.fontFamily.sans};

  &:focus {
    outline: 2px solid ${colors.accent[200]};
    border-color: ${colors.accent[400]};
  }
`;

const Hint = styled.div<{ $kind: 'idle' | 'saving' | 'saved' | 'error' | 'dirty' }>`
  display: inline-flex;
  align-items: center;
  gap: ${spacing[1.5]};
  font-size: 12px;
  font-weight: 500;
  padding: 6px 10px;
  border-radius: 99px;
  align-self: flex-start;
  svg { width: 12px; height: 12px; }

  ${p => {
    switch (p.$kind) {
      case 'saving':
        return `background: ${colors.gray[100]}; color: ${colors.gray[700]};`;
      case 'saved':
        return `background: ${colors.green[50]}; color: ${colors.green[700]};`;
      case 'error':
        return `background: ${colors.red[50]}; color: ${colors.red[700]};`;
      case 'dirty':
        return `background: ${colors.yellow[50]}; color: ${colors.yellow[700]};`;
      default:
        return `background: transparent; color: ${colors.gray[400]};`;
    }
  }}
`;

const SaveButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${spacing[2]};
  padding: ${spacing[3]} ${spacing[5]};
  background: ${colors.accent[500]};
  color: ${colors.white};
  border: none;
  border-radius: ${borders.radius.lg};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.semibold};
  cursor: pointer;
  font-family: ${typography.fontFamily.sans};
  transition: background 0.15s, opacity 0.15s;
  width: 100%;
  svg { width: 16px; height: 16px; }

  &:hover { background: ${colors.accent[600]}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const Divider = styled.div`
  height: 1px;
  background: ${colors.gray[100]};
  margin: ${spacing[1]} 0;
`;

// ── Component ──

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PublishBox({
  title = 'Publish',
  status,
  statusOptions,
  onStatusChange,
  onSave,
  saveLabel,
  saveDisabled,
  onCancel,
  cancelLabel = 'Back',
  saveStatus = 'idle',
  saveError,
  lastSavedAt,
  hint,
  children,
}: PublishBoxProps) {
  const isPublished = status === 'published';
  const finalSaveLabel = saveLabel || (isPublished ? 'Update' : 'Save');

  return (
    <Wrapper>
      <StickyCard>
        <Header>
          <h3>{title}</h3>
          {onCancel && (
            <BackLink onClick={onCancel} type="button">
              <ArrowLeft />
              {cancelLabel}
            </BackLink>
          )}
        </Header>

        <Body>
          {/* Status row */}
          {statusOptions && statusOptions.length > 0 && status !== undefined && (
            <Row>
              <span className="row-label">Status</span>
              <StatusSelect
                value={status}
                onChange={e => onStatusChange?.(e.target.value)}
              >
                {statusOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </StatusSelect>
            </Row>
          )}

          {/* Last saved row */}
          {lastSavedAt && (
            <Row>
              <span className="row-label"><Clock /> Last saved</span>
              <span style={{ color: colors.gray[700] }}>{formatRelativeTime(lastSavedAt)}</span>
            </Row>
          )}

          {/* Custom rows from caller (revisions, preview link, etc.) */}
          {children && (
            <>
              <Divider />
              {children}
            </>
          )}

          <Divider />

          {/* Save status hint */}
          {saveStatus === 'saving' && (
            <Hint $kind="saving"><Loader style={{ animation: 'spin 1s linear infinite' }} /> Saving…</Hint>
          )}
          {saveStatus === 'saved' && (
            <Hint $kind="saved"><CheckCircle /> Saved</Hint>
          )}
          {saveStatus === 'error' && (
            <Hint $kind="error"><AlertCircle /> {saveError || 'Save failed'}</Hint>
          )}
          {saveStatus === 'idle' && hint && (
            <Hint $kind="dirty">{hint}</Hint>
          )}

          {/* Save button */}
          {onSave && (
            <SaveButton type="button" onClick={onSave} disabled={saveDisabled || saveStatus === 'saving'}>
              <Save />
              {finalSaveLabel}
            </SaveButton>
          )}
        </Body>
      </StickyCard>
    </Wrapper>
  );
}
