/**
 * MediaLibrary Component - Ultra-minimal Bento Grid UI
 * Monochrome gallery-style interface for 2026
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { useDropzone } from 'react-dropzone';
import { decode as decodeBlurhash } from 'blurhash';
import { AnimatePresence, motion } from 'framer-motion';
import { useIntersectionObserver } from 'react-use';
import type { MediaAsset } from '@kiban/types';

// ============================================
// TYPES
// ============================================

interface MediaLibraryProps {
  onSelect?: (asset: MediaAsset) => void;
  onUpload?: (files: File[]) => Promise<void>;
  multiple?: boolean;
  accept?: string[];
  maxSize?: number;
}

interface MediaItemProps {
  asset: MediaAsset;
  selected: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

// ============================================
// STYLED COMPONENTS
// ============================================

const Container = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #FFFFFF;
  position: relative;
`;

const Header = styled.div`
  padding: 24px;
  border-bottom: 0.5px solid #E5E5E5;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 700;
  color: #000000;
  letter-spacing: -0.02em;
`;

const Actions = styled.div`
  display: flex;
  gap: 16px;
`;

const ActionButton = styled.button`
  padding: 8px 16px;
  background: transparent;
  border: 1px solid #000000;
  border-radius: 4px;
  color: #000000;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;

  &:hover {
    background: #000000;
    color: #FFFFFF;
  }
`;

const Content = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 24px;

  /* Hide scrollbar */
  &::-webkit-scrollbar {
    width: 0;
    display: none;
  }
`;

const BentoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  animation: fadeIn 300ms ease;

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @media (min-width: 768px) {
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  }

  @media (min-width: 1280px) {
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  }
`;

const MediaCard = styled(motion.div)<{ $selected: boolean }>`
  aspect-ratio: 1;
  position: relative;
  background: #F5F5F5;
  border-radius: 2px;
  overflow: hidden;
  cursor: pointer;
  transition: all 200ms ease;

  ${props => props.$selected && `
    ring: 2px solid #000000;
    transform: scale(0.98);
  `}

  &:hover {
    .overlay {
      opacity: 1;
    }
  }
`;

const MediaImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const BlurhashCanvas = styled.canvas`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
`;

const MediaOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, transparent 60%, rgba(0, 0, 0, 0.8));
  opacity: 0;
  transition: opacity 200ms ease;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 12px;
`;

const MediaInfo = styled.div`
  color: #FFFFFF;
`;

const MediaName = styled.div`
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const MediaMeta = styled.div`
  font-size: 10px;
  opacity: 0.8;
  display: flex;
  gap: 8px;
`;

