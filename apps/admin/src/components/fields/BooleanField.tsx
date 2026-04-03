/**
 * BooleanField Component
 *
 * Checkbox/Toggle for true/false values
 */

import styled from 'styled-components';
import { colors, spacing, typography, borders, animations } from '../../shared/styles/design-tokens';
import { FieldWrapper } from './FieldWrapper';

const CheckboxWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  padding: ${spacing[3]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.md};
  cursor: pointer;
  transition: all ${animations.duration.fast} ${animations.easing.out};

  &:hover {
    border-color: ${colors.gray[300]};
    background: ${colors.gray[50]};
  }

  &[data-disabled="true"] {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Checkbox = styled.input`
  width: 20px;
  height: 20px;
  cursor: pointer;
  accent-color: ${colors.accent[500]};

  &:disabled {
    cursor: not-allowed;
  }
`;

const CheckboxLabel = styled.span`
  font-size: ${typography.fontSize.sm};
  color: ${colors.gray[700]};
  cursor: pointer;
  user-select: none;
`;

interface BooleanFieldProps {
  name: string;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  checkboxLabel?: string;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  error?: string;
}

export function BooleanField({
  name,
  label,
  value,
  onChange,
  checkboxLabel,
  required,
  disabled,
  helpText,
  error,
}: BooleanFieldProps) {
  return (
    <FieldWrapper
      label={label}
      name={name}
      required={required}
      helpText={helpText}
      error={error}
    >
      <CheckboxWrapper
        data-disabled={disabled}
        onClick={() => !disabled && onChange(!value)}
      >
        <Checkbox
          id={name}
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          aria-invalid={!!error}
        />
        <CheckboxLabel>{checkboxLabel || 'Enable this option'}</CheckboxLabel>
      </CheckboxWrapper>
    </FieldWrapper>
  );
}
