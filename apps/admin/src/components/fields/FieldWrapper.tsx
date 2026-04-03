/**
 * FieldWrapper
 *
 * Wrapper component for all field types
 * Provides consistent styling, labels, errors, and help text
 */

import styled from 'styled-components';
import { colors, spacing, typography, borders } from '../../shared/styles/design-tokens';
import { AlertCircle } from 'lucide-react';

const Wrapper = styled.div`
  margin-bottom: ${spacing[6]};
`;

const Label = styled.label<{ $required?: boolean }>`
  display: block;
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.semibold};
  color: ${colors.gray[900]};
  margin-bottom: ${spacing[2]};

  ${props => props.$required && `
    &::after {
      content: '*';
      color: ${colors.accent[500]};
      margin-left: ${spacing[1]};
    }
  `}
`;

const HelpText = styled.p`
  font-size: ${typography.fontSize.xs};
  color: ${colors.gray[600]};
  margin: ${spacing[1]} 0 ${spacing[2]};
  line-height: ${typography.lineHeight.normal};
`;

const ErrorMessage = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  margin-top: ${spacing[2]};
  padding: ${spacing[2]} ${spacing[3]};
  background: ${colors.gray[50]};
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.sm};
  color: ${colors.gray[800]};

  svg {
    color: ${colors.accent[500]};
    flex-shrink: 0;
  }
`;

interface FieldWrapperProps {
  label: string;
  name: string;
  required?: boolean;
  helpText?: string;
  error?: string;
  children: React.ReactNode;
}

export function FieldWrapper({
  label,
  name,
  required,
  helpText,
  error,
  children,
}: FieldWrapperProps) {
  return (
    <Wrapper>
      <Label htmlFor={name} $required={required}>
        {label}
      </Label>

      {helpText && <HelpText>{helpText}</HelpText>}

      {children}

      {error && (
        <ErrorMessage>
          <AlertCircle size={16} />
          <span>{error}</span>
        </ErrorMessage>
      )}
    </Wrapper>
  );
}
