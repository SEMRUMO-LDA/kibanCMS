/**
 * FieldEditor Component
 *
 * Individual field configuration editor
 * Supports all field types from schema.types.ts
 */

import { useState, memo, useCallback } from 'react';
import styled from 'styled-components';
import { colors, spacing, typography, borders, shadows, animations } from '../../shared/styles/design-tokens';
import { X, GripVertical, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

// ============================================
// TYPES
// ============================================

export interface FieldDefinition {
  id: string; // Unique ID for React keys
  name: string; // Field name (database column)
  type: string; // Field type
  label: string; // Display label
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  unique?: boolean;
  searchable?: boolean;

  // Type-specific options
  maxLength?: number;
  minLength?: number;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
  accept?: string; // For file uploads
  multiple?: boolean;
  defaultValue?: any;
}

interface FieldEditorProps {
  field: FieldDefinition;
  onChange: (field: FieldDefinition) => void;
  onDelete: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

// ============================================
// STYLED COMPONENTS
// ============================================

const EditorContainer = styled.div`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.lg};
  overflow: hidden;
  transition: all ${animations.duration.fast} ${animations.easing.out};

  &:hover {
    border-color: ${colors.accent[300]};
    box-shadow: ${shadows.sm};
  }

  &.dragging {
    opacity: 0.5;
    cursor: grabbing;
  }
`;

const EditorHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  padding: ${spacing[4]};
  background: ${colors.gray[50]};
  border-bottom: 1px solid ${colors.gray[200]};
  cursor: pointer;
  user-select: none;

  &:hover {
    background: ${colors.gray[100]};
  }

  .drag-handle {
    cursor: grab;
    color: ${colors.gray[400]};

    &:hover {
      color: ${colors.gray[600]};
    }
  }

  .field-info {
    flex: 1;
    min-width: 0;

    .field-label {
      font-size: ${typography.fontSize.sm};
      font-weight: ${typography.fontWeight.semibold};
      color: ${colors.gray[900]};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .field-meta {
      font-size: ${typography.fontSize.xs};
      color: ${colors.gray[500]};
      margin-top: ${spacing[1]};

      .type-badge {
        display: inline-block;
        padding: ${spacing[1]} ${spacing[2]};
        background: ${colors.accent[100]};
        color: ${colors.accent[700]};
        border-radius: ${borders.radius.md};
        font-weight: ${typography.fontWeight.medium};
        margin-right: ${spacing[2]};
      }

      .required-badge {
        color: ${colors.red[600]};
        font-weight: ${typography.fontWeight.semibold};
      }
    }
  }

  .header-actions {
    display: flex;
    gap: ${spacing[2]};

    button {
      background: none;
      border: none;
      cursor: pointer;
      padding: ${spacing[2]};
      border-radius: ${borders.radius.md};
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all ${animations.duration.fast} ${animations.easing.out};

      &:hover {
        background: ${colors.gray[200]};
      }

      &.delete-btn:hover {
        background: ${colors.red[100]};
        color: ${colors.red[600]};
      }

      svg {
        width: 16px;
        height: 16px;
      }
    }
  }
`;

const EditorBody = styled.div<{ $expanded: boolean }>`
  max-height: ${props => (props.$expanded ? '1000px' : '0')};
  overflow: hidden;
  transition: max-height ${animations.duration.normal} ${animations.easing.out};
`;

const EditorContent = styled.div`
  padding: ${spacing[5]};
  display: grid;
  gap: ${spacing[4]};
  grid-template-columns: repeat(2, 1fr);

  .full-width {
    grid-column: 1 / -1;
  }
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[2]};

  label {
    font-size: ${typography.fontSize.xs};
    font-weight: ${typography.fontWeight.semibold};
    color: ${colors.gray[700]};
    text-transform: uppercase;
    letter-spacing: ${typography.letterSpacing.wide};
  }

  input,
  textarea,
  select {
    padding: ${spacing[3]} ${spacing[3]};
    border: 1px solid ${colors.gray[300]};
    border-radius: ${borders.radius.md};
    font-size: ${typography.fontSize.sm};
    font-family: ${typography.fontFamily.sans};
    color: ${colors.gray[900]};
    transition: all ${animations.duration.fast} ${animations.easing.out};

    &:focus {
      outline: none;
      border-color: ${colors.accent[500]};
      box-shadow: 0 0 0 3px ${colors.accent[500]}20;
    }

    &::placeholder {
      color: ${colors.gray[400]};
    }
  }

  textarea {
    min-height: 60px;
    resize: vertical;
    font-family: ${typography.fontFamily.mono};
    font-size: ${typography.fontSize.xs};
  }

  .help-text {
    font-size: ${typography.fontSize.xs};
    color: ${colors.gray[500]};
    margin-top: -${spacing[1]};
  }
`;

const CheckboxGroup = styled.label`
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  cursor: pointer;
  padding: ${spacing[2]};
  border-radius: ${borders.radius.md};
  transition: background ${animations.duration.fast} ${animations.easing.out};

  &:hover {
    background: ${colors.gray[50]};
  }

  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  span {
    font-size: ${typography.fontSize.sm};
    color: ${colors.gray[700]};
  }
`;

// ============================================
// COMPONENT
// ============================================

export const FieldEditor: React.FC<FieldEditorProps> = memo(({
  field,
  onChange,
  onDelete,
  onDragStart,
  onDragEnd,
}) => {
  const [expanded, setExpanded] = useState(false);

  const handleChange = useCallback((key: keyof FieldDefinition, value: any) => {
    onChange({ ...field, [key]: value });
  }, [field, onChange]);

  // Auto-generate field name from label (slugify)
  const handleLabelChange = useCallback((label: string) => {
    const updates: Partial<FieldDefinition> = { label };

    // Only auto-generate name if it's empty or matches the previous label
    if (!field.name || field.name === field.label.toLowerCase().replace(/\s+/g, '_')) {
      const generatedName = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      updates.name = generatedName;
    }

    onChange({ ...field, ...updates });
  }, [field, onChange]);

  // Type-specific configuration fields
  const renderTypeSpecificFields = () => {
    switch (field.type) {
      case 'text':
      case 'textarea':
      case 'email':
      case 'url':
        return (
          <>
            <FormGroup>
              <label>Min Length</label>
              <input
                type="number"
                min="0"
                value={field.minLength || ''}
                onChange={(e) => handleChange('minLength', e.target.value ? parseInt(e.target.value) : undefined)}
                placeholder="No minimum"
              />
            </FormGroup>
            <FormGroup>
              <label>Max Length</label>
              <input
                type="number"
                min="0"
                value={field.maxLength || ''}
                onChange={(e) => handleChange('maxLength', e.target.value ? parseInt(e.target.value) : undefined)}
                placeholder="No maximum"
              />
            </FormGroup>
          </>
        );

      case 'number':
      case 'integer':
        return (
          <>
            <FormGroup>
              <label>Min Value</label>
              <input
                type="number"
                value={field.min || ''}
                onChange={(e) => handleChange('min', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="No minimum"
              />
            </FormGroup>
            <FormGroup>
              <label>Max Value</label>
              <input
                type="number"
                value={field.max || ''}
                onChange={(e) => handleChange('max', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="No maximum"
              />
            </FormGroup>
            <FormGroup>
              <label>Step</label>
              <input
                type="number"
                min="0"
                step="any"
                value={field.step || ''}
                onChange={(e) => handleChange('step', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="1"
              />
            </FormGroup>
          </>
        );

      case 'select':
      case 'radio':
      case 'checkbox':
      case 'multiselect':
        return (
          <FormGroup className="full-width">
            <label>Options (one per line: value|label)</label>
            <textarea
              value={field.options?.map(opt => `${opt.value}|${opt.label}`).join('\n') || ''}
              onChange={(e) => {
                const options = e.target.value
                  .split('\n')
                  .filter(line => line.trim())
                  .map(line => {
                    const [value, label] = line.split('|').map(s => s.trim());
                    return { value: value || '', label: label || value || '' };
                  });
                handleChange('options', options);
              }}
              placeholder="option1|Option 1&#10;option2|Option 2"
              rows={5}
            />
            <div className="help-text">
              Format: value|label (if no label provided, value will be used)
            </div>
          </FormGroup>
        );

      case 'image':
      case 'file':
      case 'media':
        return (
          <>
            <FormGroup>
              <label>Accepted Types</label>
              <input
                type="text"
                value={field.accept || ''}
                onChange={(e) => handleChange('accept', e.target.value)}
                placeholder="image/*"
              />
              <div className="help-text">e.g., image/*, .pdf, .doc</div>
            </FormGroup>
            <FormGroup>
              <CheckboxGroup>
                <input
                  type="checkbox"
                  checked={field.multiple || false}
                  onChange={(e) => handleChange('multiple', e.target.checked)}
                />
                <span>Allow Multiple Files</span>
              </CheckboxGroup>
            </FormGroup>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <EditorContainer
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <EditorHeader onClick={() => setExpanded(!expanded)}>
        <div
          className="drag-handle"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <GripVertical size={18} />
        </div>

        <div className="field-info">
          <div className="field-label">{field.label || 'Untitled Field'}</div>
          <div className="field-meta">
            <span className="type-badge">{field.type}</span>
            {field.name && <span>name: {field.name}</span>}
            {field.required && <span className="required-badge"> • Required</span>}
          </div>
        </div>

        <div className="header-actions">
          <button
            className="delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete field"
          >
            <Trash2 />
          </button>
          <button>
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </EditorHeader>

      <EditorBody $expanded={expanded}>
        <EditorContent>
          {/* Basic Configuration */}
          <FormGroup>
            <label>Field Label *</label>
            <input
              type="text"
              value={field.label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="Field Label"
              required
            />
          </FormGroup>

          <FormGroup>
            <label>Field Name *</label>
            <input
              type="text"
              value={field.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="field_name"
              pattern="[a-z0-9_]+"
              required
            />
            <div className="help-text">Lowercase letters, numbers, underscores only</div>
          </FormGroup>

          <FormGroup className="full-width">
            <label>Placeholder Text</label>
            <input
              type="text"
              value={field.placeholder || ''}
              onChange={(e) => handleChange('placeholder', e.target.value)}
              placeholder="Enter placeholder text..."
            />
          </FormGroup>

          <FormGroup className="full-width">
            <label>Help Text</label>
            <input
              type="text"
              value={field.helpText || ''}
              onChange={(e) => handleChange('helpText', e.target.value)}
              placeholder="Additional help or instructions..."
            />
          </FormGroup>

          {/* Type-specific fields */}
          {renderTypeSpecificFields()}

          {/* Validation Options */}
          <FormGroup className="full-width">
            <label>Validation</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[2] }}>
              <CheckboxGroup>
                <input
                  type="checkbox"
                  checked={field.required || false}
                  onChange={(e) => handleChange('required', e.target.checked)}
                />
                <span>Required Field</span>
              </CheckboxGroup>

              <CheckboxGroup>
                <input
                  type="checkbox"
                  checked={field.unique || false}
                  onChange={(e) => handleChange('unique', e.target.checked)}
                />
                <span>Unique Value</span>
              </CheckboxGroup>

              <CheckboxGroup>
                <input
                  type="checkbox"
                  checked={field.searchable || false}
                  onChange={(e) => handleChange('searchable', e.target.checked)}
                />
                <span>Searchable</span>
              </CheckboxGroup>
            </div>
          </FormGroup>
        </EditorContent>
      </EditorBody>
    </EditorContainer>
  );
});
