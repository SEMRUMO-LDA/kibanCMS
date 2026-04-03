/**
 * SelectField Component
 *
 * Dropdown select
 */

import styled from 'styled-components';
import { colors, spacing, typography, borders, animations } from '../../shared/styles/design-tokens';
import { FieldWrapper } from './FieldWrapper';
import { ChevronDown } from 'lucide-react';

const SelectWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const Select = styled.select`
  width: 100%;
  padding: ${spacing[3]} ${spacing[4]};
  padding-right: ${spacing[10]};
  font-size: ${typography.fontSize.base};
  font-family: ${typography.fontFamily.sans};
  color: ${colors.gray[900]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.md};
  cursor: pointer;
  appearance: none;
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
`;

const IconWrapper = styled.div`
  position: absolute;
  right: ${spacing[3]};
  color: ${colors.gray[500]};
  pointer-events: none;
`;

interface SelectOption {
  label: string;
  value: string;
}

interface SelectFieldProps {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  error?: string;
}

export function SelectField({
  name,
  label,
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  required,
  disabled,
  helpText,
  error,
}: SelectFieldProps) {
  return (
    <FieldWrapper
      label={label}
      name={name}
      required={required}
      helpText={helpText}
      error={error}
    >
      <SelectWrapper>
        <Select
          id={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
          aria-invalid={!!error}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <IconWrapper>
          <ChevronDown size={18} />
        </IconWrapper>
      </SelectWrapper>
    </FieldWrapper>
  );
}
