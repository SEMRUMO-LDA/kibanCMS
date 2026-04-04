/**
 * CollectionBuilder Page
 *
 * Step-by-step wizard for creating custom collections
 * Supports presets and from-scratch creation
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { colors, spacing, typography, borders, shadows, animations } from '../shared/styles/design-tokens';
import { COLLECTION_PRESETS, type CollectionPreset } from '../config/collection-presets';
import { FieldEditor, type FieldDefinition } from '../components/collection-builder/FieldEditor';
import { FieldTypeSelector } from '../components/collection-builder/FieldTypeSelector';
import { useAuth } from '../features/auth/hooks/useAuth';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Sparkles,
  FileText,
  Briefcase,
  Users,
  Package,
  Quote,
  Calendar,
  Loader,
  Upload,
  Wand2,
  ImageIcon,
  X,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface CollectionData {
  name: string;
  slug: string;
  description: string;
  type: 'post' | 'page' | 'custom';
  icon: string | null;
  color: string | null;
  fields: FieldDefinition[];
}

// ============================================
// ANIMATIONS
// ============================================

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

const slideIn = keyframes`
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
`;

// ============================================
// STYLED COMPONENTS
// ============================================

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  animation: ${fadeIn} ${animations.duration.normal} ${animations.easing.out};
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
      font-size: ${typography.fontSize['3xl']};
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

const StepIndicator = styled.div`
  display: flex;
  justify-content: center;
  gap: ${spacing[3]};
  margin-bottom: ${spacing[8]};
`;

const Step = styled.div<{ $active: boolean; $completed: boolean }>`
  flex: 1;
  max-width: 200px;
  text-align: center;

  .step-circle {
    width: 40px;
    height: 40px;
    margin: 0 auto ${spacing[2]};
    border-radius: ${borders.radius.full};
    background: ${props =>
      props.$completed
        ? colors.accent[500]
        : props.$active
        ? colors.accent[100]
        : colors.gray[200]};
    color: ${props =>
      props.$completed
        ? colors.white
        : props.$active
        ? colors.accent[700]
        : colors.gray[500]};
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: ${typography.fontWeight.semibold};
    transition: all ${animations.duration.normal} ${animations.easing.out};

    ${props => props.$completed && 'box-shadow: ' + shadows.md + ';'}
  }

  .step-label {
    font-size: ${typography.fontSize.xs};
    font-weight: ${typography.fontWeight.medium};
    color: ${props => (props.$active ? colors.gray[900] : colors.gray[500])};
  }
`;

const Card = styled.div`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  overflow: hidden;
  box-shadow: ${shadows.lg};
  animation: ${slideIn} ${animations.duration.normal} ${animations.easing.out};
`;

const CardBody = styled.div`
  padding: ${spacing[8]};
  min-height: 500px;
`;

const CardFooter = styled.div`
  padding: ${spacing[6]} ${spacing[8]};
  background: ${colors.gray[50]};
  border-top: 1px solid ${colors.gray[200]};
  display: flex;
  justify-content: space-between;
  gap: ${spacing[4]};
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: ${spacing[3]} ${spacing[6]};
  border-radius: ${borders.radius.lg};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.semibold};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  transition: all ${animations.duration.fast} ${animations.easing.out};
  border: none;

  ${props =>
    props.$variant === 'primary'
      ? `
    background: ${colors.accent[500]};
    color: ${colors.white};
    box-shadow: ${shadows.sm};

    &:hover:not(:disabled) {
      background: ${colors.accent[600]};
      transform: translateY(-1px);
      box-shadow: ${shadows.md};
    }
  `
      : `
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
    transform: none;
  }
`;

const FormGroup = styled.div`
  margin-bottom: ${spacing[6]};

  label {
    display: block;
    font-size: ${typography.fontSize.sm};
    font-weight: ${typography.fontWeight.semibold};
    color: ${colors.gray[700]};
    margin-bottom: ${spacing[2]};

    .required {
      color: ${colors.red[500]};
    }
  }

  input,
  textarea,
  select {
    width: 100%;
    padding: ${spacing[3]} ${spacing[4]};
    border: 1px solid ${colors.gray[300]};
    border-radius: ${borders.radius.lg};
    font-size: ${typography.fontSize.base};
    font-family: ${typography.fontFamily.sans};
    color: ${colors.gray[900]};
    transition: all ${animations.duration.fast} ${animations.easing.out};

    &:focus {
      outline: none;
      border-color: ${colors.accent[500]};
      box-shadow: 0 0 0 3px ${colors.accent[500]}20;
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

const PresetGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: ${spacing[4]};
  margin-bottom: ${spacing[6]};
`;

const PresetCard = styled.button<{ $selected: boolean }>`
  padding: ${spacing[4]};
  background: ${props => (props.$selected ? colors.accent[50] : colors.white)};
  border: 2px solid ${props => (props.$selected ? colors.accent[500] : colors.gray[200])};
  border-radius: ${borders.radius.xl};
  cursor: pointer;
  text-align: left;
  transition: all ${animations.duration.fast} ${animations.easing.out};
  position: relative;

  &:hover {
    border-color: ${colors.accent[300]};
    transform: translateY(-2px);
    box-shadow: ${shadows.md};
  }

  .icon {
    width: 40px;
    height: 40px;
    border-radius: ${borders.radius.lg};
    background: ${props => (props.$selected ? colors.accent[100] : colors.gray[100])};
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: ${spacing[3]};

    svg {
      color: ${props => (props.$selected ? colors.accent[600] : colors.gray[600])};
    }
  }

  h3 {
    font-size: ${typography.fontSize.sm};
    font-weight: ${typography.fontWeight.semibold};
    color: ${colors.gray[900]};
    margin: 0 0 ${spacing[1]} 0;
  }

  p {
    font-size: ${typography.fontSize.xs};
    color: ${colors.gray[600]};
    margin: 0;
  }

  ${props =>
    props.$selected &&
    `
    .check-mark {
      position: absolute;
      top: ${spacing[2]};
      right: ${spacing[2]};
      width: 24px;
      height: 24px;
      border-radius: ${borders.radius.full};
      background: ${colors.accent[500]};
      display: flex;
      align-items: center;
      justify-content: center;

      svg {
        color: ${colors.white};
      }
    }
  `}
`;

const FieldsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[4]};
  margin-bottom: ${spacing[6]};
`;

const EmptyFieldsState = styled.div`
  text-align: center;
  padding: ${spacing[12]} ${spacing[6]};
  background: ${colors.gray[50]};
  border: 2px dashed ${colors.gray[300]};
  border-radius: ${borders.radius.lg};

  svg {
    width: 48px;
    height: 48px;
    margin: 0 auto ${spacing[4]};
    color: ${colors.gray[400]};
  }

  h3 {
    font-size: ${typography.fontSize.lg};
    font-weight: ${typography.fontWeight.semibold};
    color: ${colors.gray[900]};
    margin: 0 0 ${spacing[2]} 0;
  }

  p {
    color: ${colors.gray[600]};
    margin: 0;
  }
`;

const AddFieldButton = styled.button`
  width: 100%;
  padding: ${spacing[4]};
  background: ${colors.white};
  border: 2px dashed ${colors.gray[300]};
  border-radius: ${borders.radius.lg};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${spacing[2]};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.semibold};
  color: ${colors.gray[700]};
  transition: all ${animations.duration.fast} ${animations.easing.out};

  &:hover {
    border-color: ${colors.accent[500]};
    background: ${colors.accent[50]};
    color: ${colors.accent[700]};
  }

  svg {
    width: 20px;
    height: 20px;
  }
`;

const ICON_MAP: Record<string, any> = {
  'file-text': FileText,
  briefcase: Briefcase,
  users: Users,
  package: Package,
  quote: Quote,
  calendar: Calendar,
};

// ============================================
// COMPONENT
// ============================================

export const CollectionBuilder = () => {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const toast = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<CollectionPreset | null>(null);
  const [showFieldTypeSelector, setShowFieldTypeSelector] = useState(false);
  const [draggedFieldIndex, setDraggedFieldIndex] = useState<number | null>(null);

  // AI state
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [aiContext, setAiContext] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [collection, setCollection] = useState<CollectionData>({
    name: '',
    slug: '',
    description: '',
    type: 'custom',
    icon: null,
    color: null,
    fields: [],
  });

  const totalSteps = 3;

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    setCollection(prev => ({
      ...prev,
      name,
      slug: name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    }));
  };

  // Apply preset
  const applyPreset = (preset: CollectionPreset) => {
    setSelectedPreset(preset);
    setCollection({
      name: preset.name,
      slug: preset.slug,
      description: preset.description,
      type: preset.type,
      icon: preset.icon,
      color: preset.color,
      fields: preset.fields.map((field, index) => ({
        ...field,
        id: `field-${Date.now()}-${index}`,
      })),
    });
  };

  // Add new field
  const addField = (fieldType: string) => {
    const newField: FieldDefinition = {
      id: `field-${Date.now()}`,
      name: '',
      type: fieldType,
      label: '',
      required: false,
    };
    setCollection(prev => ({
      ...prev,
      fields: [...prev.fields, newField],
    }));
  };

  // Update field (memoized to prevent re-renders)
  const updateField = useCallback((index: number, updatedField: FieldDefinition) => {
    setCollection(prev => ({
      ...prev,
      fields: prev.fields.map((field, i) => (i === index ? updatedField : field)),
    }));
  }, []);

  // Delete field (memoized)
  const deleteField = useCallback((index: number) => {
    setCollection(prev => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index),
    }));
  }, []);

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedFieldIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedFieldIndex === null || draggedFieldIndex === index) return;

    const newFields = [...collection.fields];
    const draggedField = newFields[draggedFieldIndex];
    newFields.splice(draggedFieldIndex, 1);
    newFields.splice(index, 0, draggedField);

    setCollection(prev => ({ ...prev, fields: newFields }));
    setDraggedFieldIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedFieldIndex(null);
  };

  // AI image upload handler
  const handleAiImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAiImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  // AI generation handler
  const handleAiGenerate = async () => {
    if (!aiImage || !session?.access_token) return;
    setAiLoading(true);
    setAiError(null);

    try {
      const apiBase = import.meta.env.VITE_API_URL || window.location.origin;
      const res = await fetch(`${apiBase}/api/v1/ai/generate-collection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          image: aiImage,
          context: aiContext || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'AI generation failed');

      const schema = data.data;

      // Apply AI-generated schema to collection
      setCollection({
        name: schema.name,
        slug: schema.slug,
        description: schema.description || '',
        type: schema.type || 'custom',
        icon: null,
        color: null,
        fields: schema.fields.map((f: any, i: number) => ({
          id: `field-${Date.now()}-${i}`,
          name: f.id || f.name?.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          label: f.name,
          type: f.type || 'text',
          required: f.required || false,
          maxLength: f.maxLength || undefined,
          helpText: f.helpText || '',
          placeholder: f.placeholder || '',
        })),
      });

      setShowAiModal(false);
      setAiImage(null);
      setAiContext('');
      setCurrentStep(2); // Jump to fields step to review
    } catch (err: any) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  // Submit collection
  const handleSubmit = async () => {
    setLoading(true);

    try {
      const { data, error } = await api.createCollection({
        name: collection.name,
        slug: collection.slug,
        description: collection.description || null,
        type: collection.type,
        icon: collection.icon,
        color: collection.color,
        fields: collection.fields,
      });

      if (error) throw new Error(error);
      if (!data) throw new Error('Failed to create collection');

      navigate(`/content/${data.slug || collection.slug}`);
    } catch (error: any) {
      console.error('[CollectionBuilder] Error:', error);
      toast.error('Failed to create: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Validation
  const canProceed = () => {
    if (currentStep === 0) return true;
    if (currentStep === 1) {
      return collection.name.trim() && collection.slug.trim() && collection.type;
    }
    if (currentStep === 2) {
      // Every field MUST have a name (API identifier). Auto-generate from label if missing.
      return collection.fields.length > 0 && collection.fields.every(f => {
        if (!f.name && f.label) {
          f.name = f.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
        }
        return !!f.name;
      });
    }
    return true;
  };

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div>
            <h2 style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, marginBottom: spacing[2] }}>
              Choose a Starting Point
            </h2>
            <p style={{ fontSize: typography.fontSize.sm, color: colors.gray[600], marginBottom: spacing[6] }}>
              Start with a preset or build from scratch
            </p>

            <PresetGrid>
              {/* AI-powered collection creation */}
              <PresetCard
                $selected={false}
                onClick={() => setShowAiModal(true)}
                style={{ borderColor: '#8b5cf6', background: 'linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%)' }}
              >
                <div className="icon" style={{ background: '#8b5cf6', color: '#fff' }}>
                  <Wand2 size={20} />
                </div>
                <h3 style={{ color: '#7c3aed' }}>AI Generate</h3>
                <p>Upload a screenshot and let AI create the collection</p>
              </PresetCard>

              <PresetCard
                $selected={selectedPreset === null}
                onClick={() => {
                  setSelectedPreset(null);
                  setCollection({
                    name: '',
                    slug: '',
                    description: '',
                    type: 'custom',
                    icon: null,
                    color: null,
                    fields: [],
                  });
                }}
              >
                <div className="icon">
                  <Sparkles size={20} />
                </div>
                <h3>From Scratch</h3>
                <p>Build a completely custom collection</p>
                {selectedPreset === null && (
                  <div className="check-mark">
                    <Check size={16} />
                  </div>
                )}
              </PresetCard>

              {COLLECTION_PRESETS.map(preset => {
                const Icon = ICON_MAP[preset.icon] || FileText;
                const isSelected = selectedPreset?.id === preset.id;

                return (
                  <PresetCard
                    key={preset.id}
                    $selected={isSelected}
                    onClick={() => applyPreset(preset)}
                  >
                    <div className="icon">
                      <Icon size={20} />
                    </div>
                    <h3>{preset.name}</h3>
                    <p>{preset.description}</p>
                    {isSelected && (
                      <div className="check-mark">
                        <Check size={16} />
                      </div>
                    )}
                  </PresetCard>
                );
              })}
            </PresetGrid>
          </div>
        );

      case 1:
        return (
          <div>
            <h2 style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, marginBottom: spacing[2] }}>
              Collection Details
            </h2>
            <p style={{ fontSize: typography.fontSize.sm, color: colors.gray[600], marginBottom: spacing[6] }}>
              Define your collection's basic information
            </p>

            <FormGroup>
              <label>
                Collection Name <span className="required">*</span>
              </label>
              <input
                type="text"
                value={collection.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g., Blog Posts"
                required
              />
            </FormGroup>

            <FormGroup>
              <label>
                Slug <span className="required">*</span>
              </label>
              <input
                type="text"
                value={collection.slug}
                onChange={(e) => setCollection(prev => ({ ...prev, slug: e.target.value }))}
                placeholder="blog-posts"
                pattern="[a-z0-9\-]+"
                required
              />
              <div className="help-text">Used in URLs and API endpoints (lowercase, hyphens only)</div>
            </FormGroup>

            <FormGroup>
              <label>Description</label>
              <textarea
                value={collection.description}
                onChange={(e) => setCollection(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe what this collection is for..."
              />
            </FormGroup>

            <FormGroup>
              <label>
                Collection Type <span className="required">*</span>
              </label>
              <select
                value={collection.type}
                onChange={(e) => setCollection(prev => ({ ...prev, type: e.target.value as any }))}
                required
              >
                <option value="custom">Custom</option>
                <option value="post">Post (blog-style content)</option>
                <option value="page">Page (static pages)</option>
              </select>
            </FormGroup>
          </div>
        );

      case 2:
        return (
          <div>
            <h2 style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, marginBottom: spacing[2] }}>
              Configure Fields
            </h2>
            <p style={{ fontSize: typography.fontSize.sm, color: colors.gray[600], marginBottom: spacing[6] }}>
              Add and configure fields for your content
            </p>

            {collection.fields.length === 0 ? (
              <EmptyFieldsState>
                <FileText />
                <h3>No Fields Yet</h3>
                <p>Click "Add Field" below to start building your collection schema</p>
              </EmptyFieldsState>
            ) : (
              <FieldsList>
                {collection.fields.map((field, index) => (
                  <div
                    key={field.id}
                    onDragOver={(e) => handleDragOver(e, index)}
                  >
                    <FieldEditor
                      field={field}
                      onChange={(updatedField) => updateField(index, updatedField)}
                      onDelete={() => deleteField(index)}
                      onDragStart={() => handleDragStart(index)}
                      onDragEnd={handleDragEnd}
                    />
                  </div>
                ))}
              </FieldsList>
            )}

            <AddFieldButton onClick={() => setShowFieldTypeSelector(true)}>
              <Plus />
              Add Field
            </AddFieldButton>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Container>
      <Header>
        <button className="back-btn" onClick={() => navigate('/content')}>
          <ArrowLeft />
        </button>
        <div className="header-content">
          <h1>Create Collection</h1>
          <p>Build a custom content collection with fields tailored to your needs</p>
        </div>
      </Header>

      <StepIndicator>
        {['Template', 'Details', 'Fields'].map((label, index) => (
          <Step key={index} $active={index === currentStep} $completed={index < currentStep}>
            <div className="step-circle">
              {index < currentStep ? <Check size={20} /> : index + 1}
            </div>
            <div className="step-label">{label}</div>
          </Step>
        ))}
      </StepIndicator>

      <Card>
        <CardBody>{renderStepContent()}</CardBody>

        <CardFooter>
          <Button onClick={() => setCurrentStep(Math.max(0, currentStep - 1))} disabled={currentStep === 0}>
            <ArrowLeft size={18} />
            Back
          </Button>

          {currentStep < totalSteps - 1 ? (
            <Button $variant="primary" onClick={() => setCurrentStep(currentStep + 1)} disabled={!canProceed()}>
              Next
              <ArrowRight size={18} />
            </Button>
          ) : (
            <Button $variant="primary" onClick={handleSubmit} disabled={loading || !canProceed()}>
              {loading ? (
                <>
                  <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
                  Creating...
                </>
              ) : (
                <>
                  <Check size={18} />
                  Create Collection
                </>
              )}
            </Button>
          )}
        </CardFooter>
      </Card>

      {showFieldTypeSelector && (
        <FieldTypeSelector
          onSelect={addField}
          onClose={() => setShowFieldTypeSelector(false)}
        />
      )}

      {/* AI Generation Modal */}
      {showAiModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: spacing[4],
        }} onClick={() => !aiLoading && setShowAiModal(false)}>
          <div style={{
            background: colors.white, borderRadius: borders.radius['2xl'], boxShadow: shadows['2xl'],
            width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto',
          }} onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={{
              padding: `${spacing[6]} ${spacing[6]} ${spacing[4]}`,
              borderBottom: `1px solid ${colors.gray[200]}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
                <div style={{
                  width: 40, height: 40, borderRadius: borders.radius.lg,
                  background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                }}>
                  <Wand2 size={20} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold }}>
                    AI Collection Generator
                  </h2>
                  <p style={{ margin: 0, fontSize: typography.fontSize.xs, color: colors.gray[500] }}>
                    Upload a screenshot and AI will design your collection
                  </p>
                </div>
              </div>
              <button onClick={() => !aiLoading && setShowAiModal(false)} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: spacing[2],
                color: colors.gray[400], borderRadius: borders.radius.md,
              }}>
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: spacing[6] }}>
              {/* Image Upload Area */}
              {!aiImage ? (
                <label style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: `${spacing[10]} ${spacing[6]}`,
                  border: `2px dashed ${colors.gray[300]}`, borderRadius: borders.radius.xl,
                  cursor: 'pointer', transition: 'all 0.2s', background: colors.gray[50],
                }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: '50%', background: '#ede9fe',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#7c3aed', marginBottom: spacing[4],
                  }}>
                    <ImageIcon size={28} />
                  </div>
                  <span style={{ fontWeight: typography.fontWeight.semibold, color: colors.gray[900], marginBottom: spacing[1] }}>
                    Drop screenshot here or click to browse
                  </span>
                  <span style={{ fontSize: typography.fontSize.xs, color: colors.gray[500] }}>
                    PNG, JPG, WebP — any web page, design, or wireframe
                  </span>
                  <input type="file" accept="image/*" onChange={handleAiImageSelect} style={{ display: 'none' }} />
                </label>
              ) : (
                <div style={{ position: 'relative', marginBottom: spacing[4] }}>
                  <img src={aiImage} alt="Preview" style={{
                    width: '100%', maxHeight: 300, objectFit: 'contain',
                    borderRadius: borders.radius.lg, border: `1px solid ${colors.gray[200]}`,
                  }} />
                  <button onClick={() => setAiImage(null)} style={{
                    position: 'absolute', top: 8, right: 8,
                    background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
                    borderRadius: '50%', width: 28, height: 28,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}>
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Context Input */}
              <div style={{ marginTop: spacing[4] }}>
                <label style={{ display: 'block', fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, color: colors.gray[700], marginBottom: spacing[2] }}>
                  Additional context (optional)
                </label>
                <input
                  type="text"
                  value={aiContext}
                  onChange={e => setAiContext(e.target.value)}
                  placeholder="e.g., This is a testimonials section for a SaaS landing page"
                  disabled={aiLoading}
                  style={{
                    width: '100%', padding: `${spacing[3]} ${spacing[4]}`,
                    border: `1px solid ${colors.gray[300]}`, borderRadius: borders.radius.lg,
                    fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.sans,
                  }}
                />
              </div>

              {/* Error */}
              {aiError && (
                <div style={{
                  marginTop: spacing[4], padding: spacing[3],
                  background: '#fef2f2', border: '1px solid #fecaca', borderRadius: borders.radius.lg,
                  fontSize: typography.fontSize.sm, color: '#dc2626',
                }}>
                  {aiError}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: `${spacing[4]} ${spacing[6]} ${spacing[6]}`,
              display: 'flex', gap: spacing[3], justifyContent: 'flex-end',
            }}>
              <button onClick={() => setShowAiModal(false)} disabled={aiLoading} style={{
                padding: `${spacing[3]} ${spacing[5]}`, background: colors.white,
                border: `1px solid ${colors.gray[300]}`, borderRadius: borders.radius.lg,
                fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium,
                cursor: 'pointer', fontFamily: typography.fontFamily.sans,
              }}>
                Cancel
              </button>
              <button onClick={handleAiGenerate} disabled={!aiImage || aiLoading} style={{
                padding: `${spacing[3]} ${spacing[5]}`,
                background: aiLoading ? '#a78bfa' : 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                color: '#fff', border: 'none', borderRadius: borders.radius.lg,
                fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold,
                cursor: !aiImage || aiLoading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: spacing[2],
                opacity: !aiImage ? 0.5 : 1, fontFamily: typography.fontFamily.sans,
              }}>
                {aiLoading ? (
                  <>
                    <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    Analyzing image...
                  </>
                ) : (
                  <>
                    <Wand2 size={16} />
                    Generate Collection
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </Container>
  );
};
