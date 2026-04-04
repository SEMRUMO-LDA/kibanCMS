/**
 * VisualDiff Component
 * Shows a human-readable visual diff between two content versions.
 * Highlights what changed — additions in green, removals in red.
 */

import styled from 'styled-components';
import { colors, spacing, typography, borders } from '../shared/styles/design-tokens';

const Container = styled.div`
  font-size: ${typography.fontSize.sm};
  line-height: 1.6;
`;

const FieldDiff = styled.div`
  margin-bottom: ${spacing[4]};
  padding: ${spacing[3]} ${spacing[4]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.lg};

  .field-name {
    font-weight: 600;
    font-size: 12px;
    color: ${colors.gray[500]};
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin-bottom: ${spacing[2]};
  }
`;

const DiffRow = styled.div<{ $type: 'added' | 'removed' | 'unchanged' }>`
  padding: ${spacing[1]} ${spacing[2]};
  border-radius: ${borders.radius.sm};
  font-family: ${typography.fontFamily.sans};
  word-break: break-word;

  ${p => p.$type === 'added' && `
    background: #dcfce7;
    color: #166534;
    &::before { content: '+ '; font-weight: 600; }
  `}
  ${p => p.$type === 'removed' && `
    background: #fef2f2;
    color: #991b1b;
    text-decoration: line-through;
    &::before { content: '- '; font-weight: 600; }
  `}
  ${p => p.$type === 'unchanged' && `
    color: ${colors.gray[500]};
  `}
`;

const NoDiff = styled.div`
  padding: ${spacing[4]};
  text-align: center;
  color: ${colors.gray[400]};
  font-size: ${typography.fontSize.sm};
`;

interface VisualDiffProps {
  before: Record<string, any>;
  after: Record<string, any>;
  fieldNames?: Record<string, string>; // field_id → display name
}

export function VisualDiff({ before, after, fieldNames = {} }: VisualDiffProps) {
  // Get all keys from both objects
  const allKeys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];

  const changes = allKeys
    .map(key => {
      const oldVal = formatValue(before?.[key]);
      const newVal = formatValue(after?.[key]);
      if (oldVal === newVal) return null;
      return { key, oldVal, newVal, label: fieldNames[key] || key };
    })
    .filter(Boolean);

  if (changes.length === 0) {
    return <NoDiff>No differences found</NoDiff>;
  }

  return (
    <Container>
      {changes.map(change => (
        <FieldDiff key={change!.key}>
          <div className="field-name">{change!.label}</div>
          {change!.oldVal && <DiffRow $type="removed">{truncate(change!.oldVal)}</DiffRow>}
          {change!.newVal && <DiffRow $type="added">{truncate(change!.newVal)}</DiffRow>}
        </FieldDiff>
      ))}
    </Container>
  );
}

function formatValue(val: any): string {
  if (val === undefined || val === null) return '';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function truncate(str: string, max = 500): string {
  if (str.length <= max) return str;
  return str.substring(0, max) + '...';
}
