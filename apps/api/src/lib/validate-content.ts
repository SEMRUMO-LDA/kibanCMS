/**
 * Content Validation
 * Validates entry content against collection field definitions.
 */

export interface FieldDef {
  id: string;
  name: string;
  type: string;
  required?: boolean;
  maxLength?: number;
}

export function validateContent(content: Record<string, any>, fields: FieldDef[]): string[] {
  const errors: string[] = [];
  if (!fields || fields.length === 0) return errors;

  for (const field of fields) {
    const value = content[field.id];

    // Required check
    if (field.required && (value === undefined || value === null || value === '')) {
      errors.push(`Field "${field.name}" (${field.id}) is required`);
      continue;
    }

    // Skip validation if value is empty and not required
    if (value === undefined || value === null || value === '') continue;

    // Type checks
    switch (field.type) {
      case 'number':
        if (typeof value !== 'number' && isNaN(Number(value))) {
          errors.push(`Field "${field.name}" must be a number`);
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`Field "${field.name}" must be a boolean`);
        }
        break;
      case 'text':
      case 'textarea':
      case 'richtext':
      case 'slug':
        if (typeof value !== 'string') {
          errors.push(`Field "${field.name}" must be a string`);
        } else if (field.maxLength && value.length > field.maxLength) {
          errors.push(`Field "${field.name}" exceeds max length of ${field.maxLength}`);
        }
        break;
      case 'date':
        if (typeof value === 'string' && isNaN(Date.parse(value))) {
          errors.push(`Field "${field.name}" must be a valid date`);
        }
        break;
      case 'select':
        if (typeof value !== 'string') {
          errors.push(`Field "${field.name}" must be a string`);
        }
        break;
      case 'image':
        if (typeof value !== 'string') {
          errors.push(`Field "${field.name}" must be a string (URL or media ID)`);
        }
        break;
    }
  }

  return errors;
}
