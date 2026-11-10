/**
 * Field definitions live in two shapes.
 *
 * API / entry editor / validator / public API ("api" shape):
 *   { id: <content key>, name: <label or key>, label?: <label>, type, … }
 *   `content[field.id]` is what gets stored. Add-on collections ship as
 *   { id: 'x', name: 'x', label: 'X' }; presets as { id: 'x', name: 'X' }.
 *
 * Collection builder / collection editor ("editor" shape):
 *   { id: <React key>, name: <content key>, label: <label>, type, … }
 *
 * Saving editor fields unconverted stored entries under random keys such as
 * "field-1731…-0" and showed the API name as the label. Convert at the edges.
 */

type AnyField = Record<string, any>;

const toKey = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export function toApiFields(fields: AnyField[]): AnyField[] {
  return fields.map(({ id: _reactKey, name, label, ...rest }) => {
    const key = (name && String(name).trim()) || toKey(String(label || ''));
    return { ...rest, id: key, name: key, label: (label && String(label).trim()) || key };
  });
}

export function toEditorFields(fields: AnyField[]): AnyField[] {
  return fields.map((f, i) => {
    const key = f.name && f.label ? f.name : f.id;          // add-on / legacy-builder shape vs preset shape
    const label = f.label || (f.name && f.name !== f.id ? f.name : f.id);
    return { ...f, id: `fld_${i}_${key || i}`, name: key || '', label: label || '' };
  });
}
