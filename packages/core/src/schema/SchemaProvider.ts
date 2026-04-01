/**
 * SchemaProvider - Dynamic Schema Configuration Engine
 * Generates UI and forms based on manifest configuration
 */

import { z } from 'zod';
import type {
  SchemaManifest,
  CollectionSchema,
  FieldSchema,
  FieldType,
  ValidationRule,
  RelationshipConfig,
  UIHints,
} from '@kiban/types';

export class SchemaProvider {
  private manifest: SchemaManifest;
  private schemas: Map<string, CollectionSchema>;
  private validators: Map<string, z.ZodSchema>;
  private relationships: Map<string, RelationshipConfig[]>;

  constructor(manifest: SchemaManifest) {
    this.manifest = manifest;
    this.schemas = new Map();
    this.validators = new Map();
    this.relationships = new Map();

    this.parseManifest();
  }

  /**
   * Parse and validate manifest
   */
  private parseManifest(): void {
    // Validate manifest structure
    this.validateManifest();

    // Process collections
    for (const collection of this.manifest.collections) {
      this.schemas.set(collection.slug, collection);
      this.validators.set(collection.slug, this.buildValidator(collection));

      // Extract relationships
      const relations = collection.fields
        .filter(f => f.type === 'relation' || f.type === 'reference')
        .map(f => f.relationship!)
        .filter(Boolean);

      if (relations.length > 0) {
        this.relationships.set(collection.slug, relations);
      }
    }
  }

  /**
   * Validate manifest structure
   */
  private validateManifest(): void {
    const ManifestSchema = z.object({
      version: z.string(),
      name: z.string(),
      collections: z.array(z.any()), // Will be validated per collection
      settings: z.object({
        defaultLocale: z.string().optional(),
        enabledLocales: z.array(z.string()).optional(),
        features: z.object({
          ai: z.boolean().optional(),
          geo: z.boolean().optional(),
          media: z.boolean().optional(),
          i18n: z.boolean().optional(),
          versioning: z.boolean().optional(),
          webhooks: z.boolean().optional(),
        }).optional(),
      }).optional(),
    });

    ManifestSchema.parse(this.manifest);
  }

  /**
   * Build Zod validator for collection
   */
  private buildValidator(collection: CollectionSchema): z.ZodSchema {
    const shape: Record<string, any> = {};

    for (const field of collection.fields) {
      let fieldValidator = this.getFieldValidator(field);

      // Apply validation rules
      if (field.validation) {
        fieldValidator = this.applyValidationRules(fieldValidator, field.validation);
      }

      // Apply required/optional
      if (!field.required) {
        fieldValidator = fieldValidator.optional();
      }

      shape[field.name] = fieldValidator;
    }

    return z.object(shape);
  }

