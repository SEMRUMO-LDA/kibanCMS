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

    // Type checks. Anything not in this switch is accepted as-is — the
    // CMS's field registry has long since outgrown a hard-coded type list
    // and we'd rather pass through unknown types than block legitimate
    // edits with a confusing "validation failed" error.
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
      case 'email':
      case 'url':
        if (typeof value !== 'string') {
          errors.push(`Field "${field.name}" must be a string`);
        } else if (field.maxLength && value.length > field.maxLength) {
          errors.push(`Field "${field.name}" exceeds max length of ${field.maxLength}`);
        }
        break;
      case 'date':
        // Accept ISO strings and numeric timestamps. Date instances don't
        // round-trip through JSON so we don't need to handle them here.
        if (typeof value === 'string') {
          if (isNaN(Date.parse(value))) {
            errors.push(`Field "${field.name}" must be a valid date`);
          }
        } else if (typeof value !== 'number') {
          errors.push(`Field "${field.name}" must be a valid date`);
        }
        break;
      case 'select':
        if (typeof value !== 'string') {
          errors.push(`Field "${field.name}" must be a string`);
        }
        break;
      case 'multiselect':
        if (!Array.isArray(value)) {
          errors.push(`Field "${field.name}" must be an array`);
        }
        break;
      case 'image':
        // Modern image fields can store EITHER a plain URL string OR an
        // object {url, focal:{x,y}, alt, ...} when the focal-point picker
        // is in use. Both are valid; anything else (number, boolean, raw
        // array) is a real error.
        if (
          typeof value !== 'string' &&
          !(value && typeof value === 'object' && !Array.isArray(value))
        ) {
          errors.push(`Field "${field.name}" must be a URL string or media object`);
        }
        break;
      // Composite / custom types (media_caption_list, weekly_schedule,
      // fixed_slots, accessibility_info, cancellation_policy, faq, ...).
      // These are stored as arrays/objects and have their own UI editors
      // — strict per-shape validation lives in those editors. Skip here.
    }
  }

  return errors;
}
