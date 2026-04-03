import { Router, type Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AuthRequest } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';

const router: Router = Router();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const SYSTEM_PROMPT = `You are kibanCMS AI — an expert CMS schema designer.

You analyze screenshots/images of web pages, apps, or UI designs and generate the optimal CMS collection schema to manage that content.

RULES:
1. Return ONLY valid JSON — no markdown, no explanation, no code blocks.
2. Detect the language of the content in the image and use it for field labels.
3. Infer field types from visual context (text inputs → text, images → image, prices → number, dates → date, toggles → boolean, dropdowns → select, long text → richtext).
4. Mark fields as required if they appear essential to the content structure.
5. Set reasonable maxLength for text fields (title: 200, description: 500, body: unlimited).
6. Generate a clean slug from the collection name (lowercase, hyphens).
7. If you see a list/grid of items, the collection represents ONE item (not the list).
8. If you see a form, each input becomes a field.
9. Group related content logically.

OUTPUT FORMAT (strict JSON, nothing else):
{
  "name": "Collection Name",
  "slug": "collection-name",
  "description": "Brief description of what this collection manages",
  "type": "custom",
  "fields": [
    {
      "id": "field_id",
      "name": "Field Label",
      "type": "text|textarea|richtext|number|boolean|date|select|image|slug",
      "required": true|false,
      "maxLength": null|number,
      "helpText": "Brief description of the field purpose",
      "placeholder": "Example placeholder text"
    }
  ],
  "confidence": "high|medium|low",
  "reasoning": "One sentence explaining what you detected in the image"
}`;

/**
 * POST /api/v1/ai/generate-collection
 * Accepts an image (base64) and returns a collection schema.
 * Uses Google Gemini (free tier: 15 RPM).
 * Requires JWT auth (admin only).
 */
router.post('/generate-collection', async (req: AuthRequest, res: Response) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(503).json({
        error: {
          message: 'AI features are not configured. Set GEMINI_API_KEY in environment variables.',
          status: 503,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const { image, context } = req.body;

    if (!image) {
      return res.status(400).json({
        error: {
          message: 'Provide "image" as base64 encoded string',
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Extract base64 data and mime type
    const base64Match = image.match(/^data:(image\/\w+);base64,(.+)$/);
    const mimeType = base64Match ? base64Match[1] : 'image/jpeg';
    const base64Data = base64Match ? base64Match[2] : image.replace(/^data:[^;]+;base64,/, '');

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const userPrompt = context
      ? `Analyze this image and generate a CMS collection schema. Additional context: "${context}"`
      : 'Analyze this image and generate a CMS collection schema for the content shown.';

    logger.info('AI collection generation requested');

    const result = await model.generateContent([
      { text: SYSTEM_PROMPT + '\n\n' + userPrompt },
      {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      },
    ]);

    const responseText = result.response.text();

    // Parse JSON from response (handle potential markdown wrapping)
    let schema;
    try {
      const jsonStr = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      schema = JSON.parse(jsonStr);
    } catch {
      throw new Error('AI returned invalid JSON: ' + responseText.substring(0, 200));
    }

    // Validate minimum schema structure
    if (!schema.name || !schema.fields || !Array.isArray(schema.fields)) {
      throw new Error('AI returned incomplete schema');
    }

    // Ensure all fields have required properties
    schema.fields = schema.fields.map((field: any, index: number) => ({
      id: field.id || `field_${index}`,
      name: field.name || `Field ${index + 1}`,
      type: field.type || 'text',
      required: field.required || false,
      maxLength: field.maxLength || null,
      helpText: field.helpText || '',
      placeholder: field.placeholder || '',
    }));

    // Ensure slug exists
    if (!schema.slug) {
      schema.slug = schema.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }

    res.json({
      data: schema,
      meta: { model: 'gemini-2.5-flash' },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('AI generation failed', { error: error.message });
    res.status(500).json({
      error: {
        message: error.message || 'AI generation failed',
        status: 500,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

export default router;
