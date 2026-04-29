/**
 * DateSlotsField
 * Visual editor for a JSON array of {date, time} pairs (e.g.
 * [{"date":"2026-04-25","time":"11:00"}]). Used when schedule_type=date_slots
 * for tours that only run on specific dates.
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

const Input = styled.input`
  padding: ${spacing[2]} ${spacing[3]};
  font-size: ${typography.fontSize.sm};
  font-family: ${typography.fontFamily.sans};
  color: ${colors.gray[900]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.md};
  transition: border ${animations.duration.fast} ${animations.easing.out};

  &:focus {
    outline: none;
    border-color: ${colors.accent[500]};
    box-shadow: 0 0 0 3px ${colors.focus};
  }
`;

const DateInput = styled(Input)`
  width: 160px;
`;

const TimeInput = styled(Input)`
  width: 120px;
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

export interface DateSlot {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
}

interface DateSlotsFieldProps {
  name: string;
  label: string;
  value: unknown;
  onChange: (value: DateSlot[]) => void;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  error?: string;
}

function parseValue(value: unknown): DateSlot[] {
  let arr: any[] = [];
  if (Array.isArray(value)) arr = value;
  else if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) arr = parsed;
    } catch { /* ignore */ }
  }
  return arr
    .map(item => ({
      date: typeof item?.date === 'string' ? item.date : '',
      time: typeof item?.time === 'string' ? item.time : '',
    }))
    .filter(s => s.date || s.time);
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isValidHHMM(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function DateSlotsField({
  name,
  label,
  value,
  onChange,
  required,
  disabled,
  helpText,
  error,
}: DateSlotsFieldProps) {
  const slots = useMemo(() => parseValue(value), [value]);

  const update = (index: number, patch: Partial<DateSlot>) => {
    const copy = slots.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange(copy);
  };

  const add = () => {
    const last = slots[slots.length - 1];
    const today = new Date().toISOString().slice(0, 10);
    onChange([
      ...slots,
      { date: last?.date || today, time: last?.time || '10:00' },
    ]);
  };

  const remove = (index: number) => {
    onChange(slots.filter((_, i) => i !== index));
  };

  return (
    <FieldWrapper label={label} name={name} required={required} helpText={helpText} error={error}>
      <Container>
        {slots.length === 0 && (
          <EmptyHint>No date slots yet. Click "Add date" to create one.</EmptyHint>
        )}

        {slots.map((slot, i) => (
          <Row key={i}>
            <DateInput
              type="date"
              value={isValidDate(slot.date) ? slot.date : ''}
              onChange={e => update(i, { date: e.target.value })}
              disabled={disabled}
              aria-label={`Date ${i + 1}`}
            />
            <TimeInput
              type="time"
              value={isValidHHMM(slot.time) ? slot.time : ''}
              onChange={e => update(i, { time: e.target.value })}
              disabled={disabled}
              aria-label={`Time ${i + 1}`}
            />
            <IconButton
              type="button"
              $variant="remove"
              onClick={() => remove(i)}
              disabled={disabled}
              aria-label={`Remove slot ${slot.date} ${slot.time}`}
            >
              <X size={14} /> Remove
            </IconButton>
          </Row>
        ))}

        <Row>
          <IconButton type="button" $variant="add" onClick={add} disabled={disabled}>
            <Plus size={14} /> Add date
          </IconButton>
        </Row>
      </Container>
    </FieldWrapper>
  );
}
