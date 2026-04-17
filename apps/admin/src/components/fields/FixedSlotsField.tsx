/**
 * FixedSlotsField
 * Visual editor for a JSON array of HH:MM start times (e.g. ["10:00","14:00"]).
 * Replaces the raw textarea JSON input for fixed_slots on bookable resources/tours.
 */

import { useMemo } from 'react';
import styled from 'styled-components';
import { Plus, X } from 'lucide-react';
import { colors, spacing, typography, borders, animations } from '../../shared/styles/design-tokens';
import { FieldWrapper } from './FieldWrapper';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[2]};
  padding: ${spacing[3]};
  background: ${colors.gray[50]};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.md};
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
`;

const TimeInput = styled.input`
  padding: ${spacing[2]} ${spacing[3]};
  font-size: ${typography.fontSize.sm};
  font-family: ${typography.fontFamily.sans};
  color: ${colors.gray[900]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.md};
  width: 120px;
  transition: border ${animations.duration.fast} ${animations.easing.out};

  &:focus {
    outline: none;
    border-color: ${colors.accent[500]};
    box-shadow: 0 0 0 3px ${colors.focus};
  }
`;

const IconButton = styled.button<{ $variant?: 'remove' | 'add' }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${spacing[1]};
  padding: ${spacing[2]} ${spacing[3]};
  background: ${props => (props.$variant === 'remove' ? colors.white : colors.gray[900])};
  color: ${props => (props.$variant === 'remove' ? colors.gray[700] : colors.white)};
  border: 1px solid ${props => (props.$variant === 'remove' ? colors.gray[300] : colors.gray[900])};
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.xs};
  font-weight: ${typography.fontWeight.medium};
  font-family: ${typography.fontFamily.sans};
  cursor: pointer;
  transition: all ${animations.duration.fast} ${animations.easing.out};

  &:hover {
    opacity: 0.85;
  }
`;

const EmptyHint = styled.p`
  margin: 0;
  padding: ${spacing[3]};
  text-align: center;
  font-size: ${typography.fontSize.sm};
  color: ${colors.gray[500]};
`;

interface FixedSlotsFieldProps {
  name: string;
  label: string;
  value: unknown;
  onChange: (value: string[]) => void;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  error?: string;
}

function parseValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch { /* fall through */ }
  }
  return [];
}

function isValidHHMM(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function FixedSlotsField({
  name,
  label,
  value,
  onChange,
  required,
  disabled,
  helpText,
  error,
}: FixedSlotsFieldProps) {
  const slots = useMemo(() => parseValue(value), [value]);

  const updateSlot = (index: number, next: string) => {
    const copy = [...slots];
    copy[index] = next;
    onChange(copy);
  };

  const addSlot = () => {
    const last = slots[slots.length - 1];
    const next = last && isValidHHMM(last) ? addHour(last) : '09:00';
    onChange([...slots, next]);
  };

  const removeSlot = (index: number) => {
    onChange(slots.filter((_, i) => i !== index));
  };

  return (
    <FieldWrapper label={label} name={name} required={required} helpText={helpText} error={error}>
      <Container>
        {slots.length === 0 && <EmptyHint>No time slots yet. Click "Add time" to create one.</EmptyHint>}

        {slots.map((slot, i) => (
          <Row key={i}>
            <TimeInput
              type="time"
              value={isValidHHMM(slot) ? slot : ''}
              onChange={e => updateSlot(i, e.target.value)}
              disabled={disabled}
              aria-label={`Time slot ${i + 1}`}
            />
            <IconButton
              type="button"
              $variant="remove"
              onClick={() => removeSlot(i)}
              disabled={disabled}
              aria-label={`Remove slot ${slot}`}
            >
              <X size={14} /> Remove
            </IconButton>
          </Row>
        ))}

        <Row>
          <IconButton type="button" $variant="add" onClick={addSlot} disabled={disabled}>
            <Plus size={14} /> Add time
          </IconButton>
        </Row>
      </Container>
    </FieldWrapper>
  );
}

function addHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const next = (h + 1) % 24;
  return `${String(next).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
