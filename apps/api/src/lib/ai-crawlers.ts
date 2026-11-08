/**
 * AI crawler policy for robots.txt (Settings → AI & Performance).
 *
 * Two independent choices per client:
 *  - "search": assistants that fetch pages to ANSWER users and cite/link the
 *    site (ChatGPT search, Perplexity, Claude). Blocking them = not appearing
 *    in AI answers.
 *  - "training": crawlers that collect content to TRAIN models. Blocking
 *    them doesn't affect normal search or AI answers.
 *
 * Note: Google's AI Overviews use the normal Googlebot (not listed here);
 * Google-Extended only controls use for Gemini training.
 */

export type BotPolicy = 'allow' | 'block';

export const AI_SEARCH_BOTS = [
  'OAI-SearchBot', 'ChatGPT-User',
  'PerplexityBot', 'Perplexity-User',
  'Claude-SearchBot', 'Claude-User',
] as const;

export const AI_TRAINING_BOTS = [
  'GPTBot', 'ClaudeBot', 'CCBot', 'Google-Extended',
  'Applebot-Extended', 'Meta-ExternalAgent', 'Bytespider',
] as const;

export function normalizePolicy(v: unknown, fallback: BotPolicy = 'allow'): BotPolicy {
  return v === 'block' ? 'block' : v === 'allow' ? 'allow' : fallback;
}

/** robots.txt groups for the AI bots. Empty when both are allowed (default behaviour). */
export function aiRobotsRules(search: BotPolicy, training: BotPolicy): string {
  const group = (comment: string, bots: readonly string[], policy: BotPolicy) =>
    `# ${comment}\n${bots.map(b => `User-agent: ${b}`).join('\n')}\n${policy === 'block' ? 'Disallow: /' : 'Allow: /'}\n`;
  const parts: string[] = [];
  // Explicit Allow groups are only written when the other group is blocked,
  // so the intent is visible; otherwise the generic "User-agent: *" applies.
  if (search === 'block' || training === 'block') {
    parts.push(group('AI assistants answering users (search)', AI_SEARCH_BOTS, search));
    parts.push(group('AI model training', AI_TRAINING_BOTS, training));
  }
  return parts.join('\n');
}

/** Full robots.txt: base rules + AI groups + sitemap line. */
export function buildRobotsTxt(opts: {
  base: string;
  search: BotPolicy;
  training: BotPolicy;
  sitemapUrl?: string;
}): string {
  let out = opts.base.trim() + '\n';
  const ai = aiRobotsRules(opts.search, opts.training);
  if (ai) out += '\n' + ai;
  if (opts.sitemapUrl && !/^\s*sitemap:/im.test(out)) out += `\nSitemap: ${opts.sitemapUrl}\n`;
  return out;
}
