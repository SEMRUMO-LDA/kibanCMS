/**
 * Toast Notification System
 *
 * Usage:
 * import { useToast } from '../components/Toast'
 * const toast = useToast()
 * toast.success('Entry saved!')
 * toast.error('Failed to save')
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import styled, { keyframes } from 'styled-components';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import { colors, spacing, typography, borders, shadows, animations } from '../shared/styles/design-tokens';

// ============================================
// TYPES
// ============================================

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

// ============================================
// ANIMATIONS
// ============================================

const slideIn = keyframes`
  from {
    transform: translateX(400px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
`;

const slideOut = keyframes`
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(400px);
    opacity: 0;
  }
`;

// ============================================
// STYLED COMPONENTS
// ============================================

const ToastContainer = styled.div`
  position: fixed;
  top: ${spacing[6]};
  right: ${spacing[6]};
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: ${spacing[3]};
  pointer-events: none;

  @media (max-width: 640px) {
    top: ${spacing[4]};
    right: ${spacing[4]};
    left: ${spacing[4]};
  }
`;

const ToastItem = styled.div<{ $type: ToastType; $isExiting?: boolean }>`
  min-width: 320px;
  max-width: 420px;
  background: ${colors.white};
  border-radius: ${borders.radius.lg};
  box-shadow: ${shadows['2xl']};
  padding: ${spacing[4]} ${spacing[5]};
  display: flex;
  align-items: flex-start;
  gap: ${spacing[3]};
  pointer-events: auto;
  animation: ${props => props.$isExiting ? slideOut : slideIn} ${animations.duration.normal} ${animations.easing.out};
  border-left: 4px solid ${props => {
    switch (props.$type) {
      case 'success': return colors.accent[500];
      case 'error': return '#dc2626';
      case 'warning': return '#f59e0b';
      case 'info': return '#3b82f6';
    }
  }};

  @media (max-width: 640px) {
    min-width: 0;
    width: 100%;
  }

  .toast-icon {
    flex-shrink: 0;
    color: ${props => {
      switch (props.$type) {
        case 'success': return colors.accent[500];
        case 'error': return '#dc2626';
        case 'warning': return '#f59e0b';
        case 'info': return '#3b82f6';
      }
    }};
  }

  .toast-content {
    flex: 1;
    min-width: 0;

    p {
      margin: 0;
      font-size: ${typography.fontSize.sm};
      color: ${colors.gray[900]};
      line-height: ${typography.lineHeight.relaxed};
      word-break: break-word;
    }
  }

  .toast-close {
    flex-shrink: 0;
    background: none;
    border: none;
    color: ${colors.gray[400]};
    cursor: pointer;
    padding: ${spacing[1]};
    border-radius: ${borders.radius.sm};
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all ${animations.duration.fast} ${animations.easing.out};

    &:hover {
      background: ${colors.gray[100]};
      color: ${colors.gray[600]};
    }

    &:active {
      transform: scale(0.95);
    }
  }
`;

// ============================================
// CONTEXT
// ============================================

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

// ============================================
// PROVIDER
// ============================================

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((type: ToastType, message: string, duration = 5000) => {
    const id = `${Date.now()}-${Math.random()}`;
    const toast: Toast = { id, type, message, duration };

    setToasts(prev => [...prev, toast]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const value: ToastContextValue = {
    success: (message, duration) => addToast('success', message, duration),
    error: (message, duration) => addToast('error', message, duration),
    warning: (message, duration) => addToast('warning', message, duration),
    info: (message, duration) => addToast('info', message, duration),
  };

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success': return <CheckCircle size={20} />;
      case 'error': return <XCircle size={20} />;
      case 'warning': return <AlertCircle size={20} />;
      case 'info': return <Info size={20} />;
    }
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer>
        {toasts.map(toast => (
          <ToastItem key={toast.id} $type={toast.type}>
            <div className="toast-icon">
              {getIcon(toast.type)}
            </div>
            <div className="toast-content">
              <p>{toast.message}</p>
            </div>
            <button
              className="toast-close"
              onClick={() => removeToast(toast.id)}
              aria-label="Close notification"
            >
              <X size={16} />
            </button>
          </ToastItem>
        ))}
      </ToastContainer>
    </ToastContext.Provider>
  );
}
