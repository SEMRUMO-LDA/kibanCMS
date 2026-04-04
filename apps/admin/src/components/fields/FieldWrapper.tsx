/**
 * FieldWrapper
 * Wrapper for all field types.
 * Supports: labels, help text, errors, agency notes, and video tutorials.
 */

import { useState } from 'react';
import styled from 'styled-components';
import { colors, spacing, typography, borders } from '../../shared/styles/design-tokens';
import { AlertCircle, Info, Play, X } from 'lucide-react';

const Wrapper = styled.div`margin-bottom: ${spacing[6]};`;

const Label = styled.label<{ $required?: boolean }>`
  display: block;
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.semibold};
  color: ${colors.gray[900]};
  margin-bottom: ${spacing[2]};
  ${props => props.$required && `&::after { content: '*'; color: ${colors.accent[500]}; margin-left: ${spacing[1]}; }`}
`;

const HelpText = styled.p`
  font-size: ${typography.fontSize.xs};
  color: ${colors.gray[600]};
  margin: ${spacing[1]} 0 ${spacing[2]};
  line-height: ${typography.lineHeight.normal};
`;

const ErrorMessage = styled.div`
  display: flex; align-items: center; gap: ${spacing[2]};
  margin-top: ${spacing[2]}; padding: ${spacing[2]} ${spacing[3]};
  background: ${colors.gray[50]}; border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.md}; font-size: ${typography.fontSize.sm}; color: ${colors.gray[800]};
  svg { color: ${colors.accent[500]}; flex-shrink: 0; }
`;

const AgencyNote = styled.div`
  margin-top: ${spacing[3]};
  padding: ${spacing[3]} ${spacing[4]};
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-left: 3px solid #3b82f6;
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.xs};
  color: #1e40af;
  line-height: 1.5;
  display: flex;
  align-items: flex-start;
  gap: ${spacing[2]};

  svg { flex-shrink: 0; margin-top: 1px; }
  .note-content { flex: 1; }
  .note-label { font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 2px; color: #2563eb; }
`;

const VideoLink = styled.button`
  margin-top: ${spacing[2]};
  padding: ${spacing[2]} ${spacing[3]};
  background: #faf5ff;
  border: 1px solid #e9d5ff;
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.xs};
  color: #7c3aed;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  font-family: ${typography.fontFamily.sans};
  font-weight: 500;
  transition: all 0.15s;
  &:hover { background: #f3e8ff; border-color: #d8b4fe; }
  svg { width: 14px; height: 14px; }
`;

const VideoModal = styled.div`
  position: fixed; inset: 0; background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center;
  z-index: 10000; padding: ${spacing[4]};
`;

const VideoContainer = styled.div`
  width: 100%; max-width: 720px; background: ${colors.white};
  border-radius: ${borders.radius.xl}; overflow: hidden;
  .video-header {
    padding: ${spacing[3]} ${spacing[4]};
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid ${colors.gray[200]};
    h4 { margin: 0; font-size: ${typography.fontSize.sm}; font-weight: 600; }
    button { background: none; border: none; cursor: pointer; color: ${colors.gray[400]}; padding: ${spacing[1]}; &:hover { color: ${colors.gray[700]}; } }
  }
  iframe { width: 100%; aspect-ratio: 16/9; border: none; }
`;

interface FieldWrapperProps {
  label: string;
  name: string;
  required?: boolean;
  helpText?: string;
  error?: string;
  agencyNote?: string;
  agencyVideoUrl?: string;
  agencyVideoTitle?: string;
  children: React.ReactNode;
}

export function FieldWrapper({
  label, name, required, helpText, error,
  agencyNote, agencyVideoUrl, agencyVideoTitle,
  children,
}: FieldWrapperProps) {
  const [showVideo, setShowVideo] = useState(false);

  // Convert Loom/YouTube URLs to embed format
  const getEmbedUrl = (url: string) => {
    if (url.includes('loom.com/share/')) return url.replace('/share/', '/embed/');
    if (url.includes('youtube.com/watch?v=')) return url.replace('watch?v=', 'embed/');
    if (url.includes('youtu.be/')) return 'https://youtube.com/embed/' + url.split('youtu.be/')[1];
    return url;
  };

  return (
    <Wrapper>
      <Label htmlFor={name} $required={required}>{label}</Label>
      {helpText && <HelpText>{helpText}</HelpText>}
      {children}
      {error && <ErrorMessage><AlertCircle size={16} /><span>{error}</span></ErrorMessage>}

      {agencyNote && (
        <AgencyNote>
          <Info size={14} />
          <div className="note-content">
            <div className="note-label">Agency Note</div>
            {agencyNote}
          </div>
        </AgencyNote>
      )}

      {agencyVideoUrl && (
        <>
          <VideoLink onClick={() => setShowVideo(true)}>
            <Play /> {agencyVideoTitle || 'Watch tutorial'}
          </VideoLink>
          {showVideo && (
            <VideoModal onClick={() => setShowVideo(false)}>
              <VideoContainer onClick={e => e.stopPropagation()}>
                <div className="video-header">
                  <h4>{agencyVideoTitle || 'Tutorial'}</h4>
                  <button onClick={() => setShowVideo(false)}><X size={18} /></button>
                </div>
                <iframe src={getEmbedUrl(agencyVideoUrl)} allowFullScreen />
              </VideoContainer>
            </VideoModal>
          )}
        </>
      )}
    </Wrapper>
  );
}
