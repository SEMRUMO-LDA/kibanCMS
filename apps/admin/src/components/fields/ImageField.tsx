/**
 * ImageField Component
 *
 * Image upload and selection
 * For v1.0, using simple URL input
 * Future: Integrate with Media Library for drag-drop upload
 */

import { useState } from 'react';
import styled from 'styled-components';
import { colors, spacing, typography, borders, animations } from '../../shared/styles/design-tokens';
import { FieldWrapper } from './FieldWrapper';
import { Upload, X, Image as ImageIcon } from 'lucide-react';

const ImageContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[3]};
`;

const PreviewArea = styled.div`
  position: relative;
  width: 100%;
  max-width: 400px;
  aspect-ratio: 16 / 9;
  border: 2px dashed ${colors.gray[300]};
  border-radius: ${borders.radius.lg};
  overflow: hidden;
  background: ${colors.gray[50]};
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all ${animations.duration.fast} ${animations.easing.out};

  &:hover {
    border-color: ${colors.gray[400]};
  }

  &[data-has-image="true"] {
    border-style: solid;
    border-color: ${colors.gray[300]};
  }
`;

const PreviewImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const PlaceholderContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${spacing[2]};
  color: ${colors.gray[500]};
  text-align: center;
  padding: ${spacing[4]};

  svg {
    width: 48px;
    height: 48px;
  }

  p {
    font-size: ${typography.fontSize.sm};
    margin: 0;
  }
`;

const RemoveButton = styled.button`
  position: absolute;
  top: ${spacing[2]};
  right: ${spacing[2]};
  width: 32px;
  height: 32px;
  border-radius: ${borders.radius.full};
  background: ${colors.white};
  border: 1px solid ${colors.gray[300]};
  color: ${colors.gray[700]};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: all ${animations.duration.fast} ${animations.easing.out};
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);

  ${PreviewArea}:hover & {
    opacity: 1;
  }

  &:hover {
    background: ${colors.gray[100]};
    border-color: ${colors.gray[400]};
  }

  &:active {
    transform: scale(0.95);
  }
`;

const UrlInput = styled.input`
  width: 100%;
  padding: ${spacing[3]} ${spacing[4]};
  font-size: ${typography.fontSize.sm};
  font-family: ${typography.fontFamily.sans};
  color: ${colors.gray[900]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.md};
  transition: all ${animations.duration.fast} ${animations.easing.out};

  &::placeholder {
    color: ${colors.gray[400]};
  }

  &:hover {
    border-color: ${colors.gray[400]};
  }

  &:focus {
    outline: none;
    border-color: ${colors.accent[500]};
    box-shadow: 0 0 0 3px ${colors.focus};
  }
`;

const UploadButton = styled.button`
  padding: ${spacing[2]} ${spacing[4]};
  background: ${colors.accent[500]};
  color: ${colors.white};
  border: none;
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.semibold};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: ${spacing[2]};
  transition: all ${animations.duration.fast} ${animations.easing.out};

  &:hover {
    background: ${colors.accent[600]};
  }

  &:active {
    transform: scale(0.98);
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

interface ImageFieldProps {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  error?: string;
}

export function ImageField({
  name,
  label,
  value,
  onChange,
  required,
  disabled,
  helpText,
  error,
}: ImageFieldProps) {
  const [urlInput, setUrlInput] = useState(value);

  const handleUrlChange = (newUrl: string) => {
    setUrlInput(newUrl);
    onChange(newUrl);
  };

  const handleRemove = () => {
    setUrlInput('');
    onChange('');
  };

  return (
    <FieldWrapper
      label={label}
      name={name}
      required={required}
      helpText={helpText || 'Enter an image URL or upload an image'}
      error={error}
    >
      <ImageContainer>
        <PreviewArea data-has-image={!!value}>
          {value ? (
            <>
              <PreviewImage src={value} alt="Preview" />
              <RemoveButton
                type="button"
                onClick={handleRemove}
                title="Remove image"
              >
                <X size={16} />
              </RemoveButton>
            </>
          ) : (
            <PlaceholderContent>
              <ImageIcon />
              <p>No image selected</p>
            </PlaceholderContent>
          )}
        </PreviewArea>

        <UrlInput
          type="url"
          value={urlInput}
          onChange={(e) => handleUrlChange(e.target.value)}
          placeholder="https://example.com/image.jpg"
          disabled={disabled}
        />

        <UploadButton type="button" disabled={disabled}>
          <Upload />
          Upload Image (Coming Soon)
        </UploadButton>
      </ImageContainer>
    </FieldWrapper>
  );
}
