/**
 * Live Preview Panel
 * Shows a real-time preview of the content being edited.
 * Uses postMessage to send data to the preview iframe.
 *
 * Frontend integration: the preview page listens for messages
 * and renders the content accordingly.
 *
 * window.addEventListener('message', (e) => {
 *   if (e.data.type === 'kiban-preview') {
 *     renderContent(e.data.entry);
 *   }
 * });
 */

import { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { colors, spacing, typography, borders, shadows } from '../shared/styles/design-tokens';
import {
  Eye, EyeOff, Monitor, Smartphone, Tablet, ExternalLink, RefreshCw, Maximize2, Minimize2,
} from 'lucide-react';

const Panel = styled.div<{ $expanded?: boolean }>`
  position: fixed;
  top: 0; right: 0; bottom: 0;
  width: ${p => p.$expanded ? '60%' : '40%'};
  background: ${colors.white};
  border-left: 1px solid ${colors.gray[200]};
  box-shadow: ${shadows['2xl']};
  z-index: 50;
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;

  @media (max-width: 1200px) {
    width: ${p => p.$expanded ? '70%' : '50%'};
  }
`;

const Toolbar = styled.div`
  padding: ${spacing[3]} ${spacing[4]};
  border-bottom: 1px solid ${colors.gray[200]};
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  background: ${colors.gray[50]};
  flex-shrink: 0;

  .toolbar-left { display: flex; align-items: center; gap: ${spacing[2]}; flex: 1; }
  .toolbar-right { display: flex; align-items: center; gap: ${spacing[2]}; }

  h3 { margin: 0; font-size: ${typography.fontSize.sm}; font-weight: 600; color: ${colors.gray[900]}; }
`;

const DeviceBtn = styled.button<{ $active?: boolean }>`
  padding: ${spacing[1.5]}; background: ${p => p.$active ? colors.accent[50] : 'none'};
  border: 1px solid ${p => p.$active ? colors.accent[300] : 'transparent'};
  border-radius: ${borders.radius.md}; cursor: pointer;
  color: ${p => p.$active ? colors.accent[600] : colors.gray[400]};
  display: flex;
  &:hover { color: ${colors.gray[700]}; }
  svg { width: 18px; height: 18px; }
`;

const IconBtn = styled.button`
  padding: ${spacing[1.5]}; background: none; border: none; cursor: pointer;
  color: ${colors.gray[400]}; border-radius: ${borders.radius.md}; display: flex;
  &:hover { color: ${colors.gray[700]}; background: ${colors.gray[100]}; }
  svg { width: 18px; height: 18px; }
`;

const IframeContainer = styled.div<{ $device: string }>`
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: ${spacing[4]};
  background: ${colors.gray[100]};
  overflow: auto;

  iframe {
    background: ${colors.white};
    border: 1px solid ${colors.gray[300]};
    border-radius: ${borders.radius.lg};
    box-shadow: ${shadows.lg};
    width: ${p => p.$device === 'mobile' ? '375px' : p.$device === 'tablet' ? '768px' : '100%'};
    height: 100%;
    min-height: 600px;
  }
`;

const UrlBar = styled.div`
  padding: ${spacing[2]} ${spacing[4]};
  background: ${colors.white};
  border-bottom: 1px solid ${colors.gray[100]};
  display: flex;
  align-items: center;
  gap: ${spacing[2]};

  input {
    flex: 1;
    padding: ${spacing[2]} ${spacing[3]};
    border: 1px solid ${colors.gray[200]};
    border-radius: ${borders.radius.md};
    font-size: 12px;
    font-family: ${typography.fontFamily.mono};
    color: ${colors.gray[600]};
    background: ${colors.gray[50]};
    &:focus { outline: none; border-color: ${colors.accent[400]}; }
  }
`;

const NoPreview = styled.div`
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: ${spacing[3]}; color: ${colors.gray[400]}; text-align: center; padding: ${spacing[8]};
  svg { width: 48px; height: 48px; }
  h4 { margin: 0; font-size: ${typography.fontSize.base}; color: ${colors.gray[600]}; }
  p { margin: 0; font-size: ${typography.fontSize.sm}; max-width: 300px; }
  code { font-size: 12px; background: ${colors.gray[100]}; padding: ${spacing[1]} ${spacing[2]}; border-radius: ${borders.radius.md}; }
`;

interface LivePreviewProps {
  previewUrl: string;
  entryData: any;
  collectionSlug: string;
  onClose: () => void;
}

export function LivePreview({ previewUrl, entryData, collectionSlug, onClose }: LivePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [expanded, setExpanded] = useState(false);
  const [url, setUrl] = useState(previewUrl);

  // Send data to iframe whenever entry changes
  useEffect(() => {
    if (iframeRef.current?.contentWindow && url) {
      iframeRef.current.contentWindow.postMessage({
        type: 'kiban-preview',
        entry: entryData,
        collection: collectionSlug,
      }, '*');
    }
  }, [entryData, collectionSlug, url]);

  const handleRefresh = () => {
    if (iframeRef.current) {
      iframeRef.current.src = url;
    }
  };

  return (
    <Panel $expanded={expanded}>
      <Toolbar>
        <div className="toolbar-left">
          <Eye size={18} style={{ color: colors.accent[500] }} />
          <h3>Live Preview</h3>
        </div>
        <div className="toolbar-right">
          <DeviceBtn $active={device === 'desktop'} onClick={() => setDevice('desktop')} title="Desktop"><Monitor /></DeviceBtn>
          <DeviceBtn $active={device === 'tablet'} onClick={() => setDevice('tablet')} title="Tablet"><Tablet /></DeviceBtn>
          <DeviceBtn $active={device === 'mobile'} onClick={() => setDevice('mobile')} title="Mobile"><Smartphone /></DeviceBtn>
          <IconBtn onClick={handleRefresh} title="Refresh"><RefreshCw /></IconBtn>
          <IconBtn onClick={() => setExpanded(!expanded)} title={expanded ? 'Shrink' : 'Expand'}>
            {expanded ? <Minimize2 /> : <Maximize2 />}
          </IconBtn>
          <IconBtn onClick={() => url && window.open(url, '_blank')} title="Open in new tab"><ExternalLink /></IconBtn>
          <IconBtn onClick={onClose} title="Close preview"><EyeOff /></IconBtn>
        </div>
      </Toolbar>

      <UrlBar>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleRefresh()}
          placeholder="Enter preview URL..."
        />
      </UrlBar>

      {url ? (
        <IframeContainer $device={device}>
          <iframe
            ref={iframeRef}
            src={url}
            title="Live Preview"
            sandbox="allow-scripts allow-same-origin allow-popups"
            onLoad={() => {
              // Send initial data after iframe loads
              setTimeout(() => {
                iframeRef.current?.contentWindow?.postMessage({
                  type: 'kiban-preview',
                  entry: entryData,
                  collection: collectionSlug,
                }, '*');
              }, 500);
            }}
          />
        </IframeContainer>
      ) : (
        <NoPreview>
          <Eye />
          <h4>No preview URL configured</h4>
          <p>Enter your frontend URL above, or configure it in Site Settings.</p>
          <p>Your frontend should listen for:</p>
          <code>window.addEventListener('message', e =&gt; e.data.type === 'kiban-preview')</code>
        </NoPreview>
      )}
    </Panel>
  );
}
