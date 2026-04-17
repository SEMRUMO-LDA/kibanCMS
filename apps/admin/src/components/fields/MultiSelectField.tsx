/**
 * MultiSelectField
 * Multi-select from a predefined list using toggleable chips.
 * Stores value as string[] (array of selected option values).
 */

import { useMemo } from 'react';
import styled from 'styled-components';
import { Check } from 'lucide-react';
import { colors, spacing, typography, borders, animations } from '../../shared/styles/design-tokens';
import { FieldWrapper } from './FieldWrapper';

const Container = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${spacing[2]};
  padding: ${spacing[3]};
  background: ${colors.gray[50]};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.md};
  min-height: 52px;
`;

const Chip = styled.button<{ $selected: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: ${spacing[1]};
  padding: ${spacing[2]} ${spacing[3]};
  background: ${props => (props.$selected ? colors.gray[900] : colors.white)};
  color: ${props => (props.$selected ? colors.white : colors.gray[700])};
  border: 1px solid ${props => (props.$selected ? colors.gray[900] : colors.gray[300])};
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.medium};
  font-family: ${typography.fontFamily.sans};
  cursor: pointer;
  transition: all ${animations.duration.fast} ${animations.easing.out};

  &:hover {
    border-color: ${props => (props.$selected ? colors.gray[900] : colors.gray[400])};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

interface MultiSelectFieldProps {
  name: string;
  label: string;
  value: unknown;
  onChange: (value: string[]) => void;
  options: Array<{ label: string; value: string }>;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  error?: string;
}

function parseValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value.trim()) {
    // Backward compat: newline- or comma-separated strings
    return value
      .split(/[\n,]/)
      .map(s => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function MultiSelectField({
  name,
  label,
  value,
  onChange,
  options,
  required,
  disabled,
  helpText,
  error,
}: MultiSelectFieldProps) {
  const selected = useMemo(() => new Set(parseValue(value)), [value]);

  const toggle = (opt: string) => {
    const next = new Set(selected);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    onChange(Array.from(next));
  };

  return (
    <FieldWrapper label={label} name={name} required={required} helpText={helpText} error={error}>
      <Container>
        {options.map(opt => {
          const isSelected = selected.has(opt.value);
          return (
            <Chip
              key={opt.value}
              type="button"
              $selected={isSelected}
              onClick={() => toggle(opt.value)}
              disabled={disabled}
              aria-pressed={isSelected}
            >
              {isSelected && <Check size={14} />}
              {opt.label}
            </Chip>
          );
        })}
      </Container>
    </FieldWrapper>
  );
}
