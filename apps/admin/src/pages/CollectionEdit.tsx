/**
 * Collection Edit Page
 * Allows editing existing collections
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { api } from '../lib/api-client';
import { useAuth } from '../features/auth/hooks/useAuth';
import { FieldEditor, type FieldDefinition } from '../components/collection-builder/FieldEditor';
import { FieldTypeSelector } from '../components/collection-builder/FieldTypeSelector';
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  GripVertical,
  Loader,
  AlertCircle,
} from 'lucide-react';
import { colors, spacing, typography, borders, shadows, animations } from '../shared/styles/design-tokens';

// ============================================
// STYLED COMPONENTS
// ============================================

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: ${spacing[6]};
`;

const Header = styled.header`
  margin-bottom: ${spacing[8]};
  display: flex;
  align-items: center;
  gap: ${spacing[4]};

  button.back-btn {
    background: none;
    border: 1px solid ${colors.gray[300]};
    border-radius: ${borders.radius.md};
    padding: ${spacing[3]};
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${colors.gray[600]};
    transition: all ${animations.duration.fast} ${animations.easing.out};

    &:hover {
      background: ${colors.gray[100]};
      border-color: ${colors.gray[400]};
    }

    svg {
      width: 20px;
      height: 20px;
    }
  }

  .header-content {
    flex: 1;

    h1 {
      font-size: ${typography.fontSize['2xl']};
      font-weight: ${typography.fontWeight.bold};
      margin: 0 0 ${spacing[2]} 0;
      color: ${colors.gray[900]};
    }

    p {
      font-size: ${typography.fontSize.sm};
      color: ${colors.gray[600]};
      margin: 0;
    }
  }
`;

const Card = styled.div`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  padding: ${spacing[6]};
  margin-bottom: ${spacing[6]};

  h2 {
    font-size: ${typography.fontSize.lg};
    font-weight: ${typography.fontWeight.semibold};
    margin: 0 0 ${spacing[4]} 0;
    color: ${colors.gray[900]};
  }
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: ${spacing[4]};
  margin-bottom: ${spacing[6]};

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const FormGroup = styled.div`
  label {
    display: block;
    font-size: ${typography.fontSize.sm};
    font-weight: ${typography.fontWeight.medium};
    color: ${colors.gray[700]};
    margin-bottom: ${spacing[2]};
  }

  input,
  textarea,
  select {
    width: 100%;
    padding: ${spacing[3]};
    border: 1px solid ${colors.gray[300]};
    border-radius: ${borders.radius.md};
    font-size: ${typography.fontSize.sm};
    transition: all ${animations.duration.fast} ${animations.easing.out};

    &:focus {
      outline: none;
      border-color: ${colors.accent[500]};
      box-shadow: 0 0 0 3px ${colors.accent[100]};
    }

    &:disabled {
      background: ${colors.gray[100]};
      cursor: not-allowed;
    }
  }

  textarea {
    min-height: 100px;
    resize: vertical;
  }

  .help-text {
    font-size: ${typography.fontSize.xs};
    color: ${colors.gray[500]};
    margin-top: ${spacing[1]};
  }
`;

const FieldsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[3]};
`;

const FieldItem = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  padding: ${spacing[4]};
  background: ${colors.gray[50]};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.lg};
  cursor: move;
  transition: all ${animations.duration.fast} ${animations.easing.out};

  &:hover {
    background: ${colors.white};
    box-shadow: ${shadows.sm};
  }

  .drag-handle {
    color: ${colors.gray[400]};
    cursor: grab;

    &:active {
      cursor: grabbing;
    }
  }

  .field-info {
    flex: 1;

    .field-name {
      font-weight: ${typography.fontWeight.medium};
      color: ${colors.gray[900]};
      margin-bottom: ${spacing[1]};
    }

    .field-type {
      font-size: ${typography.fontSize.xs};
      color: ${colors.gray[600]};
    }
  }

  .field-actions {
    display: flex;
    gap: ${spacing[2]};

    button {
      padding: ${spacing[2]};
      background: none;
      border: 1px solid ${colors.gray[300]};
      border-radius: ${borders.radius.md};
      cursor: pointer;
      color: ${colors.gray[600]};
      transition: all ${animations.duration.fast} ${animations.easing.out};

      &:hover {
        background: ${colors.white};
        border-color: ${colors.gray[400]};
      }

      &.delete:hover {
        color: ${colors.red[600]};
        border-color: ${colors.red[300]};
        background: ${colors.red[50]};
      }

      svg {
        width: 16px;
        height: 16px;
      }
    }
  }
`;

const Actions = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: ${spacing[6]};
  border-top: 1px solid ${colors.gray[200]};

  .left-actions {
    button {
      padding: ${spacing[3]} ${spacing[5]};
      background: none;
      color: ${colors.red[600]};
      border: 1px solid ${colors.red[300]};
      border-radius: ${borders.radius.md};
      font-size: ${typography.fontSize.sm};
      font-weight: ${typography.fontWeight.medium};
      cursor: pointer;
      transition: all ${animations.duration.fast} ${animations.easing.out};

      &:hover {
        background: ${colors.red[50]};
      }
    }
  }

  .right-actions {
    display: flex;
    gap: ${spacing[3]};

    button {
      padding: ${spacing[3]} ${spacing[5]};
      border-radius: ${borders.radius.md};
      font-size: ${typography.fontSize.sm};
      font-weight: ${typography.fontWeight.medium};
      cursor: pointer;
      transition: all ${animations.duration.fast} ${animations.easing.out};
      display: flex;
      align-items: center;
      gap: ${spacing[2]};

      &.cancel {
        background: none;
        color: ${colors.gray[700]};
        border: 1px solid ${colors.gray[300]};

        &:hover {
          background: ${colors.gray[100]};
        }
      }

      &.save {
        background: ${colors.accent[500]};
        color: ${colors.white};
        border: 1px solid ${colors.accent[500]};

        &:hover:not(:disabled) {
          background: ${colors.accent[600]};
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }

      svg {
        width: 18px;
        height: 18px;
      }
    }
  }
`;

const LoadingState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${spacing[16]};

  svg {
    animation: spin 1s linear infinite;
    color: ${colors.accent[500]};
    margin-bottom: ${spacing[4]};
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

const ErrorState = styled.div`
  padding: ${spacing[8]};
  text-align: center;

  svg {
    color: ${colors.red[500]};
    margin-bottom: ${spacing[4]};
  }

  h3 {
    font-size: ${typography.fontSize.lg};
    color: ${colors.gray[900]};
    margin: 0 0 ${spacing[2]} 0;
  }

  p {
    color: ${colors.gray[600]};
    margin: 0;
  }
`;

// ============================================
// COMPONENT
// ============================================

interface CollectionData {
  id?: string;
  name: string;
  slug: string;
  description: string;
  type: 'post' | 'page' | 'custom';
  fields: FieldDefinition[];
}

export const CollectionEdit = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collection, setCollection] = useState<CollectionData>({
    name: '',
    slug: '',
    description: '',
    type: 'post',
    fields: [],
  });
  const [editingField, setEditingField] = useState<FieldDefinition | null>(null);
  const [showFieldSelector, setShowFieldSelector] = useState(false);

  // Load collection data
  useEffect(() => {
    if (slug) {
      loadCollection();
    }
  }, [slug]);

  const loadCollection = async () => {
    try {
      setLoading(true);
      const { data, error } = await api.collections.get(slug!);

      if (error) {
        setError(error);
        return;
      }

      if (data) {
        setCollection({
          id: data.id,
          name: data.name,
          slug: data.slug,
          description: data.description || '',
          type: data.type,
          fields: data.fields || [],
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load collection');
    } finally {
      setLoading(false);
    }
  };

  // Handle field operations
  const handleAddField = (type: string) => {
    const newField: FieldDefinition = {
      id: `field_${Date.now()}`,
      name: '',
      label: '',
      type,
      required: false,
    };
    setEditingField(newField);
    setShowFieldSelector(false);
  };

  const handleSaveField = (field: FieldDefinition) => {
    if (editingField && collection.fields.find(f => f.id === editingField.id)) {
      // Update existing field
      setCollection({
        ...collection,
        fields: collection.fields.map(f =>
          f.id === field.id ? field : f
        ),
      });
    } else {
      // Add new field
      setCollection({
        ...collection,
        fields: [...collection.fields, field],
      });
    }
    setEditingField(null);
  };

  const handleDeleteField = (fieldId: string) => {
    if (confirm('Are you sure you want to delete this field?')) {
      setCollection({
        ...collection,
        fields: collection.fields.filter(f => f.id !== fieldId),
      });
    }
  };

  const handleEditField = (field: FieldDefinition) => {
    setEditingField(field);
  };

  // Save collection
  const handleSave = async () => {
    if (!collection.name || !collection.slug) {
      alert('Name and slug are required');
      return;
    }

    try {
      setSaving(true);
      const { data, error } = await api.collections.update(slug!, {
        name: collection.name,
        description: collection.description,
        type: collection.type,
        fields: collection.fields,
      });

      if (error) {
        alert(`Failed to update collection: ${error}`);
        return;
      }

      navigate(`/content/${collection.slug}`);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this collection? All entries will be deleted.')) {
      return;
    }

    try {
      setSaving(true);
      const { error } = await api.collections.delete(slug!);

      if (error) {
        alert(`Failed to delete collection: ${error}`);
        return;
      }

      navigate('/content');
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Container>
        <LoadingState>
          <Loader size={40} />
          <p>Loading collection...</p>
        </LoadingState>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <ErrorState>
          <AlertCircle size={48} />
          <h3>Error loading collection</h3>
          <p>{error}</p>
        </ErrorState>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <button className="back-btn" onClick={() => navigate('/content')}>
          <ArrowLeft />
        </button>
        <div className="header-content">
          <h1>Edit Collection</h1>
          <p>Modify collection settings and fields</p>
        </div>
      </Header>

      <Card>
        <h2>Basic Information</h2>
        <FormGrid>
          <FormGroup>
            <label>Collection Name</label>
            <input
              type="text"
              value={collection.name}
              onChange={(e) => setCollection({ ...collection, name: e.target.value })}
              placeholder="e.g., Blog Posts"
            />
          </FormGroup>

          <FormGroup>
            <label>Slug</label>
            <input
              type="text"
              value={collection.slug}
              disabled
              title="Slug cannot be changed"
            />
            <p className="help-text">URL identifier (cannot be changed)</p>
          </FormGroup>

          <FormGroup style={{ gridColumn: 'span 2' }}>
            <label>Description</label>
            <textarea
              value={collection.description}
              onChange={(e) => setCollection({ ...collection, description: e.target.value })}
              placeholder="Describe what this collection is for..."
            />
          </FormGroup>

          <FormGroup>
            <label>Type</label>
            <select
              value={collection.type}
              onChange={(e) => setCollection({ ...collection, type: e.target.value as any })}
            >
              <option value="post">Post</option>
              <option value="page">Page</option>
              <option value="custom">Custom</option>
            </select>
          </FormGroup>
        </FormGrid>
      </Card>

      <Card>
        <h2>Fields</h2>
        <FieldsList>
          {collection.fields.length === 0 ? (
            <p style={{ color: colors.gray[500], textAlign: 'center', padding: spacing[8] }}>
              No fields defined. Add your first field below.
            </p>
          ) : (
            collection.fields.map((field) => (
              <FieldItem key={field.id}>
                <div className="drag-handle">
                  <GripVertical />
                </div>
                <div className="field-info">
                  <div className="field-name">{field.label || field.name}</div>
                  <div className="field-type">Type: {field.type}</div>
                </div>
                <div className="field-actions">
                  <button onClick={() => handleEditField(field)} title="Edit field">
                    ✏️
                  </button>
                  <button
                    className="delete"
                    onClick={() => handleDeleteField(field.id)}
                    title="Delete field"
                  >
                    <Trash2 />
                  </button>
                </div>
              </FieldItem>
            ))
          )}
        </FieldsList>

        <button
          onClick={() => setShowFieldSelector(true)}
          style={{
            marginTop: spacing[4],
            padding: `${spacing[3]} ${spacing[5]}`,
            background: colors.accent[50],
            color: colors.accent[700],
            border: `1px dashed ${colors.accent[300]}`,
            borderRadius: borders.radius.md,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: spacing[2],
            width: '100%',
            justifyContent: 'center',
          }}
        >
          <Plus size={18} />
          Add Field
        </button>
      </Card>

      <Actions>
        <div className="left-actions">
          <button onClick={handleDelete}>
            Delete Collection
          </button>
        </div>
        <div className="right-actions">
          <button className="cancel" onClick={() => navigate('/content')}>
            Cancel
          </button>
          <button
            className="save"
            onClick={handleSave}
            disabled={saving || !collection.name || !collection.slug}
          >
            {saving ? (
              <>
                <Loader size={18} />
                Saving...
              </>
            ) : (
              <>
                <Save size={18} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </Actions>

      {/* Field Selector Modal */}
      {showFieldSelector && (
        <FieldTypeSelector
          onSelect={handleAddField}
          onClose={() => setShowFieldSelector(false)}
        />
      )}

      {/* Field Editor Modal */}
      {editingField && (
        <FieldEditor
          field={editingField}
          onSave={handleSaveField}
          onCancel={() => setEditingField(null)}
        />
      )}
    </Container>
  );
};

export default CollectionEdit;