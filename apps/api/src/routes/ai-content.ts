import { Router, type Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AuthRequest } from '../middleware/auth.js';

const router: Router = Router();
const GEMINI_KEY = process.env.GEMINI_API_KEY;

function getModel() {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not configured');
  return new GoogleGenerativeAI(GEMINI_KEY).getGenerativeModel({ model: 'gemini-2.5-flash' });
}

/**
 * POST /api/v1/ai/alt-text
 * Generate alt-text for an image (base64)
 */
router.post('/alt-text', async (req: AuthRequest, res: Response) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: { message: 'image (base64) required', status: 400 } });

    const model = getModel();
    const base64 = image.replace(/^data:[^;]+;base64,/, '');
    const mime = image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';

    const result = await model.generateContent([
      { text: 'Generate a concise, descriptive alt-text for this image. Focus on accessibility. Return ONLY the alt-text, no quotes, no explanation. Max 125 characters.' },
      { inlineData: { mimeType: mime, data: base64 } },
    ]);

    res.json({ data: { alt_text: result.response.text().trim() }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message, status: 500 } });
  }
});

/**
 * POST /api/v1/ai/translate
 * Translate structured content (all fields) to target language
 */
router.post('/translate', async (req: AuthRequest, res: Response) => {
  try {
    const { content, from_lang, to_lang } = req.body;
    if (!content || !to_lang) return res.status(400).json({ error: { message: 'content and to_lang required', status: 400 } });

    const model = getModel();
    const prompt = `Translate the following JSON content from ${from_lang || 'auto-detect'} to ${to_lang}.
Translate ALL string values (titles, descriptions, body text, meta fields, image captions).
Keep the JSON keys unchanged. Keep URLs, emails, and technical values unchanged.
Return ONLY valid JSON, nothing else.

${JSON.stringify(content, null, 2)}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const translated = JSON.parse(text);

    res.json({ data: { translated, from_lang: from_lang || 'auto', to_lang }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message, status: 500 } });
  }
});

/**
 * POST /api/v1/ai/adjust-tone
 * Adjust the tone of text content
 */
router.post('/adjust-tone', async (req: AuthRequest, res: Response) => {
  try {
    const { text, action } = req.body;
    if (!text || !action) return res.status(400).json({ error: { message: 'text and action required', status: 400 } });

    const model = getModel();
    const prompts: Record<string, string> = {
      professional: `Rewrite this text in a more professional, corporate tone. Keep the same meaning and language. Return ONLY the rewritten text:\n\n${text}`,
      casual: `Rewrite this text in a more casual, friendly tone. Keep the same meaning and language. Return ONLY the rewritten text:\n\n${text}`,
      shorter: `Make this text significantly shorter while keeping the key message. Same language. Return ONLY the shortened text:\n\n${text}`,
      longer: `Expand this text with more detail while keeping the same tone and language. Return ONLY the expanded text:\n\n${text}`,
      fix_grammar: `Fix all grammar, spelling, and punctuation errors in this text. Keep the same language and tone. Return ONLY the corrected text:\n\n${text}`,
      seo_optimize: `Rewrite this text to be more SEO-friendly while keeping it natural and readable. Same language. Return ONLY the optimized text:\n\n${text}`,
    };

    const prompt = prompts[action];
    if (!prompt) return res.status(400).json({ error: { message: `Invalid action. Use: ${Object.keys(prompts).join(', ')}`, status: 400 } });

    const result = await model.generateContent(prompt);

    res.json({ data: { original: text, adjusted: result.response.text().trim(), action }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message, status: 500 } });
  }
});

export default router;
