/**
 * ImageField Component
 *
 * Image selection with integrated Media Library picker.
 * - Browse from existing media library
 * - Upload new image directly
 * - Paste URL manually
 */

import { useState, useRef, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { colors, spacing, typography, borders, shadows, animations } from '../../shared/styles/design-tokens';
import { FieldWrapper } from './FieldWrapper';
import { Upload, X, Image as ImageIcon, FolderOpen, Link, Loader, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../features/auth/hooks/useAuth';

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

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
  cursor: pointer;
  transition: all ${animations.duration.fast} ${animations.easing.out};

  &:hover {
    border-color: ${colors.accent[400]};
    background: ${colors.accent[50]};
  }

  &[data-has-image="true"] {
    border-style: solid;
    border-color: ${colors.gray[300]};
    cursor: default;
    &:hover { border-color: ${colors.gray[300]}; background: transparent; }
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

  svg { width: 40px; height: 40px; }
  p { font-size: ${typography.fontSize.sm}; margin: 0; }
  .hint { font-size: ${typography.fontSize.xs}; color: ${colors.gray[400]}; }
`;

const RemoveButton = styled.button`
  position: absolute;
  top: ${spacing[2]};
  right: ${spacing[2]};
  width: 28px;
  height: 28px;
  border-radius: ${borders.radius.full};
  background: rgba(0,0,0,0.6);
  border: none;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;

  ${PreviewArea}:hover & { opacity: 1; }
  &:hover { background: rgba(0,0,0,0.8); }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: ${spacing[2]};
  flex-wrap: wrap;
`;

const ActionBtn = styled.button`
  padding: ${spacing[2]} ${spacing[3]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.xs};
  font-weight: ${typography.fontWeight.medium};
  color: ${colors.gray[700]};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: ${spacing[2]};
  transition: all 0.15s;
  font-family: ${typography.fontFamily.sans};

  &:hover { background: ${colors.gray[50]}; border-color: ${colors.gray[400]}; }
  &.primary {
    background: ${colors.accent[500]};
    border-color: ${colors.accent[500]};
    color: #fff;
    &:hover { background: ${colors.accent[600]}; }
  }
  svg { width: 14px; height: 14px; }
`;

// Media picker modal styles
const PickerOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${spacing[4]};
  animation: ${fadeIn} 0.15s;
`;

const PickerModal = styled.div`
  width: 100%;
  max-width: 800px;
  max-height: 80vh;
  background: ${colors.white};
  border-radius: ${borders.radius['2xl']};
  box-shadow: ${shadows['2xl']};
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const PickerHeader = styled.div`
  padding: ${spacing[5]} ${spacing[5]} ${spacing[4]};
  border-bottom: 1px solid ${colors.gray[200]};
  display: flex;
  align-items: center;
  justify-content: space-between;

  h3 { margin: 0; font-size: ${typography.fontSize.lg}; font-weight: ${typography.fontWeight.semibold}; }
  button {
    background: none; border: none; cursor: pointer; color: ${colors.gray[400]};
    padding: ${spacing[1]}; border-radius: ${borders.radius.md};
    &:hover { color: ${colors.gray[600]}; background: ${colors.gray[100]}; }
  }
`;

const PickerGrid = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${spacing[4]};
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: ${spacing[3]};
`;

const PickerItem = styled.div<{ $selected?: boolean }>`
  aspect-ratio: 1;
  border-radius: ${borders.radius.lg};
  overflow: hidden;
  cursor: pointer;
  border: 2px solid ${props => props.$selected ? colors.accent[500] : colors.gray[200]};
  position: relative;
  transition: all 0.15s;

  &:hover { border-color: ${colors.accent[400]}; }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .check {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: ${colors.accent[500]};
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
  }
`;

const PickerEmpty = styled.div`
  grid-column: 1 / -1;
  padding: ${spacing[10]};
  text-align: center;
  color: ${colors.gray[500]};
  font-size: ${typography.fontSize.sm};
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
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [mediaFiles, setMediaFiles] = useState<any[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const openPicker = useCallback(async () => {
    setShowPicker(true);
    setPickerLoading(true);
    try {
      const { data } = await supabase
        .from('media')
        .select('*')
        .ilike('mime_type', 'image/%')
        .order('created_at', { ascending: false })
        .limit(50);

      const files = (data || []).map((f: any) => {
        const { data: { publicUrl } } = supabase.storage
          .from(f.bucket_name || 'media')
          .getPublicUrl(f.storage_path);
        return { ...f, url: publicUrl };
      });
      setMediaFiles(files);
    } catch {
      // Silently fail
    } finally {
      setPickerLoading(false);
    }
  }, []);

  const handleUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
      const storagePath = `${user.id}/${uniqueName}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(storagePath, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(storagePath);

      await supabase.from('media').insert({
        filename: uniqueName,
        original_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        storage_path: storagePath,
        bucket_name: 'media',
        uploaded_by: user.id,
        folder_path: '/',
        is_public: false,
      });

      onChange(publicUrl);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => onChange('');

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      onChange(urlInput.trim());
      setShowUrlInput(false);
      setUrlInput('');
    }
  };

  return (
    <FieldWrapper
      label={label}
      name={name}
      required={required}
      helpText={helpText || 'Select from media library, upload, or paste a URL'}
      error={error}
    >
      <ImageContainer>
        <PreviewArea
          data-has-image={!!value}
          onClick={() => !value && openPicker()}
        >
          {value ? (
            <>
              <PreviewImage src={value} alt="Preview" />
              <RemoveButton type="button" onClick={handleRemove}>
                <X size={14} />
              </RemoveButton>
            </>
          ) : (
            <PlaceholderContent>
              <ImageIcon />
              <p>Click to select an image</p>
              <span className="hint">or use the buttons below</span>
            </PlaceholderContent>
          )}
        </PreviewArea>

        {showUrlInput ? (
          <div style={{ display: 'flex', gap: spacing[2] }}>
            <input
              type="url"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleUrlSubmit()}
              placeholder="https://example.com/image.jpg"
              style={{
                flex: 1, padding: `${spacing[2]} ${spacing[3]}`,
                border: `1px solid ${colors.gray[300]}`, borderRadius: borders.radius.md,
                fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.sans,
              }}
              autoFocus
            />
            <ActionBtn onClick={handleUrlSubmit}><Check size={14} /></ActionBtn>
            <ActionBtn onClick={() => setShowUrlInput(false)}><X size={14} /></ActionBtn>
          </div>
        ) : (
          <ActionButtons>
            <ActionBtn className="primary" onClick={openPicker} disabled={disabled}>
              <FolderOpen /> Media Library
            </ActionBtn>
            <ActionBtn onClick={() => fileRef.current?.click()} disabled={disabled || uploading}>
              <Upload /> {uploading ? 'Uploading...' : 'Upload'}
            </ActionBtn>
            <ActionBtn onClick={() => setShowUrlInput(true)} disabled={disabled}>
              <Link /> Paste URL
            </ActionBtn>
          </ActionButtons>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
        />
      </ImageContainer>

      {/* Media Library Picker Modal */}
      {showPicker && (
        <PickerOverlay onClick={() => setShowPicker(false)}>
          <PickerModal onClick={e => e.stopPropagation()}>
            <PickerHeader>
              <h3>Select Image</h3>
              <button onClick={() => setShowPicker(false)}><X size={20} /></button>
            </PickerHeader>
            <PickerGrid>
              {pickerLoading ? (
                <PickerEmpty>
                  <Loader size={24} style={{ animation: 'spin 1s linear infinite' }} />
                </PickerEmpty>
              ) : mediaFiles.length === 0 ? (
                <PickerEmpty>No images in media library. Upload one first.</PickerEmpty>
              ) : (
                mediaFiles.map(file => (
                  <PickerItem
                    key={file.id}
                    $selected={value === file.url}
                    onClick={() => { onChange(file.url); setShowPicker(false); }}
                  >
                    <img src={file.url} alt={file.original_name || file.filename} />
                    {value === file.url && (
                      <div className="check"><Check size={14} /></div>
                    )}
                  </PickerItem>
                ))
              )}
            </PickerGrid>
          </PickerModal>
        </PickerOverlay>
      )}
    </FieldWrapper>
  );
}
