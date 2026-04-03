/**
 * Media Library Page
 *
 * Full-featured media management:
 * - Upload (drag & drop + file picker)
 * - Grid view with thumbnails
 * - Delete, copy URL
 * - Filter by type
 * - Search
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import {
  Image as ImageIcon,
  Upload,
  Trash2,
  Copy,
  Check,
  Search,
  Filter,
  X,
  File,
  FileVideo,
  FileAudio,
  Loader,
  AlertCircle
} from 'lucide-react';
import { colors, spacing, typography, borders, shadows, animations } from '../shared/styles/design-tokens';
import { supabase } from '../lib/supabase';
import { useAuth } from '../features/auth/hooks/useAuth';
import { useToast } from '../components/Toast';

// ============================================
// ANIMATIONS
// ============================================

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const scaleIn = keyframes`
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
`;

// ============================================
// TYPES
// ============================================

type MediaType = 'image' | 'video' | 'audio' | 'document' | 'all';

interface MediaFile {
  id: string;
  filename: string;
  original_name: string;
  storage_path: string;
  bucket_name: string;
  mime_type: string;
  size_bytes: number;
  alt_text: string | null;
  caption: string | null;
  folder_path: string;
  is_public: boolean;
  url?: string;
  created_at: string;
}

// ============================================
// STYLED COMPONENTS
// ============================================

const Container = styled.div`
  max-width: 1400px;
  animation: ${fadeIn} ${animations.duration.normal} ${animations.easing.out};
`;

const Header = styled.header`
  margin-bottom: ${spacing[8]};

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
`;

const Controls = styled.div`
  display: flex;
  gap: ${spacing[3]};
  margin-bottom: ${spacing[6]};
  flex-wrap: wrap;
`;

const SearchBox = styled.div`
  flex: 1;
  min-width: 280px;
  position: relative;

  input {
    width: 100%;
    padding: ${spacing[3]} ${spacing[4]} ${spacing[3]} ${spacing[11]};
    border: 1px solid ${colors.gray[200]};
    border-radius: ${borders.radius.lg};
    font-size: ${typography.fontSize.sm};
    background: ${colors.white};
    color: ${colors.gray[900]};
    transition: all ${animations.duration.fast} ${animations.easing.out};
    font-family: ${typography.fontFamily.sans};

    &::placeholder {
      color: ${colors.gray[400]};
    }

    &:focus {
      outline: none;
      border-color: ${colors.accent[500]};
      box-shadow: 0 0 0 3px ${colors.accent[500]}20;
    }
  }

  svg {
    position: absolute;
    left: ${spacing[4]};
    top: 50%;
    transform: translateY(-50%);
    color: ${colors.gray[400]};
    pointer-events: none;
  }
`;

const FilterButtons = styled.div`
  display: flex;
  gap: ${spacing[2]};
  flex-wrap: wrap;
`;

const FilterButton = styled.button<{ $active?: boolean }>`
  padding: ${spacing[3]} ${spacing[4]};
  background: ${props => props.$active ? colors.accent[50] : colors.white};
  border: 1px solid ${props => props.$active ? colors.accent[300] : colors.gray[200]};
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.medium};
  color: ${props => props.$active ? colors.accent[700] : colors.gray[700]};
  cursor: pointer;
  transition: all ${animations.duration.fast} ${animations.easing.out};
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  font-family: ${typography.fontFamily.sans};

  &:hover {
    background: ${props => props.$active ? colors.accent[100] : colors.gray[50]};
  }
`;

const UploadButton = styled.button`
  padding: ${spacing[3]} ${spacing[5]};
  background: ${colors.accent[500]};
  color: ${colors.white};
  border: none;
  border-radius: ${borders.radius.lg};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.semibold};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  transition: all ${animations.duration.fast} ${animations.easing.out};
  box-shadow: ${shadows.sm};
  font-family: ${typography.fontFamily.sans};

  &:hover:not(:disabled) {
    background: ${colors.accent[600]};
    box-shadow: ${shadows.md};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const DropZone = styled.div<{ $isDragging?: boolean }>`
  background: ${props => props.$isDragging ? colors.accent[50] : colors.gray[50]};
  border: 2px dashed ${props => props.$isDragging ? colors.accent[400] : colors.gray[300]};
  border-radius: ${borders.radius.xl};
  padding: ${spacing[12]} ${spacing[8]};
  text-align: center;
  transition: all ${animations.duration.normal} ${animations.easing.out};
  cursor: pointer;
  margin-bottom: ${spacing[6]};

  &:hover {
    border-color: ${colors.accent[400]};
    background: ${colors.accent[50]};
  }

  .drop-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto ${spacing[4]};
    border-radius: ${borders.radius.full};
    background: ${colors.white};
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${colors.gray[400]};
    border: 1px solid ${colors.gray[200]};

    svg {
      width: 32px;
      height: 32px;
    }
  }

  h3 {
    font-size: ${typography.fontSize.lg};
    font-weight: ${typography.fontWeight.semibold};
    margin: 0 0 ${spacing[2]} 0;
    color: ${colors.gray[900]};
  }

  p {
    color: ${colors.gray[600]};
    font-size: ${typography.fontSize.sm};
    margin: 0 0 ${spacing[4]} 0;

    strong {
      color: ${colors.accent[600]};
      font-weight: ${typography.fontWeight.semibold};
      cursor: pointer;

      &:hover {
        text-decoration: underline;
      }
    }
  }

  .supported {
    font-size: ${typography.fontSize.xs};
    color: ${colors.gray[500]};
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: ${spacing[5]};
  animation: ${fadeIn} ${animations.duration.slow} ${animations.easing.out} 100ms backwards;
`;

const MediaCard = styled.div`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.lg};
  overflow: hidden;
  transition: all ${animations.duration.normal} ${animations.easing.out};
  animation: ${scaleIn} ${animations.duration.normal} ${animations.easing.out};

  &:hover {
    box-shadow: ${shadows.lg};
    transform: translateY(-2px);

    .actions {
      opacity: 1;
    }
  }
`;

const MediaPreview = styled.div`
  aspect-ratio: 16 / 10;
  background: ${colors.gray[100]};
  position: relative;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .icon-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${colors.gray[400]};

    svg {
      width: 48px;
      height: 48px;
    }
  }
`;

const MediaInfo = styled.div`
  padding: ${spacing[4]};

  .filename {
    font-size: ${typography.fontSize.sm};
    font-weight: ${typography.fontWeight.medium};
    color: ${colors.gray[900]};
    margin: 0 0 ${spacing[2]} 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta {
    font-size: ${typography.fontSize.xs};
    color: ${colors.gray[500]};
    display: flex;
    gap: ${spacing[2]};

    span {
      &:not(:last-child)::after {
        content: '•';
        margin-left: ${spacing[2]};
      }
    }
  }
`;

const MediaActions = styled.div`
  display: flex;
  gap: ${spacing[2]};
  padding: 0 ${spacing[4]} ${spacing[4]};
  opacity: 0;
  transition: opacity ${animations.duration.fast} ${animations.easing.out};

  button {
    flex: 1;
    padding: ${spacing[2]};
    background: ${colors.white};
    border: 1px solid ${colors.gray[200]};
    border-radius: ${borders.radius.md};
    font-size: ${typography.fontSize.xs};
    font-weight: ${typography.fontWeight.medium};
    color: ${colors.gray[700]};
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: ${spacing[1.5]};
    transition: all ${animations.duration.fast} ${animations.easing.out};
    font-family: ${typography.fontFamily.sans};

    &:hover {
      background: ${colors.gray[50]};
      border-color: ${colors.gray[300]};
    }

    &.delete:hover {
      background: #fef2f2;
      border-color: #fecaca;
      color: #dc2626;
    }

    svg {
      width: 14px;
      height: 14px;
    }
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${spacing[16]} ${spacing[8]};
  background: ${colors.white};
  border: 2px dashed ${colors.gray[300]};
  border-radius: ${borders.radius.xl};

  .empty-icon {
    width: 80px;
    height: 80px;
    margin: 0 auto ${spacing[6]};
    border-radius: ${borders.radius.full};
    background: ${colors.gray[100]};
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${colors.gray[400]};

    svg {
      width: 40px;
      height: 40px;
    }
  }

  h3 {
    font-size: ${typography.fontSize.xl};
    font-weight: ${typography.fontWeight.semibold};
    margin: 0 0 ${spacing[2]} 0;
    color: ${colors.gray[900]};
  }

  p {
    color: ${colors.gray[600]};
    margin: 0;
    font-size: ${typography.fontSize.sm};
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${spacing[16]};

  svg {
    animation: ${spin} 1s linear infinite;
    color: ${colors.accent[500]};
    margin-bottom: ${spacing[4]};
  }

  p {
    color: ${colors.gray[600]};
    font-size: ${typography.fontSize.sm};
  }
`;

// ============================================
// COMPONENT
// ============================================

export const Media = () => {
  const { user } = useAuth();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [media, setMedia] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<MediaType>('all');
  const [isDragging, setIsDragging] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadMedia();
    const timeout = setTimeout(() => setLoading(false), 10000);
    return () => clearTimeout(timeout);
  }, []);

  const loadMedia = async () => {
    try {
      setLoading(true);
      const { data, error } = await Promise.race([
        supabase.from('media').select('*').order('created_at', { ascending: false }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Request timeout')), 8000)),
      ]);

      if (error) throw error;

      // Generate public URLs for each file
      const filesWithUrls = (data || []).map((file: any) => {
        const { data: { publicUrl } } = supabase.storage
          .from(file.bucket_name || 'media')
          .getPublicUrl(file.storage_path);
        return { ...file, url: publicUrl };
      });

      setMedia(filesWithUrls);
    } catch (error: any) {
      console.error('Error loading media:', error);
      toast.error('Failed to load media files');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    uploadFiles(Array.from(files));
  };

  const uploadFiles = async (files: File[]) => {
    if (!user) {
      toast.error('You must be logged in to upload files');
      return;
    }

    setUploading(true);
    setUploadProgress({ done: 0, total: files.length });

    let successCount = 0;
    let failCount = 0;

    for (const file of files) {
      try {
        // Generate unique filename
        const fileExt = file.name.split('.').pop();
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
        const storagePath = `${user.id}/${uniqueName}`;

        // 1. Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(storagePath, file, { contentType: file.type });

        if (uploadError) throw uploadError;

        // 2. Save metadata to database
        const { error: dbError } = await supabase
          .from('media')
          .insert({
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

        if (dbError) {
          // Clean up storage on DB failure
          await supabase.storage.from('media').remove([storagePath]);
          throw dbError;
        }

        successCount++;
      } catch (error: any) {
        console.error(`Error uploading "${file.name}":`, error);
        failCount++;
      }

      setUploadProgress({ done: successCount + failCount, total: files.length });
    }

    if (successCount > 0) {
      toast.success(`Uploaded ${successCount} file(s)${failCount > 0 ? `, ${failCount} failed` : ''}`);
      loadMedia();
    } else {
      toast.error(`All ${failCount} upload(s) failed`);
    }

    setUploading(false);
    setUploadProgress(null);
  };

  const handleDelete = async (id: string, filename: string) => {
    if (!confirm(`Delete "${filename}"? This cannot be undone.`)) return;

    try {
      // Get file info for storage cleanup
      const fileToDelete = media.find(m => m.id === id);

      // Delete from storage first
      if (fileToDelete?.storage_path) {
        await supabase.storage
          .from(fileToDelete.bucket_name || 'media')
          .remove([fileToDelete.storage_path]);
      }

      // Delete from database
      const { error } = await supabase
        .from('media')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setMedia(prev => prev.filter(m => m.id !== id));
      toast.success('File deleted successfully');
    } catch (error: any) {
      console.error('Error deleting file:', error);
      toast.error('Failed to delete file');
    }
  };

  const handleCopy = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      toast.success('URL copied to clipboard');
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      toast.error('Failed to copy URL');
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  }, []);

  const filteredMedia = media.filter(item => {
    const displayName = item.original_name || item.filename;
    const matchesSearch = displayName.toLowerCase().includes(searchTerm.toLowerCase());

    if (filterType === 'all') return matchesSearch;

    const type = item.mime_type.split('/')[0];
    if (filterType === 'image') return matchesSearch && type === 'image';
    if (filterType === 'video') return matchesSearch && type === 'video';
    if (filterType === 'audio') return matchesSearch && type === 'audio';
    if (filterType === 'document') return matchesSearch && !['image', 'video', 'audio'].includes(type);

    return matchesSearch;
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (mimeType: string) => {
    const type = mimeType.split('/')[0];
    if (type === 'image') return <ImageIcon />;
    if (type === 'video') return <FileVideo />;
    if (type === 'audio') return <FileAudio />;
    return <File />;
  };

  const isImage = (mimeType: string) => mimeType.startsWith('image/');

  if (loading) {
    return (
      <Container>
        <LoadingContainer>
          <Loader size={40} />
          <p>Loading media library...</p>
        </LoadingContainer>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <h1>Media Library</h1>
        <p>Upload and manage images, videos, and files</p>
      </Header>

      <DropZone
        $isDragging={isDragging}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="drop-icon">
          {uploading ? <Loader className="spin" /> : <Upload />}
        </div>
        <h3>{uploading && uploadProgress
          ? `Uploading ${uploadProgress.done}/${uploadProgress.total}...`
          : uploading ? 'Uploading...' : 'Drop files to upload'}</h3>
        <p>
          {uploading
            ? 'Please wait while your files are being uploaded'
            : <>or <strong>browse</strong> from your computer</>}
        </p>
        <p className="supported">
          Supports: Images (JPG, PNG, GIF, WebP), Videos (MP4, WebM), Documents (PDF) — Max 50MB
        </p>
      </DropZone>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,.pdf"
        onChange={(e) => handleFileSelect(e.target.files)}
        style={{ display: 'none' }}
      />

      <Controls>
        <SearchBox>
          <Search size={18} />
          <input
            type="text"
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </SearchBox>

        <FilterButtons>
          <FilterButton $active={filterType === 'all'} onClick={() => setFilterType('all')}>
            All Files
          </FilterButton>
          <FilterButton $active={filterType === 'image'} onClick={() => setFilterType('image')}>
            <ImageIcon size={16} />
            Images
          </FilterButton>
          <FilterButton $active={filterType === 'video'} onClick={() => setFilterType('video')}>
            <FileVideo size={16} />
            Videos
          </FilterButton>
          <FilterButton $active={filterType === 'document'} onClick={() => setFilterType('document')}>
            <File size={16} />
            Documents
          </FilterButton>
        </FilterButtons>
      </Controls>

      {filteredMedia.length === 0 ? (
        <EmptyState>
          <div className="empty-icon">
            <ImageIcon />
          </div>
          <h3>{searchTerm ? 'No files found' : 'No media files yet'}</h3>
          <p>
            {searchTerm
              ? 'Try adjusting your search or filters'
              : 'Upload your first file using the drop zone above'}
          </p>
        </EmptyState>
      ) : (
        <Grid>
          {filteredMedia.map((item) => (
            <MediaCard key={item.id}>
              <MediaPreview>
                {isImage(item.mime_type) ? (
                  <img src={item.url} alt={item.filename} />
                ) : (
                  <div className="icon-placeholder">
                    {getFileIcon(item.mime_type)}
                  </div>
                )}
              </MediaPreview>

              <MediaInfo>
                <p className="filename" title={item.original_name || item.filename}>
                  {item.original_name || item.filename}
                </p>
                <div className="meta">
                  <span>{formatFileSize(item.size_bytes)}</span>
                  <span>{new Date(item.created_at).toLocaleDateString()}</span>
                </div>
              </MediaInfo>

              <MediaActions className="actions">
                <button onClick={() => handleCopy(item.url, item.id)}>
                  {copiedId === item.id ? <Check /> : <Copy />}
                  {copiedId === item.id ? 'Copied' : 'Copy'}
                </button>
                <button className="delete" onClick={() => handleDelete(item.id, item.original_name || item.filename)}>
                  <Trash2 />
                  Delete
                </button>
              </MediaActions>
            </MediaCard>
          ))}
        </Grid>
      )}
    </Container>
  );
};
