import styled, { keyframes } from 'styled-components';
import { colors } from '../shared/styles/design-tokens';

const spin = keyframes`to { transform: rotate(360deg); }`;

const SpinnerSvg = styled.svg<{ $size?: number }>`
  width: ${p => p.$size || 24}px;
  height: ${p => p.$size || 24}px;
  animation: ${spin} 0.8s linear infinite;
  color: ${colors.accent[500]};
`;

export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <SpinnerSvg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" $size={size}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </SpinnerSvg>
  );
}
