/**
 * FieldRenderer Component
 *
 * Dynamic field renderer that selects the appropriate field component
 * based on the field type from the collection schema
 */

import { TextField } from './TextField';
import { TextAreaField } from './TextAreaField';
import { NumberField } from './NumberField';
import { BooleanField } from './BooleanField';
import { DateField } from './DateField';
import { SelectField } from './SelectField';
import { RichTextField } from './RichTextField';
import { ImageField } from './ImageField';

export interface FieldDefinition {
  id: string;
  name: string;
  type: 'text' | 'textarea' | 'richtext' | 'number' | 'boolean' | 'date' | 'select' | 'image' | 'url' | 'email' | 'slug';
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: Array<{ label: string; value: string }>; // For select fields
  min?: number; // For number fields
  max?: number; // For number fields
  step?: number; // For number fields
}

interface FieldRendererProps {
  field: FieldDefinition;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  disabled?: boolean;
}

export function FieldRenderer({
  field,
  value,
  onChange,
  error,
  disabled,
}: FieldRendererProps) {
  const commonProps = {
    name: field.id,
    label: field.name,
    required: field.required,
    helpText: field.helpText,
    error,
    disabled,
  };

  switch (field.type) {
    case 'text':
      return (
        <TextField
          {...commonProps}
          value={value || ''}
          onChange={onChange}
          placeholder={field.placeholder}
        />
      );

    case 'textarea':
      return (
        <TextAreaField
          {...commonProps}
          value={value || ''}
          onChange={onChange}
          placeholder={field.placeholder}
        />
      );

    case 'richtext':
      return (
        <RichTextField
          {...commonProps}
          value={value || ''}
          onChange={onChange}
          placeholder={field.placeholder}
        />
      );

    case 'number':
      return (
        <NumberField
          {...commonProps}
          value={value || 0}
          onChange={onChange}
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
          step={field.step}
        />
      );

    case 'boolean':
      return (
        <BooleanField
          {...commonProps}
          value={value || false}
          onChange={onChange}
          checkboxLabel={field.placeholder || 'Enable this option'}
        />
      );

    case 'date':
      return (
        <DateField
          {...commonProps}
          value={value || ''}
          onChange={onChange}
        />
      );

    case 'select':
      return (
        <SelectField
          {...commonProps}
          value={value || ''}
          onChange={onChange}
          options={field.options || []}
          placeholder={field.placeholder}
        />
      );

    case 'image':
      return (
        <ImageField
          {...commonProps}
          value={value || ''}
          onChange={onChange}
        />
      );

    case 'url':
    case 'email':
    case 'slug':
      return (
        <TextField
          {...commonProps}
          value={value || ''}
          onChange={onChange}
          placeholder={field.placeholder || (field.type === 'url' ? 'https://example.com' : field.type === 'email' ? 'email@example.com' : 'slug-like-this')}
        />
      );

    default:
      return (
        <div style={{ padding: '1rem', background: '#fee', border: '1px solid #fcc' }}>
          Unknown field type: {field.type}
        </div>
      );
  }
}

// Export field types for use elsewhere
export { TextField, TextAreaField, NumberField, BooleanField, DateField, SelectField, RichTextField, ImageField };
