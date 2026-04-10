/**
 * useCookieConsent — manages cookie consent state on the client side.
 * Reads/writes consent to localStorage and syncs with the API.
 */

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'kiban_cookie_consent';
const VISITOR_KEY = 'kiban_visitor_id';

export interface CookieCategories {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
}

export interface ConsentState {
  given: boolean;
  categories: CookieCategories;
  timestamp: string;
}

const DEFAULT_CATEGORIES: CookieCategories = {
  necessary: true,
  analytics: false,
  marketing: false,
  preferences: false,
};

function getVisitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

function getStoredConsent(): ConsentState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function useCookieConsent(apiUrl?: string) {
  const [consent, setConsent] = useState<ConsentState | null>(() => getStoredConsent());
  const [visible, setVisible] = useState(false);

  // Show banner if no consent recorded yet
  useEffect(() => {
    if (!consent) {
      setVisible(true);
    }
  }, [consent]);

  const syncToServer = useCallback(async (state: ConsentState) => {
    if (!apiUrl) return;
    try {
      await fetch(`${apiUrl}/api/cookie-consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitor_id: getVisitorId(),
          consent_given: state.given,
          categories: state.categories,
        }),
      });
    } catch {
      // Non-critical — consent is already stored locally
    }
  }, [apiUrl]);

  const acceptAll = useCallback(() => {
    const state: ConsentState = {
      given: true,
      categories: { necessary: true, analytics: true, marketing: true, preferences: true },
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setConsent(state);
    setVisible(false);
    syncToServer(state);
  }, [syncToServer]);

  const declineAll = useCallback(() => {
    const state: ConsentState = {
      given: false,
      categories: { ...DEFAULT_CATEGORIES },
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setConsent(state);
    setVisible(false);
    syncToServer(state);
  }, [syncToServer]);

  const acceptSelected = useCallback((categories: CookieCategories) => {
    const state: ConsentState = {
      given: true,
      categories: { ...categories, necessary: true }, // necessary always on
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setConsent(state);
    setVisible(false);
    syncToServer(state);
  }, [syncToServer]);

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setConsent(null);
    setVisible(true);
  }, []);

  const hasConsent = useCallback((category: keyof CookieCategories): boolean => {
    return consent?.categories[category] ?? (category === 'necessary');
  }, [consent]);

  return {
    consent,
    visible,
    acceptAll,
    declineAll,
    acceptSelected,
    reset,
    hasConsent,
    showBanner: () => setVisible(true),
  };
}
