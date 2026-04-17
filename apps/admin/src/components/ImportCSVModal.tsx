/**
 * ImportCSVModal
 * Upload a CSV and create one entry per row. The CSV must include a header
 * row; `title`, `slug`, `status`, `created_at` are mapped to top-level entry
 * fields, everything else goes into `content`. Rows are imported in chunks of
 * 5 parallel requests to balance progress feedback against rate limits.
 */

import { useState, useRef } from 'react';
import styled, { keyframes } from 'styled-components';
import { Upload, X, FileText, CheckCircle2, AlertCircle, Loader } from 'lucide-react';
import { api } from '../lib/api';
import { colors, spacing, typography, borders, shadows, animations } from '../shared/styles/design-tokens';

// ── Styles ──

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const slideUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
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

const Modal = styled.div`
  width: 100%;
  max-width: 640px;
  max-height: 90vh;
  background: ${colors.white};
  border-radius: ${borders.radius.xl};
  box-shadow: ${shadows.xl};
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: ${slideUp} ${animations.duration.normal} ${animations.easing.out};
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${spacing[5]} ${spacing[6]};
  border-bottom: 1px solid ${colors.gray[200]};

  h2 {
    margin: 0;
    font-size: ${typography.fontSize.lg};
    font-weight: ${typography.fontWeight.semibold};
    color: ${colors.gray[900]};
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${colors.gray[500]};
  cursor: pointer;
  padding: ${spacing[1]};
  border-radius: ${borders.radius.sm};
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: ${colors.gray[900]};
    background: ${colors.gray[100]};
  }
`;

const Body = styled.div`
  padding: ${spacing[6]};
  overflow-y: auto;
  flex: 1;
`;