const DropzoneArea = styled.div<{ $isDragActive: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(255, 255, 255, 0.98);
  display: ${props => props.$isDragActive ? 'flex' : 'none'};
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 200ms ease;
`;

const DropzoneContent = styled.div`
  text-align: center;
`;

const DropzoneIcon = styled.div`
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  background: #000000;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  font-size: 24px;
`;

const DropzoneText = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: #000000;
  margin-bottom: 8px;
`;

const DropzoneHint = styled.div`
  font-size: 14px;
  color: #737373;
`;

const ContextMenu = styled(motion.div)`
  position: fixed;
  background: #FFFFFF;
  border: 0.5px solid #E5E5E5;
  border-radius: 4px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  padding: 4px;
  z-index: 1001;
  min-width: 160px;
`;

const ContextMenuItem = styled.button`
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  text-align: left;
  font-size: 14px;
  color: #000000;
  cursor: pointer;
  border-radius: 2px;
  display: flex;
  align-items: center;
  gap: 8px;

  &:hover {
    background: #F5F5F5;
  }
`;

const ModalOverlay = styled(motion.div)`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1002;
  backdrop-filter: blur(8px);
`;

const Modal = styled(motion.div)`
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  background: #FFFFFF;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
`;

const ModalImage = styled.div`
  flex: 1;
  background: #000000;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
`;

const ModalSidebar = styled.div`
  width: 320px;
  background: #FFFFFF;
  border-left: 0.5px solid #E5E5E5;
  padding: 24px;
  overflow-y: auto;
`;

const ModalTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  color: #000000;
  margin-bottom: 24px;
`;

const MetadataField = styled.div`
  margin-bottom: 20px;
`;

const FieldLabel = styled.label`
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #737373;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
`;

const FieldInput = styled.input`
  width: 100%;
  padding: 8px 12px;
  background: #F5F5F5;
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 14px;
  color: #000000;
  transition: all 150ms ease;

  &:focus {
    outline: none;
    background: #FFFFFF;
    border-color: #000000;
  }
`;

const FieldTextarea = styled.textarea`
  width: 100%;
  padding: 8px 12px;
  background: #F5F5F5;
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 14px;
  color: #000000;
  resize: vertical;
  min-height: 80px;
  transition: all 150ms ease;

  &:focus {
    outline: none;
    background: #FFFFFF;
    border-color: #000000;
  }
`;

// ============================================
// MAIN COMPONENT
// ============================================

export const MediaLibrary: React.FC<MediaLibraryProps> = ({
  onSelect,
  onUpload,
  multiple = false,
  accept,
  maxSize,
}) => {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; asset: MediaAsset } | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Dropzone configuration
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept: accept ? Object.fromEntries(accept.map(type => [type, []])) : undefined,
    maxSize,
    multiple,
    noClick: true,
    noKeyboard: true,
  });

  // Handle file drop
  async function handleDrop(acceptedFiles: File[]) {
    if (!onUpload) return;

    setIsUploading(true);
    try {
      await onUpload(acceptedFiles);
      // Refresh asset list
      await loadAssets();
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  }

  // Load assets from API
  async function loadAssets() {
    // This would fetch from your API
    // For demo, using mock data
    setAssets([
      // Mock assets
    ]);
  }

  // Handle asset selection
  const handleSelect = useCallback((asset: MediaAsset) => {
    if (multiple) {
      const newSelection = new Set(selectedAssets);
      if (newSelection.has(asset.id)) {
        newSelection.delete(asset.id);
      } else {
        newSelection.add(asset.id);
      }
      setSelectedAssets(newSelection);
    } else {
      setSelectedAssets(new Set([asset.id]));
      onSelect?.(asset);
    }
  }, [multiple, selectedAssets, onSelect]);

  // Handle context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, asset: MediaAsset) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      asset,
    });
  }, []);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Handle modal close
  const handleModalClose = useCallback(() => {
    setSelectedAsset(null);
  }, []);

  return (
    <Container {...getRootProps()}>
      <input {...getInputProps()} />

      <Header>
        <Title>Media Library</Title>
        <Actions>
          <ActionButton onClick={() => document.querySelector('input[type="file"]')?.click()}>
            Upload
          </ActionButton>
        </Actions>
      </Header>

      <Content>
        <BentoGrid>
          {assets.map(asset => (
            <MediaItem
              key={asset.id}
              asset={asset}
              selected={selectedAssets.has(asset.id)}
              onSelect={() => handleSelect(asset)}
              onContextMenu={(e) => handleContextMenu(e, asset)}
            />
          ))}
        </BentoGrid>
      </Content>

      {/* Dropzone overlay */}
      <DropzoneArea $isDragActive={isDragActive}>
        <DropzoneContent>
          <DropzoneIcon>↑</DropzoneIcon>
          <DropzoneText>Drop files to upload</DropzoneText>
          <DropzoneHint>Images will be automatically optimized</DropzoneHint>
        </DropzoneContent>
      </DropzoneArea>

      {/* Context menu */}
      <AnimatePresence>
        {contextMenu && (
          <ContextMenu
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <ContextMenuItem onClick={() => setSelectedAsset(contextMenu.asset)}>
              Edit Details
            </ContextMenuItem>
            <ContextMenuItem onClick={() => navigator.clipboard.writeText(contextMenu.asset.cdn_url || '')}>
              Copy URL
            </ContextMenuItem>
            <ContextMenuItem onClick={() => window.open(contextMenu.asset.cdn_url, '_blank')}>
              Open Original
            </ContextMenuItem>
            <ContextMenuItem style={{ color: '#EF4444' }}>
              Delete
            </ContextMenuItem>
          </ContextMenu>
        )}
      </AnimatePresence>

      {/* Modal for editing */}
      <AnimatePresence>
        {selectedAsset && (
          <ModalOverlay
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleModalClose}
          >
            <Modal
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
            >
              <ModalImage>
                <img src={selectedAsset.cdn_url} alt={selectedAsset.alt_text} />
              </ModalImage>

              <ModalSidebar>
                <ModalTitle>Edit Details</ModalTitle>

                <MetadataField>
                  <FieldLabel>Alt Text (SEO)</FieldLabel>
                  <FieldInput
                    type="text"
                    defaultValue={selectedAsset.alt_text}
                    placeholder="Describe the image for accessibility"
                  />
                </MetadataField>

                <MetadataField>
                  <FieldLabel>Caption</FieldLabel>
                  <FieldTextarea
                    defaultValue={selectedAsset.caption}
                    placeholder="Optional caption for display"
                  />
                </MetadataField>

                <MetadataField>
                  <FieldLabel>Tags</FieldLabel>
                  <FieldInput
                    type="text"
                    defaultValue={selectedAsset.tags?.join(', ')}
                    placeholder="Comma-separated tags"
                  />
                </MetadataField>

                <MetadataField>
                  <FieldLabel>AI Suggestions</FieldLabel>
                  <div style={{ padding: '12px', background: '#F5F5F5', borderRadius: '4px' }}>
                    <div style={{ fontSize: '12px', color: '#737373' }}>
                      {selectedAsset.detected_objects?.map(obj => obj.label).join(', ') || 'Analyzing...'}
                    </div>
                  </div>
                </MetadataField>
              </ModalSidebar>
            </Modal>
          </ModalOverlay>
        )}
      </AnimatePresence>
    </Container>
  );
};

// ============================================
// MEDIA ITEM COMPONENT
// ============================================

const MediaItem: React.FC<MediaItemProps> = ({ asset, selected, onSelect, onContextMenu }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intersectionRef = useRef<HTMLDivElement>(null);
  const intersection = useIntersectionObserver(intersectionRef, {
    rootMargin: '50px',
  });

  // Render blurhash
  useEffect(() => {
    if (!asset.blurhash || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pixels = decodeBlurhash(asset.blurhash, 32, 32);
    const imageData = ctx.createImageData(32, 32);
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);
  }, [asset.blurhash]);

  const formatFileSize = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round(bytes / Math.pow(1024, i) * 10) / 10} ${sizes[i]}`;
  };

  return (
    <MediaCard
      ref={intersectionRef}
      $selected={selected}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
    >
      {asset.blurhash && !imageLoaded && (
        <BlurhashCanvas ref={canvasRef} width={32} height={32} />
      )}

      {intersection?.isIntersecting && (
        <MediaImage
          src={asset.cdn_url || asset.storage_path}
          alt={asset.alt_text}
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          style={{ opacity: imageLoaded ? 1 : 0 }}
        />
      )}

      <MediaOverlay className="overlay">
        <MediaInfo>
          <MediaName>{asset.original_name}</MediaName>
          <MediaMeta>
            <span>{formatFileSize(asset.size_bytes)}</span>
            {asset.width && asset.height && (
              <span>{asset.width}×{asset.height}</span>
            )}
          </MediaMeta>
        </MediaInfo>
      </MediaOverlay>
    </MediaCard>
  );
};

export default MediaLibrary;