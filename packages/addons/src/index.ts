/**
 * @kiban/addons - Extension System for kibanCMS
 */

export * from './types';
export { AddonRegistry } from './core/AddonRegistry';
export { AddonManager } from './core/AddonManager';

// Export specific add-ons
export * from './addons/cookie-notice';
export * from './addons/contact-form';
export * from './addons/newsletter';
export * from './addons/seo-meta';
export * from './addons/accessibility';
