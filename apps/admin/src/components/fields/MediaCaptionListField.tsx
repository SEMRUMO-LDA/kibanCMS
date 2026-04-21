/**
 * MediaCaptionListField
 * Composition field — an ordered list of {image, caption} items with a min/max.
 * Used for tour highlights (3–5 photos + short caption each).
 *
 * Each item is a card: thumbnail, "Change"/"Upload" buttons, caption input, remove.
 * Value shape: Array<{ image: string; caption: string }>.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { Image as ImageIcon, Upload, X, Plus, Loader, Check } from 'lucide-react';
import { colors, spacing, typography, borders, shadows, animations } from '../../shared/styles/design-tokens';
import { api } from '../../lib/api';
import { FieldWrapper } from './FieldWrapper';

// ── Types ──

interface Item {
  image: string;
  caption: string;
}

interface MediaCaptionListFieldProps {
  name: string;
  label: string;
  value: unknown;
  onChange: (value: Item[]) => void;
  minItems?: number;
  maxItems?: number;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  error?: string;
}

// ── Styles ──

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const spin = keyframes`to { transform: rotate(360deg); }`;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[3]};
  padding: ${spacing[3]};
  background: ${colors.gray[50]};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.md};
`;

const Card = styled.div`
  display: grid;
  grid-template-columns: 120px 1fr auto;
  gap: ${spacing[3]};
  padding: ${spacing[3]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.md};
`;

const Thumb = styled.div`
  width: 120px;
  height: 90px;
  border-radius: ${borders.radius.md};
  border: 1px dashed ${colors.gray[300]};
  background: ${colors.gray[50]};
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${colors.gray[400]};
  position: relative;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const ThumbActions = styled.div`
  display: flex;
  gap: ${spacing[2]};
  margin-top: ${spacing[2]};
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[2]};
  min-width: 0;
`;

const CaptionInput = styled.input`
  width: 100%;
  padding: ${spacing[2]} ${spacing[3]};
  font-size: ${typography.fontSize.sm};
  font-family: ${typography.fontFamily.sans};
  color: ${colors.gray[900]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.md};

  &:focus {
    outline: none;
    border-color: ${colors.accent[500]};
    box-shadow: 0 0 0 3px ${colors.focus};
  }
`;

const SmallBtn = styled.button<{ $primary?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: ${spacing[1]};
  padding: ${spacing[1]} ${spacing[2]};
  background: ${props => (props.$primary ? colors.gray[900] : colors.white)};
  color: ${props => (props.$primary ? colors.white : colors.gray[700])};
  border: 1px solid ${props => (props.$primary ? colors.gray[900] : colors.gray[300])};
  border-radius: ${borders.radius.sm};
  font-size: ${typography.fontSize.xs};
  font-weight: ${typography.fontWeight.medium};
  font-family: ${typography.fontFamily.sans};
  cursor: pointer;

  &:hover:not(:disabled) { opacity: 0.9; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  svg.spin { animation: ${spin} 0.8s linear infinite; }
`;

const RemoveBtn = styled.button`
  align-self: flex-start;
  background: none;
  border: none;
  color: ${colors.gray[400]};
  cursor: pointer;
  padding: ${spacing[1]};
  border-radius: ${borders.radius.sm};
  &:hover { color: ${colors.gray[900]}; background: ${colors.gray[100]}; }
`;

const AddRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${spacing[2]};
`;

const AddBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${spacing[2]};
  padding: ${spacing[2]} ${spacing[3]};
  background: ${colors.gray[900]};
  color: ${colors.white};
  border: 1px solid ${colors.gray[900]};
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.medium};
  font-family: ${typography.fontFamily.sans};
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const Counter = styled.span`
  font-size: ${typography.fontSize.xs};
  color: ${colors.gray[500]};
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: ${spacing[4]};
  animation: ${fadeIn} ${animations.duration.fast} ${animations.easing.out};
`;

const PickerModal = styled.div`
  width: 100%;
  max-width: 720px;
  max-height: 80vh;
  background: ${colors.white};
  border-radius: ${borders.radius.xl};
  box-shadow: ${shadows.xl};
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const PickerHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${spacing[4]} ${spacing[5]};
  border-bottom: 1px solid ${colors.gray[200]};

  h3 { margin: 0; font-size: ${typography.fontSize.base}; font-weight: ${typography.fontWeight.semibold}; }
  button { background: none; border: none; color: ${colors.gray[500]}; cursor: pointer; padding: ${spacing[1]}; }
`;

const PickerGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: ${spacing[2]};
  padding: ${spacing[4]};
  overflow-y: auto;
  flex: 1;
`;

const PickerItem = styled.div<{ $selected?: boolean }>`
  aspect-ratio: 1 / 1;
  background: ${colors.gray[100]};
  border-radius: ${borders.radius.md};
  overflow: hidden;
  cursor: pointer;
  border: 2px solid ${props => (props.$selected ? colors.accent[500] : 'transparent')};
  position: relative;
  transition: border-color ${animations.duration.fast};

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
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: ${colors.accent[500]};
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
  }
`;

const EmptyState = styled.div`
  grid-column: 1 / -1;
  padding: ${spacing[8]};
  text-align: center;
  color: ${colors.gray[500]};
  font-size: ${typography.fontSize.sm};
`;

// ── Helpers ──

function parseValue(value: unknown): Item[] {
  if (Array.isArray(value)) {
    return value.map(v =>
      typeof v === 'object' && v
        ? { image: String((v as any).image || ''), caption: String((v as any).caption || '') }
        : { image: '', caption: String(v || '') }
    );
  }
  if (typeof value === 'string' && value.trim()) {
    // Legacy: newline-separated captions (old highlights textarea)
    return value
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(caption => ({ image: '', caption }));
  }
  return [];
}

// ── Component ──

export function MediaCaptionListField({
  name,
  label,
  value,
  onChange,
  minItems = 0,
  maxItems = 10,
  required,
  disabled,
  helpText,
  error,
}: MediaCaptionListFieldProps) {
  const items = parseValue(value);
  const [pickerForIndex, setPickerForIndex] = useState<number | null>(null);
  const [mediaFiles, setMediaFiles] = useState<any[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const update = (next: Item[]) => onChange(next);

  const updateItem = (i: number, patch: Partial<Item>) => {
    const next = [...items];
    next[i] = { ...next[i], ...patch };
    update(next);
  };

  const addItem = () => {
    if (items.length >= maxItems) return;
    update([...items, { image: '', caption: '' }]);
  };

  const removeItem = (i: number) => {
    update(items.filter((_, idx) => idx !== i));
  };

  const loadMedia = useCallback(async () => {
    setPickerLoading(true);
    try {
      const { data } = await api.getMedia({ type: 'image', limit: '60' });
      setMediaFiles(data || []);
    } catch {
      setMediaFiles([]);
    } finally {
      setPickerLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pickerForIndex !== null) loadMedia();
  }, [pickerForIndex, loadMedia]);

  const handleFileUpload = async (i: number, file: File) => {
    setUploadingIdx(i);
    try {
      const { data, error: uploadErr } = await api.uploadMedia(file);
      if (uploadErr) throw new Error(uploadErr);
      if (data?.url) updateItem(i, { image: data.url });
    } catch (err: any) {
      alert('Upload failed: ' + (err.message || 'unknown'));
    } finally {
      setUploadingIdx(null);
    }
  };

  const atMin = items.length <= minItems;
  const atMax = items.length >= maxItems;

  return (
    <FieldWrapper label={label} name={name} required={required} helpText={helpText} error={error}>
      <Container>
        {items.length === 0 && (
          <EmptyState>No items yet. Click "Add" to create the first one.</EmptyState>
        )}

        {items.map((item, i) => (
          <Card key={i}>
            <div>
              <Thumb>
                {item.image ? (
                  <img src={item.image} alt={item.caption || `Item ${i + 1}`} />
                ) : (
                  <ImageIcon size={28} />
                )}
              </Thumb>
              <ThumbActions>
                <SmallBtn type="button" onClick={() => setPickerForIndex(i)} disabled={disabled}>
                  <ImageIcon size={12} /> Library
                </SmallBtn>
                <SmallBtn
                  type="button"
                  onClick={() => fileRefs.current[i]?.click()}
                  disabled={disabled || uploadingIdx === i}
                >
                  {uploadingIdx === i ? (
                    <><Loader size={12} className="spin" /> Uploading</>
                  ) : (
                    <><Upload size={12} /> Upload</>
                  )}
                </SmallBtn>
                <input
                  ref={el => { fileRefs.current[i] = el; }}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(i, f);
                    e.target.value = '';
                  }}
                />
              </ThumbActions>
            </div>

            <Column>
              <CaptionInput
                type="text"
                value={item.caption}
                onChange={e => updateItem(i, { caption: e.target.value })}
                placeholder="Caption (optional)"
                disabled={disabled}
                maxLength={120}
              />
              {item.image && (
                <SmallBtn type="button" onClick={() => updateItem(i, { image: '' })} disabled={disabled}>
                  <X size={12} /> Clear image
                </SmallBtn>
              )}
            </Column>

            <RemoveBtn
              type="button"
              onClick={() => removeItem(i)}
              disabled={disabled || atMin}
              title={atMin ? `Minimum ${minItems} items required` : 'Remove'}
            >
              <X size={16} />
            </RemoveBtn>
          </Card>
        ))}

        <AddRow>
          <AddBtn type="button" onClick={addItem} disabled={disabled || atMax}>
            <Plus size={14} /> Add {label.toLowerCase().replace(/s$/, '')}
          </AddBtn>
          <Counter>
            {items.length} / {maxItems}
            {minItems > 0 && items.length < minItems && ` — minimum ${minItems}`}
          </Counter>
        </AddRow>
      </Container>

      {pickerForIndex !== null && (
        <Overlay onClick={() => setPickerForIndex(null)}>
          <PickerModal onClick={e => e.stopPropagation()}>
            <PickerHeader>
              <h3>Choose image</h3>
              <button type="button" onClick={() => setPickerForIndex(null)}>
                <X size={20} />
              </button>
            </PickerHeader>
            <PickerGrid>
              {pickerLoading && <EmptyState>Loading…</EmptyState>}
              {!pickerLoading && mediaFiles.length === 0 && (
                <EmptyState>No images in the media library yet. Upload some first.</EmptyState>
              )}
              {!pickerLoading &&
                mediaFiles.map(m => {
                  const url = m.url || m.public_url || '';
                  const selected = items[pickerForIndex]?.image === url;
                  return (
                    <PickerItem
                      key={m.id}
                      $selected={selected}
                      onClick={() => {
                        if (pickerForIndex !== null) {
                          updateItem(pickerForIndex, { image: url });
                          setPickerForIndex(null);
                        }
                      }}
                    >
                      <img src={url} alt={m.alt_text || m.filename || ''} />
                      {selected && (
                        <div className="check">
                          <Check size={14} />
                        </div>
                      )}
                    </PickerItem>
                  );
                })}
            </PickerGrid>
          </PickerModal>
        </Overlay>
      )}
    </FieldWrapper>
  );
}
