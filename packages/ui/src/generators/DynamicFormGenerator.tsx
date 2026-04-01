/**
 * DynamicFormGenerator - Generates forms from schema manifest
 * Maps field types to Design System components automatically
 */

import React, { useMemo, useCallback } from 'react';
import { useForm, Controller, UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldSchema, CollectionSchema, FormSection } from '@kiban/types';
import { SchemaProvider } from '@kiban/core';

// Design System component imports (these would come from your actual DS)
import {
  Form,
  FormField,
  FormSection as Section,
  TextInput,
  TextArea,
  NumberInput,
  DatePicker,
  Switch,
  Select,
  MultiSelect,
  RadioGroup,
  CheckboxGroup,
  TagInput,
  ColorPicker,
  MediaPicker,
  LocationPicker,
  JsonEditor,
  RichTextEditor,
  Button,
  Stack,
  Grid,
} from '../components';

// ============================================
// TYPES
// ============================================

interface DynamicFormGeneratorProps {
  collection: CollectionSchema;
  schemaProvider: SchemaProvider;
  initialData?: Record<string, any>;
  onSubmit: (data: any) => void | Promise<void>;
  onCancel?: () => void;
  mode?: 'create' | 'edit';
  readOnly?: boolean;
  showDebug?: boolean;
}

interface FieldRendererProps {
  field: FieldSchema;
  form: UseFormReturn<any>;
  disabled?: boolean;
  readOnly?: boolean;
  onChange?: (value: any) => void;
}

// ============================================
// FIELD COMPONENT MAPPING
// ============================================

const FIELD_COMPONENTS: Record<string, React.ComponentType<any>> = {
  text: TextInput,
  textarea: TextArea,
  richtext: RichTextEditor,
  number: NumberInput,
  integer: NumberInput,
  boolean: Switch,
  switch: Switch,
  date: DatePicker,
  datetime: DatePicker,
  select: Select,
  multiselect: MultiSelect,
  radio: RadioGroup,
  checkbox: CheckboxGroup,
  tags: TagInput,
  email: TextInput,
  url: TextInput,
  slug: TextInput,
  color: ColorPicker,
  media: MediaPicker,
  image: MediaPicker,
  file: MediaPicker,
  geo: LocationPicker,
  location: LocationPicker,
  json: JsonEditor,
  object: JsonEditor,
  // Add more mappings as needed
};

// ============================================
// FIELD RENDERER
// ============================================