  /**
   * Get base validator for field type
   */
  private getFieldValidator(field: FieldSchema): z.ZodSchema {
    switch (field.type) {
      case 'text':
      case 'textarea':
      case 'richtext':
        return z.string();

      case 'number':
      case 'integer':
        return field.type === 'integer' ? z.number().int() : z.number();

      case 'boolean':
      case 'switch':
        return z.boolean();

      case 'date':
      case 'datetime':
      case 'time':
        return z.string().datetime();

      case 'email':
        return z.string().email();

      case 'url':
        return z.string().url();

      case 'slug':
        return z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

      case 'select':
      case 'radio':
        return z.enum(field.options?.map(o => o.value) as [string, ...string[]]);

      case 'multiselect':
      case 'checkbox':
      case 'tags':
        return z.array(z.string());

      case 'json':
      case 'object':
        return z.record(z.any());

      case 'array':
        return z.array(z.any());

      case 'media':
      case 'image':
      case 'file':
        return z.string().uuid();

      case 'geo':
      case 'location':
        return z.object({
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
          address: z.string().optional(),
        });

      case 'color':
        return z.string().regex(/^#[0-9A-F]{6}$/i);

      case 'relation':
      case 'reference':
        return field.relationship?.multiple
          ? z.array(z.string().uuid())
          : z.string().uuid();

      case 'blocks':
        return z.array(z.object({
          id: z.string(),
          type: z.string(),
          content: z.any(),
        }));

      default:
        return z.any();
    }
  }

  /**
   * Apply validation rules to validator
   */
  private applyValidationRules(
    validator: z.ZodSchema,
    rules: ValidationRule[]
  ): z.ZodSchema {
    let result = validator;

    for (const rule of rules) {
      switch (rule.type) {
        case 'min':
          if (result instanceof z.ZodString) {
            result = result.min(rule.value as number, rule.message);
          } else if (result instanceof z.ZodNumber) {
            result = result.min(rule.value as number, rule.message);
          }
          break;

        case 'max':
          if (result instanceof z.ZodString) {
            result = result.max(rule.value as number, rule.message);
          } else if (result instanceof z.ZodNumber) {
            result = result.max(rule.value as number, rule.message);
          }
          break;

        case 'pattern':
          if (result instanceof z.ZodString) {
            result = result.regex(new RegExp(rule.value as string), rule.message);
          }
          break;

        case 'custom':
          result = result.refine(
            (val) => this.executeCustomValidation(rule.value as string, val),
            { message: rule.message }
          );
          break;
      }
    }

    return result;
  }

  /**
   * Execute custom validation function
   */
  private executeCustomValidation(functionName: string, value: any): boolean {
    // This would be extended to support custom validation functions
    // registered with the schema provider
    return true;
  }

  /**
   * Get collection schema
   */
  getCollection(slug: string): CollectionSchema | undefined {
    return this.schemas.get(slug);
  }

  /**
   * Get all collections
   */
  getAllCollections(): CollectionSchema[] {
    return Array.from(this.schemas.values());
  }

  /**
   * Get validator for collection
   */
  getValidator(collectionSlug: string): z.ZodSchema | undefined {
    return this.validators.get(collectionSlug);
  }

  /**
   * Validate data against collection schema
   */
  validate(collectionSlug: string, data: any): {
    success: boolean;
    data?: any;
    errors?: any;
  } {
    const validator = this.validators.get(collectionSlug);
    if (!validator) {
      return {
        success: false,
        errors: { _error: 'Collection not found' },
      };
    }

    try {
      const validated = validator.parse(data);
      return { success: true, data: validated };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          errors: error.flatten(),
        };
      }
      throw error;
    }
  }

  /**
   * Get field configuration
   */
  getField(collectionSlug: string, fieldName: string): FieldSchema | undefined {
    const collection = this.schemas.get(collectionSlug);
    return collection?.fields.find(f => f.name === fieldName);
  }

  /**
   * Get relationships for collection
   */
  getRelationships(collectionSlug: string): RelationshipConfig[] {
    return this.relationships.get(collectionSlug) || [];
  }

  /**
   * Generate form configuration for collection
   */
  generateFormConfig(collectionSlug: string): any {
    const collection = this.schemas.get(collectionSlug);
    if (!collection) return null;

    return {
      title: collection.label,
      description: collection.description,
      fields: collection.fields.map(field => ({
        name: field.name,
        label: field.label,
        type: this.mapFieldTypeToComponent(field.type),
        placeholder: field.placeholder,
        helpText: field.helpText,
        required: field.required,
        disabled: field.disabled,
        hidden: field.hidden,
        defaultValue: field.defaultValue,
        options: field.options,
        ui: field.ui,
        validation: field.validation,
        conditions: field.conditions,
      })),
      layout: collection.ui?.form?.layout || 'single',
      sections: collection.ui?.form?.sections,
      submitLabel: collection.ui?.form?.submitLabel || 'Save',
      cancelLabel: collection.ui?.form?.cancelLabel || 'Cancel',
    };
  }

  /**
   * Generate list/table configuration for collection
   */
  generateListConfig(collectionSlug: string): any {
    const collection = this.schemas.get(collectionSlug);
    if (!collection) return null;

    const listFields = collection.fields
      .filter(f => !f.hidden && f.ui?.list?.show !== false)
      .sort((a, b) => (a.ui?.list?.order || 999) - (b.ui?.list?.order || 999));

    return {
      title: collection.label,
      columns: listFields.map(field => ({
        key: field.name,
        label: field.label,
        type: field.type,
        sortable: field.ui?.list?.sortable !== false,
        searchable: field.searchable,
        width: field.ui?.list?.width,
        align: field.ui?.list?.align,
        render: field.ui?.list?.render, // Custom render function name
      })),
      actions: collection.ui?.list?.actions || ['view', 'edit', 'delete'],
      bulk: collection.ui?.list?.bulk || ['delete'],
      filters: this.generateFilters(collection),
      defaultSort: collection.ui?.list?.defaultSort,
      pagination: collection.ui?.list?.pagination !== false,
      search: collection.ui?.list?.search !== false,
    };
  }

  /**
   * Generate filter configuration
   */
  private generateFilters(collection: CollectionSchema): any[] {
    return collection.fields
      .filter(f => f.filterable)
      .map(field => ({
        key: field.name,
        label: field.label,
        type: this.mapFieldTypeToFilter(field.type),
        options: field.options,
        multiple: field.type === 'multiselect' || field.type === 'tags',
      }));
  }

  /**
   * Map field type to UI component
   */
  private mapFieldTypeToComponent(type: FieldType): string {
    const mapping: Record<FieldType, string> = {
      text: 'TextInput',
      textarea: 'TextArea',
      richtext: 'RichTextEditor',
      number: 'NumberInput',
      integer: 'NumberInput',
      boolean: 'Switch',
      switch: 'Switch',
      date: 'DatePicker',
      datetime: 'DateTimePicker',
      time: 'TimePicker',
      select: 'Select',
      multiselect: 'MultiSelect',
      radio: 'RadioGroup',
      checkbox: 'CheckboxGroup',
      tags: 'TagInput',
      email: 'EmailInput',
      url: 'UrlInput',
      slug: 'SlugInput',
      color: 'ColorPicker',
      media: 'MediaPicker',
      image: 'ImagePicker',
      file: 'FilePicker',
      geo: 'LocationPicker',
      location: 'LocationPicker',
      json: 'JsonEditor',
      object: 'ObjectEditor',
      array: 'ArrayEditor',
      relation: 'RelationPicker',
      reference: 'ReferencePicker',
      blocks: 'BlockEditor',
    };

    return mapping[type] || 'TextInput';
  }

  /**
   * Map field type to filter component
   */
  private mapFieldTypeToFilter(type: FieldType): string {
    const mapping: Record<FieldType, string> = {
      text: 'TextFilter',
      textarea: 'TextFilter',
      richtext: 'TextFilter',
      number: 'NumberRangeFilter',
      integer: 'NumberRangeFilter',
      boolean: 'BooleanFilter',
      switch: 'BooleanFilter',
      date: 'DateRangeFilter',
      datetime: 'DateRangeFilter',
      time: 'TimeRangeFilter',
      select: 'SelectFilter',
      multiselect: 'MultiSelectFilter',
      radio: 'SelectFilter',
      checkbox: 'MultiSelectFilter',
      tags: 'TagFilter',
      email: 'TextFilter',
      url: 'TextFilter',
      slug: 'TextFilter',
      color: 'ColorFilter',
      media: 'MediaFilter',
      image: 'MediaFilter',
      file: 'MediaFilter',
      geo: 'GeoFilter',
      location: 'GeoFilter',
      json: 'JsonFilter',
      object: 'JsonFilter',
      array: 'ArrayFilter',
      relation: 'RelationFilter',
      reference: 'RelationFilter',
      blocks: 'BlockFilter',
    };

    return mapping[type] || 'TextFilter';
  }

  /**
   * Update manifest at runtime
   */
  updateManifest(manifest: SchemaManifest): void {
    this.manifest = manifest;
    this.schemas.clear();
    this.validators.clear();
    this.relationships.clear();
    this.parseManifest();
  }

  /**
   * Export manifest
   */
  exportManifest(): SchemaManifest {
    return JSON.parse(JSON.stringify(this.manifest));
  }

  /**
   * Get manifest version
   */
  getVersion(): string {
    return this.manifest.version;
  }

  /**
   * Check if feature is enabled
   */
  isFeatureEnabled(feature: keyof SchemaManifest['settings']['features']): boolean {
    return this.manifest.settings?.features?.[feature] ?? false;
  }
}