/**
 * Notas do site — feedback the client pinned on the live site with
 * "Editar no site" → Nota. Open the site at the right page (the pin shows
 * where), or mark a note done. Entries live in the private `site-notes`
 * collection; this page is just a friendlier view of it.
 */

import { useState, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { StickyNote, ExternalLink, Check, RotateCcw, RefreshCw, MapPin } from 'lucide-react';
import { colors, spacing, typography, borders } from '../shared/styles/design-tokens';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { useAuth } from '../features/auth/hooks/useAuth';

interface NoteEntry {
  id: string;
  slug: string;
  title: string;
  created_at?: string;
  content: {
    text?: string; page?: string; status?: string; anchor_text?: string; by?: string;
    selector?: string; x?: number; y?: number; done_by?: string | null; done_at?: string | null;
  };
}

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Container = styled.div`
  max-width: 1000px;
  animation: ${fadeIn} 0.4s ease-out;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${spacing[4]};
  margin-bottom: ${spacing[6]};
  h1 { font-size: ${typography.fontSize['3xl']}; font-weight: ${typography.fontWeight.bold}; margin: 0 0 ${spacing[1]}; color: ${colors.gray[900]}; }
  p { font-size: ${typography.fontSize.sm}; color: ${colors.gray[500]}; margin: 0; }
`;

const Actions = styled.div`
  display: flex;
  gap: ${spacing[2]};
  flex-wrap: wrap;
`;

const Btn = styled.button<{ $variant?: 'primary' | 'ghost' }>`
  display: inline-flex;
  align-items: center;
  gap: ${spacing[2]};
  padding: ${spacing[2]} ${spacing[3]};
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.sm};
  font-weight: 500;
  cursor: pointer;
  font-family: ${typography.fontFamily.sans};
  border: 1px solid ${p => p.$variant === 'primary' ? colors.gray[900] : colors.gray[200]};
  background: ${p => p.$variant === 'primary' ? colors.gray[900] : colors.white};
  color: ${p => p.$variant === 'primary' ? colors.white : colors.gray[700]};
  transition: all 0.15s;
  svg { width: 16px; height: 16px; }
  &:hover { background: ${p => p.$variant === 'primary' ? colors.gray[800] : colors.gray[50]}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &.is-on { background: ${colors.gray[100]}; }
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[3]};
`;

const Card = styled.article<{ $done?: boolean }>`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-left: 4px solid ${p => p.$done ? colors.gray[300] : colors.yellow[400]};
  border-radius: ${borders.radius.lg};
  padding: ${spacing[4]} ${spacing[5]};
  display: grid;
  grid-template-columns: 1fr auto;
  gap: ${spacing[3]} ${spacing[4]};
  align-items: start;
  opacity: ${p => p.$done ? 0.7 : 1};
`;

const NoteText = styled.p`
  margin: 0 0 ${spacing[2]};
  font-size: ${typography.fontSize.base};
  color: ${colors.gray[900]};
  white-space: pre-wrap;
`;

const Meta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${spacing[1]} ${spacing[4]};
  font-size: ${typography.fontSize.xs};
  color: ${colors.gray[500]};
  span { display: inline-flex; align-items: center; gap: 4px; }
  code { font-family: ${typography.fontFamily.mono}; background: ${colors.gray[100]}; padding: 1px 6px; border-radius: 4px; color: ${colors.gray[700]}; }
`;

const Empty = styled.div`
  text-align: center;
  padding: ${spacing[12]} ${spacing[4]};
  color: ${colors.gray[500]};
  background: ${colors.white};
  border: 1px dashed ${colors.gray[300]};
  border-radius: ${borders.radius.lg};
  svg { width: 36px; height: 36px; color: ${colors.gray[300]}; margin-bottom: ${spacing[3]}; }
  p { margin: 0; font-size: ${typography.fontSize.sm}; max-width: 480px; margin: 0 auto; }
`;

function when(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
}

export function SiteNotes() {
  const toast = useToast();
  const { user } = useAuth();
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await api.getEntries('site-notes', { limit: '200' }); // newest first (API default)
    if (error && !/collection not found/i.test(error)) toast.error(error);
    setNotes(((data || []) as NoteEntry[]));
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const visible = notes.filter(n => showDone ? true : (n.content?.status || 'open') !== 'done');
  const openCount = notes.filter(n => (n.content?.status || 'open') !== 'done').length;

  const openOnSite = async (n: NoteEntry) => {
    const path = n.content?.page || '/';
    const win = window.open('about:blank', '_blank'); // synchronously, so the browser does not block the tab
    const { data, error } = await api.createInlineEditSession(path);
    if (error || !data?.edit_url) { win?.close(); toast.error(error || 'Não foi possível abrir o editor'); return; }
    if (win) win.location.href = data.edit_url; else window.open(data.edit_url, '_blank');
  };

  const setStatus = async (n: NoteEntry, status: 'open' | 'done') => {
    setBusy(n.id);
    const now = new Date().toISOString();
    const content = {
      ...n.content, status,
      ...(status === 'done' ? { done_by: user?.email || null, done_at: now } : { done_by: null, done_at: null }),
    };
    const { error } = await api.updateEntry('site-notes', n.slug, { content });
    setBusy(null);
    if (error) { toast.error(error); return; }
    setNotes(prev => prev.map(x => x.id === n.id ? { ...x, content } : x));
    toast.success(status === 'done' ? 'Nota concluída' : 'Nota reaberta');
  };

  return (
    <Container>
      <Header>
        <div>
          <h1>Notas do site</h1>
          <p>Pedidos deixados no próprio site com "Editar no site" → Nota. {openCount ? `${openCount} por resolver.` : 'Nada por resolver.'}</p>
        </div>
        <Actions>
          <Btn className={showDone ? 'is-on' : ''} onClick={() => setShowDone(v => !v)}>{showDone ? 'Esconder concluídas' : 'Mostrar concluídas'}</Btn>
          <Btn onClick={load} disabled={loading}><RefreshCw /> Atualizar</Btn>
        </Actions>
      </Header>

      {!loading && visible.length === 0 && (
        <Empty>
          <StickyNote />
          <p>Ainda não há notas. No site, com "Editar no site" aberto, carregue em <strong>Nota</strong>, clique no sítio a mudar e escreva o pedido: aparece aqui e chega por email.</p>
        </Empty>
      )}

      <List>
        {visible.map(n => {
          const done = (n.content?.status || 'open') === 'done';
          return (
            <Card key={n.id} $done={done}>
              <div>
                <NoteText>{n.content?.text || n.title}</NoteText>
                <Meta>
                  <span><MapPin size={12} /> <code>{n.content?.page || '/'}</code></span>
                  {n.content?.anchor_text && <span>junto a «{n.content.anchor_text.length > 60 ? n.content.anchor_text.slice(0, 59) + '…' : n.content.anchor_text}»</span>}
                  {n.content?.by && <span>{n.content.by}</span>}
                  {n.created_at && <span>{when(n.created_at)}</span>}
                  {done && n.content?.done_at && <span>concluída {when(n.content.done_at)}{n.content.done_by ? ` por ${n.content.done_by}` : ''}</span>}
                </Meta>
              </div>
              <Actions>
                <Btn onClick={() => openOnSite(n)} title="Abre o site nesta página com o editor; o pin mostra o sítio"><ExternalLink /> Abrir no site</Btn>
                {done
                  ? <Btn onClick={() => setStatus(n, 'open')} disabled={busy === n.id}><RotateCcw /> Reabrir</Btn>
                  : <Btn $variant="primary" onClick={() => setStatus(n, 'done')} disabled={busy === n.id}><Check /> Concluída</Btn>}
              </Actions>
            </Card>
          );
        })}
      </List>
    </Container>
  );
}

export default SiteNotes;