const Dropzone = styled.label<{ $dragging: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${spacing[3]};
  padding: ${spacing[8]};
  background: ${props => (props.$dragging ? colors.gray[100] : colors.gray[50])};
  border: 2px dashed ${props => (props.$dragging ? colors.gray[900] : colors.gray[300])};
  border-radius: ${borders.radius.lg};
  color: ${colors.gray[600]};
  cursor: pointer;
  transition: all ${animations.duration.fast} ${animations.easing.out};
  text-align: center;

  &:hover {
    border-color: ${colors.gray[400]};
  }

  input[type='file'] {
    display: none;
  }

  .hint {
    font-size: ${typography.fontSize.sm};
  }

  .sub {
    font-size: ${typography.fontSize.xs};
    color: ${colors.gray[500]};
  }
`;

const FileCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${spacing[3]};
  padding: ${spacing[4]};
  background: ${colors.gray[50]};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.md};

  .meta {
    display: flex;
    flex-direction: column;
    gap: ${spacing[1]};
  }
  .filename {
    font-size: ${typography.fontSize.sm};
    font-weight: ${typography.fontWeight.medium};
    color: ${colors.gray[900]};
  }
  .count {
    font-size: ${typography.fontSize.xs};
    color: ${colors.gray[600]};
  }
`;

const PreviewTable = styled.div`
  margin-top: ${spacing[4]};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.md};
  overflow: auto;
  max-height: 260px;
  max-width: 100%;

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: ${typography.fontSize.xs};
  }
  th, td {
    padding: ${spacing[2]} ${spacing[3]};
    text-align: left;
    border-bottom: 1px solid ${colors.gray[200]};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
  }
  th {
    background: ${colors.gray[50]};
    font-weight: ${typography.fontWeight.semibold};
    color: ${colors.gray[700]};
    position: sticky;
    top: 0;
  }
`;

const Notice = styled.div<{ $kind?: 'info' | 'warning' | 'error' }>`
  padding: ${spacing[3]} ${spacing[4]};
  background: ${props =>
    props.$kind === 'error' ? '#fef2f2'
    : props.$kind === 'warning' ? '#fffbeb'
    : '#ecfeff'};
  border: 1px solid ${props =>
    props.$kind === 'error' ? '#fecaca'
    : props.$kind === 'warning' ? '#fde68a'
    : '#a5f3fc'};
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.sm};
  color: ${props =>
    props.$kind === 'error' ? '#991b1b'
    : props.$kind === 'warning' ? '#92400e'
    : '#155e75'};
  margin-top: ${spacing[4]};
`;

const ProgressBar = styled.div<{ $percent: number }>`
  height: 8px;
  background: ${colors.gray[200]};
  border-radius: 999px;
  overflow: hidden;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: ${props => props.$percent}%;
    background: ${colors.gray[900]};
    transition: width 0.2s ease-out;
  }
`;

const Footer = styled.footer`
  display: flex;
  justify-content: flex-end;
  gap: ${spacing[3]};
  padding: ${spacing[4]} ${spacing[6]};
  border-top: 1px solid ${colors.gray[200]};
  background: ${colors.gray[50]};
`;

const Button = styled.button<{ $primary?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: ${spacing[2]};
  padding: ${spacing[3]} ${spacing[5]};
  background: ${props => (props.$primary ? colors.gray[900] : colors.white)};
  color: ${props => (props.$primary ? colors.white : colors.gray[800])};
  border: 1px solid ${props => (props.$primary ? colors.gray[900] : colors.gray[300])};
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.medium};
  font-family: ${typography.fontFamily.sans};
  cursor: pointer;
  transition: all ${animations.duration.fast} ${animations.easing.out};

  &:hover:not(:disabled) {
    opacity: 0.9;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  svg.spin {
    animation: ${spin} 0.8s linear infinite;
  }
`;

// ── CSV parser ──

interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

function parseCsv(text: string): ParsedCsv {
  // Strip UTF-8 BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        current.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        // Handle \r\n
        if (c === '\r' && next === '\n') i++;
        current.push(field);
        if (current.length > 1 || current[0] !== '') rows.push(current);
        current = [];
        field = '';
      } else {
        field += c;
      }
    }
  }

  // Last field/row (no trailing newline)
  if (field !== '' || current.length > 0) {
    current.push(field);
    if (current.length > 1 || current[0] !== '') rows.push(current);
  }

  if (rows.length === 0) return { headers: [], rows: [] };

  const [headerRow, ...dataRows] = rows;
  return {
    headers: headerRow.map(h => h.trim()),
    rows: dataRows,
  };
}

// ── Entry mapping ──

const TOP_LEVEL_FIELDS = new Set(['title', 'slug', 'status', 'created_at']);

function rowToEntry(headers: string[], row: string[]): Record<string, any> {
  const top: Record<string, any> = {};
  const content: Record<string, any> = {};

  headers.forEach((h, i) => {
    const value = row[i] ?? '';
    if (!h) return;
    if (TOP_LEVEL_FIELDS.has(h)) {
      top[h] = value;
    } else {
      content[h] = value;
    }
  });

  if (!top.title) {
    top.title = content.name || content.code || `Imported row ${Date.now().toString(36)}`;
  }
  if (!top.status) top.status = 'published';
  top.content = content;

  return top;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || `row-${Date.now().toString(36)}`;
}

// ── Component ──

interface ImportCSVModalProps {
  collectionSlug: string;
  collectionName: string;
  onClose: () => void;
  onImported: (ok: number, failed: number) => void;
}

interface ImportResult {
  total: number;
  ok: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
}

export function ImportCSVModal({ collectionSlug, collectionName, onClose, onImported }: ImportCSVModalProps) {
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [filename, setFilename] = useState('');
  const [dragging, setDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setParseError(null);
    setResult(null);
    try {
      const text = await file.text();
      const p = parseCsv(text);
      if (p.headers.length === 0) {
        setParseError('CSV is empty or missing a header row.');
        return;
      }
      if (p.rows.length === 0) {
        setParseError('CSV has a header row but no data rows.');
        return;
      }
      setParsed(p);
      setFilename(file.name);
    } catch (err: any) {
      setParseError('Could not parse file: ' + (err.message || 'unknown error'));
    }
  };

  const handleImport = async () => {
    if (!parsed) return;
    setImporting(true);
    setProgress(0);

    const total = parsed.rows.length;
    const errors: Array<{ row: number; reason: string }> = [];
    let ok = 0;

    const CHUNK = 5;
    for (let i = 0; i < parsed.rows.length; i += CHUNK) {
      const chunk = parsed.rows.slice(i, i + CHUNK);
      const results = await Promise.all(
        chunk.map(async (row, idx) => {
          const rowIndex = i + idx + 2; // +2 because 1-indexed and header row
          try {
            const entry = rowToEntry(parsed.headers, row);
            if (!entry.slug) entry.slug = slugify(entry.title);
            const { error } = await api.createEntry(collectionSlug, entry);
            if (error) return { ok: false, rowIndex, reason: error };
            return { ok: true, rowIndex };
          } catch (err: any) {
            return { ok: false, rowIndex, reason: err.message || 'unknown error' };
          }
        })
      );
      for (const r of results) {
        if (r.ok) ok++;
        else errors.push({ row: r.rowIndex, reason: r.reason || 'unknown' });
      }
      setProgress(Math.round(((i + chunk.length) / total) * 100));
    }

    const failed = total - ok;
    setResult({ total, ok, failed, errors });
    setImporting(false);
    if (ok > 0) onImported(ok, failed);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const reset = () => {
    setParsed(null);
    setFilename('');
    setResult(null);
    setProgress(0);
    if (inputRef.current) inputRef.current.value = '';
  };

  const preview = parsed ? parsed.rows.slice(0, 5) : [];

  return (
    <Overlay onClick={onClose}>
      <Modal onClick={e => e.stopPropagation()}>
        <Header>
          <h2>Import CSV — {collectionName}</h2>
          <CloseButton onClick={onClose} aria-label="Close">
            <X size={20} />
          </CloseButton>
        </Header>

        <Body>
          {!parsed && !result && (
            <>
              <Dropzone
                $dragging={dragging}
                onDragEnter={() => setDragging(true)}
                onDragLeave={() => setDragging(false)}
                onDragOver={e => e.preventDefault()}
                onDrop={onDrop}
              >
                <Upload size={32} color={colors.gray[400]} />
                <div>
                  <div className="hint"><strong>Click to choose</strong> or drop a CSV file here</div>
                  <div className="sub">First row must contain column headers (title, slug, status, or custom content fields)</div>
                </div>
                <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={onInputChange} />
              </Dropzone>
              <Notice $kind="info" style={{ marginTop: spacing[4] }}>
                <strong>Column mapping:</strong> <code>title</code>, <code>slug</code>, <code>status</code>, <code>created_at</code> are stored as top-level entry fields. All other columns go into <code>content</code>. Missing <code>title</code> or <code>slug</code> will be auto-generated.
              </Notice>
            </>
          )}

          {parsed && !result && (
            <>
              <FileCard>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
                  <FileText size={22} color={colors.gray[600]} />
                  <div className="meta">
                    <div className="filename">{filename}</div>
                    <div className="count">
                      {parsed.rows.length} row{parsed.rows.length === 1 ? '' : 's'} • {parsed.headers.length} columns
                    </div>
                  </div>
                </div>
                {!importing && (
                  <Button onClick={reset}>Change file</Button>
                )}
              </FileCard>

              <PreviewTable>
                <table>
                  <thead>
                    <tr>
                      {parsed.headers.map((h, i) => (
                        <th key={i}>{h || <em style={{ color: colors.gray[400] }}>(unnamed)</em>}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i}>
                        {parsed.headers.map((_, j) => (
                          <td key={j} title={row[j]}>{row[j]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </PreviewTable>

              {parsed.rows.length > 5 && (
                <div style={{ fontSize: typography.fontSize.xs, color: colors.gray[500], marginTop: spacing[2] }}>
                  Showing first 5 of {parsed.rows.length} rows.
                </div>
              )}

              {parsed.rows.length > 80 && (
                <Notice $kind="warning">
                  Large import — the API rate limit is 100 requests per 15 min. Imports above ~80 rows may be partially throttled. Split the file or wait if you hit errors.
                </Notice>
              )}

              {importing && (
                <div style={{ marginTop: spacing[4] }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: typography.fontSize.sm, color: colors.gray[700], marginBottom: spacing[2] }}>
                    <span>Importing…</span>
                    <span>{progress}%</span>
                  </div>
                  <ProgressBar $percent={progress} />
                </div>
              )}
            </>
          )}

          {parseError && <Notice $kind="error">{parseError}</Notice>}

          {result && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3], marginBottom: spacing[4] }}>
                {result.failed === 0 ? (
                  <CheckCircle2 size={28} color="#059669" />
                ) : (
                  <AlertCircle size={28} color="#d97706" />
                )}
                <div>
                  <div style={{ fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, color: colors.gray[900] }}>
                    {result.ok} of {result.total} row{result.total === 1 ? '' : 's'} imported
                  </div>
                  {result.failed > 0 && (
                    <div style={{ fontSize: typography.fontSize.sm, color: colors.gray[600] }}>
                      {result.failed} failed
                    </div>
                  )}
                </div>
              </div>

              {result.errors.length > 0 && (
                <Notice $kind="error">
                  <div style={{ fontWeight: typography.fontWeight.semibold, marginBottom: spacing[2] }}>Errors</div>
                  <ul style={{ margin: 0, paddingLeft: spacing[5], maxHeight: '160px', overflow: 'auto' }}>
                    {result.errors.slice(0, 20).map((e, i) => (
                      <li key={i} style={{ fontSize: typography.fontSize.xs }}>
                        Row {e.row}: {e.reason}
                      </li>
                    ))}
                    {result.errors.length > 20 && (
                      <li style={{ fontSize: typography.fontSize.xs, color: colors.gray[600] }}>
                        …and {result.errors.length - 20} more.
                      </li>
                    )}
                  </ul>
                </Notice>
              )}
            </>
          )}
        </Body>

        <Footer>
          {result ? (
            <>
              <Button onClick={reset}>Import another</Button>
              <Button $primary onClick={onClose}>Done</Button>
            </>
          ) : (
            <>
              <Button onClick={onClose} disabled={importing}>Cancel</Button>
              <Button
                $primary
                onClick={handleImport}
                disabled={!parsed || importing}
              >
                {importing ? (
                  <><Loader size={16} className="spin" /> Importing…</>
                ) : (
                  <><Upload size={16} /> Import {parsed ? `${parsed.rows.length} row${parsed.rows.length === 1 ? '' : 's'}` : ''}</>
                )}
              </Button>
            </>
          )}
        </Footer>
      </Modal>
    </Overlay>
  );
}
