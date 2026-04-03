/**
 * TextField Component
 *
 * Single-line text input
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
`;

interface TextFieldProps {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  error?: string;
  maxLength?: number;
}

export function TextField({
  name,
  label,
  value,
  onChange,
  placeholder,
  required,
  disabled,
  helpText,
  error,
  maxLength,
}: TextFieldProps) {
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
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        maxLength={maxLength}
        aria-invalid={!!error}
      />
    </FieldWrapper>
  );
}
