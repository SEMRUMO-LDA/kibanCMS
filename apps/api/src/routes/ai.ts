import { Router, type Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import type { AuthRequest } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';

const router: Router = Router();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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

OUTPUT FORMAT (strict JSON):
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
 * Accepts an image (base64 or URL) and returns a collection schema.
 * Requires JWT auth (admin only).
 */
router.post('/generate-collection', async (req: AuthRequest, res: Response) => {
  try {
    if (!ANTHROPIC_API_KEY) {
      return res.status(503).json({
        error: {
          message: 'AI features are not configured. Set ANTHROPIC_API_KEY in environment.',
          status: 503,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const { image, image_url, context } = req.body;

    if (!image && !image_url) {
      return res.status(400).json({
        error: {
          message: 'Provide either "image" (base64) or "image_url"',
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Build the image content block
    const imageContent: Anthropic.ImageBlockParam = image_url
      ? { type: 'image', source: { type: 'url', url: image_url } }
      : {
          type: 'image',
          source: {
            type: 'base64',
            media_type: detectMediaType(image),
            data: image.replace(/^data:[^;]+;base64,/, ''),
          },
        };

    const userMessage: Anthropic.MessageParam = {
      role: 'user',
      content: [
        imageContent,
        {
          type: 'text',
          text: context
            ? `Analyze this image and generate a CMS collection schema. Additional context from the user: "${context}"`
            : 'Analyze this image and generate a CMS collection schema for the content shown.',
        },
      ],
    };

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    logger.info('AI collection generation requested', { hasImage: !!image, hasUrl: !!image_url });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [userMessage],
    });

    // Extract text response
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from AI');
    }

    // Parse JSON from response (handle potential markdown wrapping)
    let schema;
    try {
      const jsonStr = textBlock.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      schema = JSON.parse(jsonStr);
    } catch {
      throw new Error('AI returned invalid JSON: ' + textBlock.text.substring(0, 200));
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
      meta: {
        model: 'claude-sonnet-4-20250514',
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
      },
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

function detectMediaType(base64: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  if (base64.startsWith('data:image/png')) return 'image/png';
  if (base64.startsWith('data:image/gif')) return 'image/gif';
  if (base64.startsWith('data:image/webp')) return 'image/webp';
  return 'image/jpeg';
}

export default router;
