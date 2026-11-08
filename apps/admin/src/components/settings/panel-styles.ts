import styled from 'styled-components';
import { colors, spacing, typography, borders } from '../../shared/styles/design-tokens';

export type Tone = 'ok' | 'warn' | 'error' | 'info';

export const TONE = {
  ok: { fg: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  warn: { fg: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  error: { fg: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
  info: { fg: colors.gray[600], bg: colors.gray[50], border: colors.gray[200] },
} as const;

export const Panel = styled.div`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  padding: ${spacing[6]};
  margin-bottom: ${spacing[5]};
  font-family: ${typography.fontFamily.sans};
`;

export const PanelHeader = styled.div`
  display: flex; align-items: flex-start; justify-content: space-between; gap: ${spacing[4]};
  margin-bottom: ${spacing[5]}; padding-bottom: ${spacing[4]};
  border-bottom: 1px solid ${colors.gray[100]};
  h2 { font-size: ${typography.fontSize.base}; font-weight: 600; margin: 0; }
  p { font-size: ${typography.fontSize.sm}; color: ${colors.gray[500]}; margin: ${spacing[1]} 0 0; }
  @media (max-width: 640px) { flex-direction: column; }
`;

export const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: ${spacing[2]} ${spacing[4]};
  border-radius: ${borders.radius.lg};
  font-size: ${typography.fontSize.sm}; font-weight: 600;
  font-family: ${typography.fontFamily.sans};
  display: inline-flex; align-items: center; gap: ${spacing[2]};
  cursor: pointer; white-space: nowrap;
  ${p => p.$variant === 'secondary'
    ? `background: ${colors.white}; color: ${colors.gray[700]}; border: 1px solid ${colors.gray[300]};
       &:hover:not(:disabled) { background: ${colors.gray[50]}; }`
    : `background: ${colors.accent[500]}; color: #fff; border: 1px solid ${colors.accent[500]};
       &:hover:not(:disabled) { background: ${colors.accent[600]}; }`}
  &:disabled { opacity: 0.6; cursor: not-allowed; }
  svg { width: 16px; height: 16px; }
`;

export const Banner = styled.div<{ $tone: Tone }>`
  display: flex; gap: ${spacing[3]}; align-items: flex-start;
  padding: ${spacing[3]} ${spacing[4]};
  border-radius: ${borders.radius.lg};
  font-size: ${typography.fontSize.sm};
  color: ${p => TONE[p.$tone].fg};
  background: ${p => TONE[p.$tone].bg};
  border: 1px solid ${p => TONE[p.$tone].border};
  svg { flex-shrink: 0; width: 18px; height: 18px; margin-top: 1px; }
`;

export const CodeBlock = styled.pre`
  margin: 0; padding: ${spacing[4]};
  background: ${colors.gray[900]}; color: #e5e7eb;
  border-radius: ${borders.radius.lg};
  font-family: ${typography.fontFamily.mono}; font-size: 13px; line-height: 1.6;
  overflow-x: auto; white-space: pre;
`;

export const Step = styled.section`
  display: grid; grid-template-columns: 32px 1fr; gap: ${spacing[4]};
  padding: ${spacing[5]} 0;
  border-top: 1px solid ${colors.gray[100]};
  &:first-of-type { border-top: none; padding-top: 0; }
  .num {
    width: 32px; height: 32px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: ${typography.fontSize.sm}; font-weight: 700;
    background: ${colors.accent[50] || colors.gray[100]}; color: ${colors.accent[600]};
  }
  .num.done { background: #dcfce7; color: #166534; }
  h3 { font-size: ${typography.fontSize.sm}; font-weight: 600; margin: 4px 0 ${spacing[2]}; }
  p, li { font-size: ${typography.fontSize.sm}; color: ${colors.gray[600]}; line-height: 1.55; }
  p { margin: 0 0 ${spacing[3]}; }
  ol { margin: 0 0 ${spacing[3]}; padding-left: 1.2em; }
  input, select {
    padding: ${spacing[2]} ${spacing[3]};
    border: 1px solid ${colors.gray[300]}; border-radius: ${borders.radius.md};
    font-size: ${typography.fontSize.sm}; font-family: ${typography.fontFamily.sans};
    &:focus { outline: none; border-color: ${colors.accent[500]}; box-shadow: 0 0 0 3px ${colors.accent[100]}; }
  }
`;

export const Row = styled.div`
  display: flex; flex-wrap: wrap; gap: ${spacing[2]}; align-items: center;
  margin-bottom: ${spacing[3]};
  input { flex: 1; min-width: 220px; }
`;
