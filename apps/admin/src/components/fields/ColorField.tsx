/**
 * ColorField
 * Native browser colour picker + hex input + Reset. Stores a #RRGGBB string.
 * Used by addons that need a visual accent colour (widget buttons, etc).
 */

import styled from 'styled-components';
import { colors, spacing, typography, borders, animations } from '../../shared/styles/design-tokens';
import { FieldWrapper } from './FieldWrapper';

const Row = styled.div`
  display: flex;
  gap: ${spacing[2]};
  align-items: center;
`;

const Swatch = styled.input`
  width: 44px;
  height: 40px;
  padding: 2px;
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.md};
  cursor: pointer;
  background: ${colors.white};
`;

const HexInput = styled.input`
  flex: 1;
  padding: ${spacing[2]} ${spacing[3]};
  font-family: ${typography.fontFamily.mono};
  font-size: ${typography.fontSize.sm};
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

const ResetBtn = styled.button`
  padding: ${spacing[2]} ${spacing[3]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.xs};
  color: ${colors.gray[600]};
  cursor: pointer;
  font-family: ${typography.fontFamily.sans};
  font-weight: ${typography.fontWeight.medium};
  &:hover { color: ${colors.gray[900]}; }
`;

interface ColorFieldProps {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  error?: string;
}

function normalize(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const withHash = trimmed.startsWith('#') ? trimmed : '#' + trimmed;
  return withHash.toLowerCase();
}

const DEFAULT_FALLBACK = '#2c2c2c';

export function ColorField({
  name,
  label,
  value,
  onChange,
  placeholder,
  required,
  disabled,
  helpText,
  error,
}: ColorFieldProps) {
  const display = value || '';
  // The native <input type="color"> needs a valid #RRGGBB or it shows #000.
  const isValidForPicker = /^#[0-9a-f]{6}$/i.test(display);
  const pickerValue = isValidForPicker ? display : (placeholder && /^#[0-9a-f]{6}$/i.test(placeholder) ? placeholder : DEFAULT_FALLBACK);

  return (
    <FieldWrapper label={label} name={name} required={required} helpText={helpText} error={error}>
      <Row>
        <Swatch
          type="color"
          value={pickerValue}
          onChange={e => onChange(normalize(e.target.value))}
          disabled={disabled}
          aria-label={`${label} — colour picker`}
        />
        <HexInput
          type="text"
          value={display}
          onChange={e => onChange(e.target.value)}
          onBlur={e => {
            const norm = normalize(e.target.value);
            if (norm !== e.target.value) onChange(norm);
          }}
          placeholder={placeholder || '#000000'}
          pattern="^#[0-9A-Fa-f]{6}$"
          disabled={disabled}
          aria-label={`${label} — hex value`}
        />
        {display && (
          <ResetBtn type="button" onClick={() => onChange('')} disabled={disabled}>
            Reset
          </ResetBtn>
        )}
      </Row>
    </FieldWrapper>
  );
}
