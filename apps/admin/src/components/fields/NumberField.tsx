/**
 * NumberField Component
 *
 * Numeric input with step controls
 */

import styled from 'styled-components';
import { colors, spacing, typography, borders, animations } from '../../shared/styles/design-tokens';
import { FieldWrapper } from './FieldWrapper';

const Input = styled.input`
  width: 100%;
  padding: ${spacing[3]} ${spacing[4]};
  font-size: ${typography.fontSize.base};
  font-family: ${typography.fontFamily.sans};
  color: ${colors.gray[900]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.md};
  transition: all ${animations.duration.fast} ${animations.easing.out};

  &::placeholder {
    color: ${colors.gray[400]};
  }

  &:hover {
    border-color: ${colors.gray[400]};
  }

  &:focus {
    outline: none;
    border-color: ${colors.accent[500]};
    box-shadow: 0 0 0 3px ${colors.focus};
  }

  &:disabled {
    background: ${colors.gray[100]};
    color: ${colors.gray[500]};
    cursor: not-allowed;
  }

  &[aria-invalid="true"] {
    border-color: ${colors.accent[500]};
  }

  /* Remove spinner buttons for cleaner look */
  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  &[type=number] {
    -moz-appearance: textfield;
  }
`;

interface NumberFieldProps {
  name: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  error?: string;
  min?: number;
  max?: number;
  step?: number;
}

export function NumberField({
  name,
  label,
  value,
  onChange,
  placeholder,
  required,
  disabled,
  helpText,
  error,
  min,
  max,
  step = 1,
}: NumberFieldProps) {
  return (
    <FieldWrapper
      label={label}
      name={name}
      required={required}
      helpText={helpText}
      error={error}
    >
      <Input
        id={name}
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        aria-invalid={!!error}
      />
    </FieldWrapper>
  );
}
