/**
 * Collection Edit Page
 * Clean, functional editor for collection settings and fields.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { api } from '../lib/api';
import { useAuth } from '../features/auth/hooks/useAuth';
import { FieldTypeSelector } from '../components/collection-builder/FieldTypeSelector';
import {
  ArrowLeft, Save, Plus, Trash2, GripVertical, Loader, AlertCircle,
  ChevronDown, ChevronUp, Pencil,
} from 'lucide-react';
import { colors, spacing, typography, borders, shadows, animations } from '../shared/styles/design-tokens';

// ============================================
// TYPES
// ============================================

interface FieldDef {
  id: string;
  name: string;
  label?: string;
  type: string;
  required?: boolean;
  maxLength?: number;
  helpText?: string;
  placeholder?: string;
  unique?: boolean;
  searchable?: boolean;
  options?: Array<{ label: string; value: string }>;
}

interface CollectionData {
  id?: string;
  name: string;
  slug: string;
  description: string;
  type: 'post' | 'page' | 'custom';
  fields: FieldDef[];
}

// ============================================
// STYLED COMPONENTS
// ============================================

const Container = styled.div`max-width: 900px; margin: 0 auto;`;

const Header = styled.header`
  margin-bottom: ${spacing[8]};
  display: flex;
  align-items: center;
  gap: ${spacing[4]};

  .back-btn {
    background: none;
    border: 1px solid ${colors.gray[300]};
    border-radius: ${borders.radius.md};
    padding: ${spacing[2.5]};
    cursor: pointer;
    display: flex;
    color: ${colors.gray[600]};
    transition: all 0.15s;
    &:hover { background: ${colors.gray[50]}; border-color: ${colors.gray[400]}; }
  }

  h1 { font-size: ${typography.fontSize['2xl']}; font-weight: ${typography.fontWeight.bold}; margin: 0; }
  p { font-size: ${typography.fontSize.sm}; color: ${colors.gray[500]}; margin: ${spacing[1]} 0 0; }
`;

const Card = styled.div`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  padding: ${spacing[6]};
  margin-bottom: ${spacing[5]};

  h2 {
    font-size: ${typography.fontSize.base};
    font-weight: ${typography.fontWeight.semibold};
    margin: 0 0 ${spacing[5]} 0;
    color: ${colors.gray[900]};
    padding-bottom: ${spacing[4]};
    border-bottom: 1px solid ${colors.gray[100]};
  }
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${spacing[4]};
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;

const FormGroup = styled.div`
  &.full { grid-column: 1 / -1; }

  label {
    display: block;
    font-size: ${typography.fontSize.sm};
    font-weight: ${typography.fontWeight.medium};
    color: ${colors.gray[700]};
    margin-bottom: ${spacing[2]};
  }

  input, textarea, select {
    width: 100%;
    padding: ${spacing[3]};
    border: 1px solid ${colors.gray[300]};
    border-radius: ${borders.radius.md};
    font-size: ${typography.fontSize.sm};
    font-family: ${typography.fontFamily.sans};
    transition: border-color 0.15s;
    &:focus { outline: none; border-color: ${colors.accent[500]}; box-shadow: 0 0 0 3px ${colors.accent[100]}; }
    &:disabled { background: ${colors.gray[50]}; color: ${colors.gray[500]}; }
  }
  textarea { min-height: 80px; resize: vertical; }
  .help { font-size: 12px; color: ${colors.gray[400]}; margin-top: ${spacing[1]}; }
`;

const FieldCard = styled.div<{ $expanded?: boolean }>`
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.lg};
  margin-bottom: ${spacing[2]};
  overflow: hidden;
  transition: all 0.15s;
  &:hover { border-color: ${colors.gray[300]}; }
`;

const FieldHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  padding: ${spacing[3]} ${spacing[4]};
  cursor: pointer;
  user-select: none;

  .drag { color: ${colors.gray[300]}; cursor: grab; &:active { cursor: grabbing; } }

  .info { flex: 1; display: flex; align-items: center; gap: ${spacing[3]}; }

  .field-name {
    font-weight: ${typography.fontWeight.medium};
    font-size: ${typography.fontSize.sm};
    color: ${colors.gray[900]};
  }

  .field-type {
    padding: 2px 8px;
    background: ${colors.accent[50]};
    color: ${colors.accent[700]};
    border-radius: ${borders.radius.full};
    font-size: 11px;
    font-weight: 600;
  }

  .field-id {
    font-size: 11px;
    color: ${colors.gray[400]};
    font-family: ${typography.fontFamily.mono};
  }

  .actions {
    display: flex;
    align-items: center;
    gap: ${spacing[1]};
  }

  .icon-btn {
    padding: ${spacing[1.5]};
    background: none;
    border: none;
    cursor: pointer;
    color: ${colors.gray[400]};
    border-radius: ${borders.radius.md};
    display: flex;
    transition: all 0.15s;
    &:hover { background: ${colors.gray[100]}; color: ${colors.gray[700]}; }
    &.delete:hover { background: ${colors.red[50]}; color: ${colors.red[600]}; }
    svg { width: 16px; height: 16px; }
  }
`;

const FieldBody = styled.div`
  padding: ${spacing[4]} ${spacing[5]};
  border-top: 1px solid ${colors.gray[100]};
  background: ${colors.gray[50]};
`;

const FieldFormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${spacing[3]};
  margin-bottom: ${spacing[3]};
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;

const CheckboxRow = styled.label`
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  font-size: ${typography.fontSize.sm};
  color: ${colors.gray[700]};
  cursor: pointer;
  input { accent-color: ${colors.accent[500]}; }
`;

const AddFieldBtn = styled.button`
  margin-top: ${spacing[3]};
  padding: ${spacing[3]};
  background: transparent;
  color: ${colors.accent[600]};
  border: 2px dashed ${colors.accent[200]};
  border-radius: ${borders.radius.lg};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${spacing[2]};
  width: 100%;
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.medium};
  font-family: ${typography.fontFamily.sans};
  transition: all 0.15s;
  &:hover { background: ${colors.accent[50]}; border-color: ${colors.accent[400]}; }
`;

const Footer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: ${spacing[6]};

  .delete-btn {
    padding: ${spacing[3]} ${spacing[5]};
    background: none;
    color: ${colors.red[600]};
    border: 1px solid ${colors.red[200]};
    border-radius: ${borders.radius.md};
    font-size: ${typography.fontSize.sm};
    font-weight: ${typography.fontWeight.medium};
    cursor: pointer;
    font-family: ${typography.fontFamily.sans};
    transition: all 0.15s;
    &:hover { background: ${colors.red[50]}; border-color: ${colors.red[300]}; }
  }

  .right { display: flex; gap: ${spacing[3]}; }

  .cancel-btn {
    padding: ${spacing[3]} ${spacing[5]};
    background: ${colors.white};
    color: ${colors.gray[700]};
    border: 1px solid ${colors.gray[300]};
    border-radius: ${borders.radius.md};
    font-size: ${typography.fontSize.sm};
    font-weight: ${typography.fontWeight.medium};
    cursor: pointer;
    font-family: ${typography.fontFamily.sans};
    &:hover { background: ${colors.gray[50]}; }
  }

  .save-btn {
    padding: ${spacing[3]} ${spacing[5]};
    background: ${colors.accent[500]};
    color: #fff;
    border: none;
    border-radius: ${borders.radius.md};
    font-size: ${typography.fontSize.sm};
    font-weight: ${typography.fontWeight.semibold};
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: ${spacing[2]};
    font-family: ${typography.fontFamily.sans};
    transition: background 0.15s;
    &:hover:not(:disabled) { background: ${colors.accent[600]}; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
    svg { width: 18px; height: 18px; }
  }
`;

// ============================================
// COMPONENT
// ============================================

export const CollectionEdit = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFieldSelector, setShowFieldSelector] = useState(false);
  const [expandedField, setExpandedField] = useState<string | null>(null);
  const [collection, setCollection] = useState<CollectionData>({
    name: '', slug: '', description: '', type: 'custom', fields: [],
  });

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        setLoading(true);
        const { data, error: fetchErr } = await api.getCollection(slug);
        if (fetchErr || !data) throw new Error(fetchErr || 'Not found');
        setCollection({
          id: data.id, name: data.name, slug: data.slug,
          description: data.description || '', type: data.type,
          fields: (data.fields || []).map((f: any, i: number) => ({ ...f, id: f.id || `field_${i}` })),
        });
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const updateField = useCallback((fieldId: string, updates: Partial<FieldDef>) => {
    setCollection(prev => ({
      ...prev,
      fields: prev.fields.map(f => f.id === fieldId ? { ...f, ...updates } : f),
    }));
  }, []);

  const deleteField = (fieldId: string) => {
    if (!confirm('Delete this field?')) return;
    setCollection(prev => ({ ...prev, fields: prev.fields.filter(f => f.id !== fieldId) }));
  };

  const addField = (type: string) => {
    const newField: FieldDef = {
      id: `field_${Date.now()}`,
      name: '',
      label: '',
      type,
      required: false,
    };
    setCollection(prev => ({ ...prev, fields: [...prev.fields, newField] }));
    setExpandedField(newField.id);
    setShowFieldSelector(false);
  };

  const handleSave = async () => {
    if (!collection.name) { alert('Name is required'); return; }
    setSaving(true);
    try {
      const { error } = await api.updateCollection(slug!, {
        name: collection.name, description: collection.description, type: collection.type, fields: collection.fields,
      });
      if (error) throw new Error(error);
      navigate(`/content/${collection.slug}`);
    } catch (err: any) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${collection.name}" and ALL its entries? This cannot be undone.`)) return;
    setSaving(true);
    try {
      const { error } = await api.deleteCollection(slug!);
      if (error) throw new Error(error);
      navigate('/content');
    } catch (err: any) {
      alert('Failed to delete: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Container><div style={{ padding: '80px 0', textAlign: 'center' }}><Loader size={32} style={{ animation: 'spin 1s linear infinite' }} /><p style={{ color: colors.gray[500], marginTop: 12 }}>Loading...</p><style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style></div></Container>;
  }

  if (error) {
    return <Container><div style={{ padding: '80px 0', textAlign: 'center' }}><AlertCircle size={40} color={colors.red[500]} /><h3 style={{ marginTop: 12 }}>Error</h3><p style={{ color: colors.gray[500] }}>{error}</p></div></Container>;
  }

  return (
    <Container>
      <Header>
        <button className="back-btn" onClick={() => navigate('/content')}><ArrowLeft size={20} /></button>
        <div>
          <h1>Edit Collection</h1>
          <p>{collection.slug}</p>
        </div>
      </Header>

      {/* Basic Info */}
      <Card>
        <h2>Basic Information</h2>
        <FormGrid>
          <FormGroup>
            <label>Name</label>
            <input value={collection.name} onChange={e => setCollection(prev => ({ ...prev, name: e.target.value }))} placeholder="Collection name" />
          </FormGroup>
          <FormGroup>
            <label>Slug</label>
            <input value={collection.slug} disabled />
            <p className="help">Cannot be changed after creation</p>
          </FormGroup>
          <FormGroup className="full">
            <label>Description</label>
            <textarea value={collection.description} onChange={e => setCollection(prev => ({ ...prev, description: e.target.value }))} placeholder="What is this collection for?" />
          </FormGroup>
          <FormGroup>
            <label>Type</label>
            <select value={collection.type} onChange={e => setCollection(prev => ({ ...prev, type: e.target.value as any }))}>
              <option value="custom">Custom</option>
              <option value="post">Post</option>
              <option value="page">Page</option>
            </select>
          </FormGroup>
        </FormGrid>
      </Card>

      {/* Fields */}
      <Card>
        <h2>Fields ({collection.fields.length})</h2>

        {collection.fields.length === 0 ? (
          <p style={{ color: colors.gray[400], textAlign: 'center', padding: spacing[8], fontSize: typography.fontSize.sm }}>
            No fields yet. Add your first field below.
          </p>
        ) : (
          collection.fields.map(field => {
            const isExpanded = expandedField === field.id;
            return (
              <FieldCard key={field.id} $expanded={isExpanded}>
                <FieldHeader onClick={() => setExpandedField(isExpanded ? null : field.id)}>
                  <div className="drag"><GripVertical size={16} /></div>
                  <div className="info">
                    <span className="field-name">{field.label || field.name || 'Untitled field'}</span>
                    <span className="field-type">{field.type}</span>
                    <span className="field-id">{field.name || field.id}</span>
                  </div>
                  <div className="actions">
                    <button className="icon-btn delete" onClick={e => { e.stopPropagation(); deleteField(field.id); }}><Trash2 /></button>
                    <button className="icon-btn">{isExpanded ? <ChevronUp /> : <ChevronDown />}</button>
                  </div>
                </FieldHeader>

                {isExpanded && (
                  <FieldBody>
                    <FieldFormGrid>
                      <FormGroup>
                        <label>Field Label</label>
                        <input value={field.label || ''} onChange={e => updateField(field.id, { label: e.target.value })} placeholder="Display name" />
                      </FormGroup>
                      <FormGroup>
                        <label>Field Name (API)</label>
                        <input
                          value={field.name}
                          onChange={e => updateField(field.id, { name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                          placeholder="api_field_name"
                        />
                        <p className="help">Lowercase, underscores only</p>
                      </FormGroup>
                      <FormGroup>
                        <label>Placeholder</label>
                        <input value={field.placeholder || ''} onChange={e => updateField(field.id, { placeholder: e.target.value })} placeholder="Placeholder text" />
                      </FormGroup>
                      <FormGroup>
                        <label>Help Text</label>
                        <input value={field.helpText || ''} onChange={e => updateField(field.id, { helpText: e.target.value })} placeholder="Additional instructions" />
                      </FormGroup>
                      {(field.type === 'text' || field.type === 'textarea') && (
                        <FormGroup>
                          <label>Max Length</label>
                          <input type="number" value={field.maxLength || ''} onChange={e => updateField(field.id, { maxLength: e.target.value ? parseInt(e.target.value) : undefined })} placeholder="No limit" />
                        </FormGroup>
                      )}
                    </FieldFormGrid>
                    <div style={{ display: 'flex', gap: spacing[5], flexWrap: 'wrap' }}>
                      <CheckboxRow>
                        <input type="checkbox" checked={field.required || false} onChange={e => updateField(field.id, { required: e.target.checked })} />
                        Required
                      </CheckboxRow>
                      <CheckboxRow>
                        <input type="checkbox" checked={field.unique || false} onChange={e => updateField(field.id, { unique: e.target.checked })} />
                        Unique
                      </CheckboxRow>
                      <CheckboxRow>
                        <input type="checkbox" checked={field.searchable || false} onChange={e => updateField(field.id, { searchable: e.target.checked })} />
                        Searchable
                      </CheckboxRow>
                    </div>
                  </FieldBody>
                )}
              </FieldCard>
            );
          })
        )}

        <AddFieldBtn onClick={() => setShowFieldSelector(true)}>
          <Plus size={18} /> Add Field
        </AddFieldBtn>
      </Card>

      {/* Footer Actions */}
      <Footer>
        <button className="delete-btn" onClick={handleDelete}>Delete Collection</button>
        <div className="right">
          <button className="cancel-btn" onClick={() => navigate('/content')}>Cancel</button>
          <button className="save-btn" onClick={handleSave} disabled={saving || !collection.name}>
            {saving ? <><Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</> : <><Save size={18} /> Save Changes</>}
          </button>
        </div>
      </Footer>

      {showFieldSelector && (
        <FieldTypeSelector onSelect={addField} onClose={() => setShowFieldSelector(false)} />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Container>
  );
};

export default CollectionEdit;
