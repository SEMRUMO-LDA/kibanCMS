/**
 * FieldTypeSelector Component
 *
 * Modal for selecting field type when adding new field
 * Organized by category with descriptions
 */

import styled, { keyframes } from 'styled-components';
import { colors, spacing, typography, borders, shadows, animations } from '../../shared/styles/design-tokens';
import {
  Type,
  Hash,
  ToggleLeft,
  Calendar,
  List,
  Image,
  Palette,
  Code,
  Link,
  X,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

export interface FieldType {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<any>;
  category: 'text' | 'number' | 'boolean' | 'datetime' | 'selection' | 'media' | 'advanced';
}

interface FieldTypeSelectorProps {
  onSelect: (fieldType: string) => void;
  onClose: () => void;
}

// ============================================
// FIELD TYPE DEFINITIONS
// ============================================

const FIELD_TYPES: FieldType[] = [
  // TEXT
  {
    id: 'text',
    label: 'Text',
    description: 'Single line text input',
    icon: Type,
    category: 'text',
  },
  {
    id: 'textarea',
    label: 'Text Area',
    description: 'Multi-line text input',
    icon: Type,
    category: 'text',
  },
  {
    id: 'richtext',
    label: 'Rich Text',
    description: 'WYSIWYG editor with formatting',
    icon: Type,
    category: 'text',
  },
  {
    id: 'slug',
    label: 'Slug',
    description: 'URL-friendly identifier',
    icon: Link,
    category: 'text',
  },
  {
    id: 'email',
    label: 'Email',
    description: 'Email address validation',
    icon: Type,
    category: 'text',
  },
  {
    id: 'url',
    label: 'URL',
    description: 'Web address validation',
    icon: Link,
    category: 'text',
  },

  // NUMBER
  {
    id: 'number',
    label: 'Number',
    description: 'Decimal numbers',
    icon: Hash,
    category: 'number',
  },
  {
    id: 'integer',
    label: 'Integer',
    description: 'Whole numbers only',
    icon: Hash,
    category: 'number',
  },

  // BOOLEAN
  {
    id: 'boolean',
    label: 'Boolean',
    description: 'True/False checkbox',
    icon: ToggleLeft,
    category: 'boolean',
  },
  {
    id: 'switch',
    label: 'Switch',
    description: 'Toggle switch UI',
    icon: ToggleLeft,
    category: 'boolean',
  },

  // DATETIME
  {
    id: 'date',
    label: 'Date',
    description: 'Date picker',
    icon: Calendar,
    category: 'datetime',
  },
  {
    id: 'datetime',
    label: 'Date & Time',
    description: 'Date and time picker',
    icon: Calendar,
    category: 'datetime',
  },
  {
    id: 'time',
    label: 'Time',
    description: 'Time picker',
    icon: Calendar,
    category: 'datetime',
  },

  // SELECTION
  {
    id: 'select',
    label: 'Select',
    description: 'Dropdown selection',
    icon: List,
    category: 'selection',
  },
  {
    id: 'multiselect',
    label: 'Multi-Select',
    description: 'Multiple choice dropdown',
    icon: List,
    category: 'selection',
  },
  {
    id: 'radio',
    label: 'Radio',
    description: 'Radio button group',
    icon: List,
    category: 'selection',
  },
  {
    id: 'checkbox',
    label: 'Checkboxes',
    description: 'Multiple checkboxes',
    icon: List,
    category: 'selection',
  },
  {
    id: 'tags',
    label: 'Tags',
    description: 'Tag input field',
    icon: List,
    category: 'selection',
  },

  // MEDIA
  {
    id: 'image',
    label: 'Image',
    description: 'Image upload',
    icon: Image,
    category: 'media',
  },
  {
    id: 'file',
    label: 'File',
    description: 'File upload',
    icon: Image,
    category: 'media',
  },
  {
    id: 'media',
    label: 'Media',
    description: 'Media library picker',
    icon: Image,
    category: 'media',
  },

  // ADVANCED
  {
    id: 'color',
    label: 'Color',
    description: 'Color picker',
    icon: Palette,
    category: 'advanced',
  },
  {
    id: 'json',
    label: 'JSON',
    description: 'JSON editor',
    icon: Code,
    category: 'advanced',
  },
  {
    id: 'blocks',
    label: 'Content Blocks',
    description: 'Flexible block-based content',
    icon: Code,
    category: 'advanced',
  },
  {
    id: 'relation',
    label: 'Relation',
    description: 'Reference to another collection',
    icon: Link,
    category: 'advanced',
  },
];

const CATEGORY_LABELS = {
  text: 'Text',
  number: 'Number',
  boolean: 'Boolean',
  datetime: 'Date & Time',
  selection: 'Selection',
  media: 'Media',
  advanced: 'Advanced',
};

// ============================================
// ANIMATIONS
// ============================================

const fadeIn = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

const slideIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

// ============================================
// STYLED COMPONENTS
// ============================================

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: ${spacing[6]};
  animation: ${fadeIn} ${animations.duration.fast} ${animations.easing.out};
`;

const Modal = styled.div`
  width: 100%;
  max-width: 900px;
  max-height: 90vh;
  background: ${colors.white};
  border-radius: ${borders.radius.xl};
  box-shadow: ${shadows['2xl']};
  display: flex;
  flex-direction: column;
  animation: ${slideIn} ${animations.duration.normal} ${animations.easing.out};
  overflow: hidden;
`;

const ModalHeader = styled.div`
  padding: ${spacing[6]} ${spacing[8]};
  border-bottom: 1px solid ${colors.gray[200]};
  display: flex;
  align-items: center;
  justify-content: space-between;

  h2 {
    font-size: ${typography.fontSize.xl};
    font-weight: ${typography.fontWeight.bold};
    color: ${colors.gray[900]};
    margin: 0;
  }

  button {
    background: none;
    border: none;
    cursor: pointer;
    padding: ${spacing[2]};
    border-radius: ${borders.radius.md};
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${colors.gray[500]};
    transition: all ${animations.duration.fast} ${animations.easing.out};

    &:hover {
      background: ${colors.gray[100]};
      color: ${colors.gray[900]};
    }
  }
`;

const ModalBody = styled.div`
  padding: ${spacing[6]} ${spacing[8]};
  overflow-y: auto;
  flex: 1;
`;

const CategorySection = styled.div`
  margin-bottom: ${spacing[8]};

  &:last-child {
    margin-bottom: 0;
  }

  h3 {
    font-size: ${typography.fontSize.sm};
    font-weight: ${typography.fontWeight.semibold};
    text-transform: uppercase;
    letter-spacing: ${typography.letterSpacing.wide};
    color: ${colors.gray[500]};
    margin: 0 0 ${spacing[4]} 0;
  }
`;

const TypeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: ${spacing[3]};
`;

const TypeCard = styled.button`
  background: ${colors.white};
  border: 2px solid ${colors.gray[200]};
  border-radius: ${borders.radius.lg};
  padding: ${spacing[4]};
  cursor: pointer;
  text-align: left;
  transition: all ${animations.duration.fast} ${animations.easing.out};
  display: flex;
  flex-direction: column;
  gap: ${spacing[2]};

  &:hover {
    border-color: ${colors.accent[500]};
    background: ${colors.accent[50]};
    transform: translateY(-2px);
    box-shadow: ${shadows.md};

    .icon-wrapper {
      background: ${colors.accent[500]};
      color: ${colors.white};
    }
  }

  &:active {
    transform: translateY(0);
  }

  .icon-wrapper {
    width: 40px;
    height: 40px;
    border-radius: ${borders.radius.md};
    background: ${colors.gray[100]};
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${colors.gray[600]};
    transition: all ${animations.duration.fast} ${animations.easing.out};

    svg {
      width: 20px;
      height: 20px;
    }
  }

  .type-label {
    font-size: ${typography.fontSize.sm};
    font-weight: ${typography.fontWeight.semibold};
    color: ${colors.gray[900]};
  }

  .type-description {
    font-size: ${typography.fontSize.xs};
    color: ${colors.gray[600]};
    line-height: ${typography.lineHeight.relaxed};
  }
`;

// ============================================
// COMPONENT
// ============================================

export const FieldTypeSelector: React.FC<FieldTypeSelectorProps> = ({ onSelect, onClose }) => {
  // Group field types by category
  const categories = Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>;

  const handleSelect = (typeId: string) => {
    onSelect(typeId);
    onClose();
  };

  return (
    <Overlay onClick={onClose}>
      <Modal onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <h2>Add Field</h2>
          <button onClick={onClose}>
            <X size={24} />
          </button>
        </ModalHeader>

        <ModalBody>
          {categories.map((category) => {
            const typesInCategory = FIELD_TYPES.filter((type) => type.category === category);

            if (typesInCategory.length === 0) return null;

            return (
              <CategorySection key={category}>
                <h3>{CATEGORY_LABELS[category]}</h3>
                <TypeGrid>
                  {typesInCategory.map((type) => {
                    const Icon = type.icon;
                    return (
                      <TypeCard key={type.id} onClick={() => handleSelect(type.id)}>
                        <div className="icon-wrapper">
                          <Icon />
                        </div>
                        <div className="type-label">{type.label}</div>
                        <div className="type-description">{type.description}</div>
                      </TypeCard>
                    );
                  })}
                </TypeGrid>
              </CategorySection>
            );
          })}
        </ModalBody>
      </Modal>
    </Overlay>
  );
};
