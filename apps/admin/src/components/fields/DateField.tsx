/**
 * DateField Component
 *
 * Date picker input
 */

import styled from 'styled-components';
import { colors, spacing, typography, borders, animations } from '../../shared/styles/design-tokens';
import { FieldWrapper } from './FieldWrapper';
import { Calendar } from 'lucide-react';

const InputWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const Input = styled.input`
  width: 100%;
  padding: ${spacing[3]} ${spacing[4]};
  padding-right: ${spacing[10]};
  font-size: ${typography.fontSize.base};
  font-family: ${typography.fontFamily.sans};
  color: ${colors.gray[900]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.md};
  transition: all ${animations.duration.fast} ${animations.easing.out};

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

  /* Style the calendar picker */
  &::-webkit-calendar-picker-indicator {
    opacity: 0;
    cursor: pointer;
  }
`;

const IconWrapper = styled.div`
  position: absolute;
  right: ${spacing[3]};
  color: ${colors.gray[500]};
  pointer-events: none;
`;

interface DateFieldProps {
  name: string;
  label: string;
  value: string; // ISO date string
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  error?: string;
  min?: string;
  max?: string;
}

export function DateField({
  name,
  label,
  value,
  onChange,
  required,
  disabled,
  helpText,
  error,
  min,
  max,
}: DateFieldProps) {
  return (
    <FieldWrapper
      label={label}
      name={name}
      required={required}
      helpText={helpText}
      error={error}
    >
      <InputWrapper>
        <Input
          id={name}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
          min={min}
          max={max}
          aria-invalid={!!error}
        />
        <IconWrapper>
          <Calendar size={18} />
        </IconWrapper>
      </InputWrapper>
    </FieldWrapper>
  );
}