const FieldRenderer: React.FC<FieldRendererProps> = ({
  field,
  form,
  disabled,
  readOnly,
  onChange,
}) => {
  const { control, watch, formState: { errors } } = form;

  // Handle conditional display
  const shouldDisplay = useMemo(() => {
    if (!field.conditions || field.conditions.length === 0) return true;

    for (const condition of field.conditions) {
      const fieldValue = watch(condition.field);
      let conditionMet = false;

      switch (condition.operator) {
        case 'equals':
          conditionMet = fieldValue === condition.value;
          break;
        case 'not_equals':
          conditionMet = fieldValue !== condition.value;
          break;
        case 'contains':
          conditionMet = fieldValue?.includes?.(condition.value);
          break;
        case 'greater_than':
          conditionMet = fieldValue > condition.value;
          break;
        case 'less_than':
          conditionMet = fieldValue < condition.value;
          break;
        case 'in':
          conditionMet = condition.value.includes(fieldValue);
          break;
        case 'not_in':
          conditionMet = !condition.value.includes(fieldValue);
          break;
      }

      if (condition.action === 'hide' && conditionMet) return false;
      if (condition.action === 'show' && !conditionMet) return false;
    }

    return true;
  }, [field.conditions, watch]);

  if (!shouldDisplay) return null;

  // Get the component for this field type
  const Component = field.ui?.component
    ? FIELD_COMPONENTS[field.ui.component]
    : FIELD_COMPONENTS[field.type];

  if (!Component) {
    console.warn(`No component found for field type: ${field.type}`);
    return null;
  }

  // Build field props
  const fieldProps = {
    label: field.label,
    placeholder: field.placeholder,
    helpText: field.helpText,
    required: field.required,
    disabled: disabled || field.disabled,
    readOnly: readOnly || field.readOnly,
    error: errors[field.name]?.message,
    ...field.ui?.props,
  };

  // Add type-specific props
  switch (field.type) {
    case 'number':
    case 'integer':
      fieldProps.min = field.min;
      fieldProps.max = field.max;
      fieldProps.step = field.step;
      fieldProps.integer = field.type === 'integer';
      break;

    case 'text':
    case 'textarea':
    case 'email':
    case 'url':
      fieldProps.minLength = field.minLength;
      fieldProps.maxLength = field.maxLength;
      fieldProps.type = field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text';
      break;

    case 'select':
    case 'multiselect':
    case 'radio':
    case 'checkbox':
      fieldProps.options = field.options;
      fieldProps.multiple = field.type === 'multiselect' || field.type === 'checkbox';
      break;

    case 'media':
    case 'image':
    case 'file':
      fieldProps.accept = field.accept;
      fieldProps.maxSize = field.maxSize;
      fieldProps.multiple = field.multiple;
      fieldProps.mediaType = field.type;
      break;

    case 'richtext':
      fieldProps.toolbar = field.toolbar;
      break;

    case 'date':
    case 'datetime':
      fieldProps.showTime = field.type === 'datetime';
      break;

    case 'relation':
    case 'reference':
      fieldProps.collection = field.relationship?.collection;
      fieldProps.displayField = field.relationship?.displayField;
      fieldProps.multiple = field.relationship?.multiple;
      fieldProps.searchFields = field.relationship?.searchFields;
      break;
  }

  return (
    <Controller
      name={field.name}
      control={control}
      defaultValue={field.defaultValue}
      render={({ field: controllerField }) => (
        <FormField width={field.ui?.form?.width}>
          <Component
            {...fieldProps}
            {...controllerField}
            onChange={(value: any) => {
              controllerField.onChange(value);
              onChange?.(value);
            }}
          />
        </FormField>
      )}
    />
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const DynamicFormGenerator: React.FC<DynamicFormGeneratorProps> = ({
  collection,
  schemaProvider,
  initialData,
  onSubmit,
  onCancel,
  mode = 'create',
  readOnly = false,
  showDebug = false,
}) => {
  // Get validator from schema provider
  const validator = useMemo(
    () => schemaProvider.getValidator(collection.slug),
    [schemaProvider, collection.slug]
  );

  // Initialize form with zod validation
  const form = useForm({
    defaultValues: initialData || {},
    resolver: validator ? zodResolver(validator) : undefined,
    mode: 'onChange',
  });

  const {
    handleSubmit,
    formState: { isSubmitting, isValid, isDirty },
    watch,
  } = form;

  // Handle form submission
  const handleFormSubmit = useCallback(async (data: any) => {
    try {
      // Apply any transformations
      const transformedData = { ...data };

      // Add metadata
      if (mode === 'create') {
        transformedData.created_at = new Date().toISOString();
      }
      transformedData.updated_at = new Date().toISOString();

      await onSubmit(transformedData);
    } catch (error) {
      console.error('Form submission error:', error);
    }
  }, [mode, onSubmit]);

  // Group fields by section
  const fieldSections = useMemo(() => {
    const sections: Map<string, FieldSchema[]> = new Map();

    if (collection.ui?.form?.sections) {
      // Use configured sections
      for (const section of collection.ui.form.sections) {
        const sectionFields = collection.fields.filter(
          field => section.fields.includes(field.name)
        );
        sections.set(section.label, sectionFields);
      }

      // Add uncategorized fields
      const categorizedFields = collection.ui.form.sections.flatMap(s => s.fields);
      const uncategorizedFields = collection.fields.filter(
        field => !categorizedFields.includes(field.name)
      );
      if (uncategorizedFields.length > 0) {
        sections.set('Other', uncategorizedFields);
      }
    } else {
      // Group by field.ui.form.group or put in General
      for (const field of collection.fields) {
        const group = field.ui?.form?.group || 'General';
        if (!sections.has(group)) {
          sections.set(group, []);
        }
        sections.get(group)!.push(field);
      }
    }

    return sections;
  }, [collection]);

  // Render fields in grid layout
  const renderFieldGroup = (fields: FieldSchema[]) => {
    // Sort fields by order
    const sortedFields = [...fields].sort(
      (a, b) => (a.ui?.form?.order || 999) - (b.ui?.form?.order || 999)
    );

    return (
      <Grid columns={12} gap={4}>
        {sortedFields.map(field => (
          <Grid.Item
            key={field.name}
            span={
              field.ui?.form?.width === 'full' ? 12 :
              field.ui?.form?.width === 'half' ? 6 :
              field.ui?.form?.width === 'third' ? 4 :
              field.ui?.form?.width === 'quarter' ? 3 : 12
            }
          >
            <FieldRenderer
              field={field}
              form={form}
              disabled={isSubmitting}
              readOnly={readOnly}
            />
          </Grid.Item>
        ))}
      </Grid>
    );
  };

  const formLayout = collection.ui?.form?.layout || 'single';

  return (
    <Form onSubmit={handleSubmit(handleFormSubmit)}>
      <Stack spacing={6}>
        {/* Form sections */}
        {formLayout === 'single' ? (
          // Single column layout
          <Stack spacing={4}>
            {Array.from(fieldSections.entries()).map(([sectionName, fields]) => (
              <Section key={sectionName} title={sectionName}>
                {renderFieldGroup(fields)}
              </Section>
            ))}
          </Stack>
        ) : formLayout === 'tabs' ? (
          // Tab layout
          <div>
            {/* Tab implementation would go here */}
            {Array.from(fieldSections.entries()).map(([sectionName, fields]) => (
              <div key={sectionName}>
                <h3>{sectionName}</h3>
                {renderFieldGroup(fields)}
              </div>
            ))}
          </div>
        ) : (
          // Default to single
          <Stack spacing={4}>
            {Array.from(fieldSections.entries()).map(([sectionName, fields]) => (
              <Section key={sectionName} title={sectionName}>
                {renderFieldGroup(fields)}
              </Section>
            ))}
          </Stack>
        )}

        {/* Debug panel */}
        {showDebug && (
          <Section title="Debug" collapsible defaultCollapsed>
            <pre style={{ fontSize: '12px', overflow: 'auto' }}>
              {JSON.stringify(watch(), null, 2)}
            </pre>
          </Section>
        )}

        {/* Form actions */}
        {!readOnly && (
          <Stack direction="horizontal" spacing={3} justify="end">
            {onCancel && (
              <Button
                variant="secondary"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                {collection.ui?.form?.cancelLabel || 'Cancel'}
              </Button>
            )}
            <Button
              type="submit"
              disabled={isSubmitting || !isValid || !isDirty}
              loading={isSubmitting}
            >
              {collection.ui?.form?.submitLabel || (mode === 'create' ? 'Create' : 'Save')}
            </Button>
          </Stack>
        )}
      </Stack>
    </Form>
  );
};

export default DynamicFormGenerator;