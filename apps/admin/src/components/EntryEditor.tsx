/**
 * EntryEditor Component
 *
 * Dynamic form builder for creating/editing entries
 * Renders fields based on collection schema
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { colors, spacing, typography, borders, shadows, animations } from '../shared/styles/design-tokens';
import { FieldRenderer, type FieldDefinition } from './fields/FieldRenderer';
import { Save, AlertCircle, CheckCircle } from 'lucide-react';

const EditorContainer = styled.div`
  max-width: 900px;
  margin: 0 auto;
`;

const Form = styled.form`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  overflow: hidden;
`;

const FormBody = styled.div`
  padding: ${spacing[8]};
`;

const FormFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${spacing[6]} ${spacing[8]};
  background: ${colors.gray[50]};
  border-top: 1px solid ${colors.gray[200]};
  gap: ${spacing[4]};
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: ${spacing[3]};
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: ${spacing[3]} ${spacing[6]};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.semibold};
  font-family: ${typography.fontFamily.sans};
  border-radius: ${borders.radius.md};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: ${spacing[2]};
  transition: all ${animations.duration.fast} ${animations.easing.out};

  ${props => props.$variant === 'primary' ? `
    background: ${colors.accent[500]};
    color: ${colors.white};
    border: 1px solid ${colors.accent[500]};

    &:hover:not(:disabled) {
      background: ${colors.accent[600]};
      border-color: ${colors.accent[600]};
    }
  ` : `
    background: ${colors.white};
    color: ${colors.gray[700]};
    border: 1px solid ${colors.gray[300]};

    &:hover:not(:disabled) {
      background: ${colors.gray[50]};
      border-color: ${colors.gray[400]};
    }
  `}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const StatusIndicator = styled.div<{ $status: 'idle' | 'saving' | 'saved' | 'error' }>`
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  font-size: ${typography.fontSize.sm};
  color: ${props => {
    switch (props.$status) {
      case 'saving': return colors.gray[600];
      case 'saved': return colors.accent[600];
      case 'error': return colors.accent[600];
      default: return colors.gray[500];
    }
  }};

  svg {
    width: 16px;
    height: 16px;
  }
`;

const ErrorSummary = styled.div`
  margin-bottom: ${spacing[6]};
  padding: ${spacing[4]};
  background: ${colors.gray[50]};
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.md};
  display: flex;
  align-items: flex-start;
  gap: ${spacing[3]};

  svg {
    color: ${colors.accent[500]};
    flex-shrink: 0;
    margin-top: 2px;
  }

  div {
    flex: 1;

    h4 {
      margin: 0 0 ${spacing[2]} 0;
      font-size: ${typography.fontSize.sm};
      font-weight: ${typography.fontWeight.semibold};
      color: ${colors.gray[900]};
    }

    ul {
      margin: 0;
      padding-left: ${spacing[5]};
      font-size: ${typography.fontSize.sm};
      color: ${colors.gray[700]};

      li {
        margin-bottom: ${spacing[1]};
      }
    }
  }
`;

export interface EntryData {
  [key: string]: any;
}

interface EntryEditorProps {
  fields: FieldDefinition[];
  initialData?: EntryData;
  onSave: (data: EntryData) => Promise<void>;
  onCancel?: () => void;
  saveButtonText?: string;
}

export function EntryEditor({
  fields,
  initialData = {},
  onSave,
  onCancel,
  saveButtonText = 'Save Entry',
}: EntryEditorProps) {
  const [data, setData] = useState<EntryData>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isDirty, setIsDirty] = useState(false);

  // Initialize data with default values for required fields
  useEffect(() => {
    const initializedData: EntryData = { ...initialData };
    fields.forEach(field => {
      if (!(field.id in initializedData)) {
        // Set default values based on field type
        switch (field.type) {
          case 'boolean':
            initializedData[field.id] = false;
            break;
          case 'number':
            initializedData[field.id] = 0;
            break;
          default:
            initializedData[field.id] = '';
        }
      }
    });
    setData(initializedData);
  }, [fields, initialData]);

  const handleFieldChange = (fieldId: string, value: any) => {
    setData(prev => ({ ...prev, [fieldId]: value }));
    setIsDirty(true);
    setSaveStatus('idle');

    // Clear error for this field if it exists
    if (errors[fieldId]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldId];
        return newErrors;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    fields.forEach(field => {
      if (field.required) {
        const value = data[field.id];
        if (
          value === undefined ||
          value === null ||
          value === '' ||
          (Array.isArray(value) && value.length === 0)
        ) {
          newErrors[field.id] = `${field.name} is required`;
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      setSaveStatus('error');
      return;
    }

    setSaveStatus('saving');

    try {
      await onSave(data);
      setSaveStatus('saved');
      setIsDirty(false);

      // Reset to idle after 2 seconds
      setTimeout(() => {
        setSaveStatus('idle');
      }, 2000);
    } catch (error) {
      console.error('Error saving entry:', error);
      setSaveStatus('error');
    }
  };

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <EditorContainer>
      <Form onSubmit={handleSubmit}>
        <FormBody>
          {hasErrors && (
            <ErrorSummary>
              <AlertCircle size={20} />
              <div>
                <h4>Please fix the following errors:</h4>
                <ul>
                  {Object.entries(errors).map(([fieldId, error]) => (
                    <li key={fieldId}>{error}</li>
                  ))}
                </ul>
              </div>
            </ErrorSummary>
          )}

          {fields.map(field => (
            <FieldRenderer
              key={field.id}
              field={field}
              value={data[field.id]}
              onChange={(value) => handleFieldChange(field.id, value)}
              error={errors[field.id]}
            />
          ))}
        </FormBody>

        <FormFooter>
          <StatusIndicator $status={saveStatus}>
            {saveStatus === 'saving' && '↻ Saving...'}
            {saveStatus === 'saved' && (
              <>
                <CheckCircle />
                <span>Saved successfully</span>
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <AlertCircle />
                <span>Error saving</span>
              </>
            )}
            {saveStatus === 'idle' && isDirty && (
              <span>Unsaved changes</span>
            )}
          </StatusIndicator>

          <ButtonGroup>
            {onCancel && (
              <Button
                type="button"
                $variant="secondary"
                onClick={onCancel}
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              $variant="primary"
              disabled={saveStatus === 'saving'}
            >
              <Save />
              {saveButtonText}
            </Button>
          </ButtonGroup>
        </FormFooter>
      </Form>
    </EditorContainer>
  );
}
