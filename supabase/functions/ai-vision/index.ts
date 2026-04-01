/**
 * Supabase Edge Function - AI Vision Analysis
 * Generates alt text, detects objects, and extracts metadata using AI
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Types
interface VisionRequest {
  image: string; // Base64 encoded
  tasks: string[];
}

interface VisionResponse {
  success: boolean;
  alt_text?: string;
  caption?: string;
  objects?: DetectedObject[];
  text?: string;
  faces?: DetectedFace[];
  tags?: string[];
  colors?: DominantColor[];
  confidence?: number;
  error?: string;
}

interface DetectedObject {
  label: string;
  confidence: number;
  bbox?: BoundingBox;
}

interface DetectedFace {
  confidence: number;
  bbox: BoundingBox;
  emotions?: Record<string, number>;
  age?: number;
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DominantColor {
  hex: string;
  percentage: number;
  name?: string;
}

// API configuration
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const GOOGLE_VISION_API_KEY = Deno.env.get('GOOGLE_VISION_API_KEY');

serve(async (req) => {
  try {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    // Parse request
    const { image, tasks } = await req.json() as VisionRequest;

    // Remove data URL prefix if present
    const base64Image = image.split(',')[1] || image;

    const response: VisionResponse = {
      success: true,
    };

    // Execute requested tasks in parallel
    const taskPromises = [];

    if (tasks.includes('generate_alt_text')) {
      taskPromises.push(generateAltText(base64Image));
    }

    if (tasks.includes('detect_objects')) {
      taskPromises.push(detectObjects(base64Image));
    }

    if (tasks.includes('extract_text')) {
      taskPromises.push(extractText(base64Image));
    }

    if (tasks.includes('detect_faces')) {
      taskPromises.push(detectFaces(base64Image));
    }

    if (tasks.includes('suggest_tags')) {
      taskPromises.push(suggestTags(base64Image));
    }

    if (tasks.includes('dominant_colors')) {
      taskPromises.push(extractColors(base64Image));
    }

    // Wait for all tasks to complete
    const results = await Promise.allSettled(taskPromises);

    // Process results
    let taskIndex = 0;
    if (tasks.includes('generate_alt_text')) {
      const result = results[taskIndex++];
      if (result.status === 'fulfilled') {
        response.alt_text = result.value.alt_text;
        response.caption = result.value.caption;
      }
    }

    if (tasks.includes('detect_objects')) {
      const result = results[taskIndex++];
      if (result.status === 'fulfilled') {
        response.objects = result.value;
      }
    }

    if (tasks.includes('extract_text')) {
      const result = results[taskIndex++];
      if (result.status === 'fulfilled') {
        response.text = result.value;
      }
    }

    if (tasks.includes('detect_faces')) {
      const result = results[taskIndex++];
      if (result.status === 'fulfilled') {
        response.faces = result.value;
      }
    }

    if (tasks.includes('suggest_tags')) {
      const result = results[taskIndex++];
      if (result.status === 'fulfilled') {
        response.tags = result.value;
      }
    }

    if (tasks.includes('dominant_colors')) {
      const result = results[taskIndex++];
      if (result.status === 'fulfilled') {
        response.colors = result.value;
      }
    }

    // Calculate overall confidence
    response.confidence = calculateConfidence(response);

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('AI Vision error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

/**
 * Generate alt text using GPT-4 Vision
 */
async function generateAltText(base64Image: string): Promise<{ alt_text: string; caption: string }> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4-vision-preview',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at writing SEO-optimized alt text and captions for images. Provide concise, descriptive alt text (max 125 chars) and a longer caption (max 250 chars).',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Generate alt text and caption for this image. Return as JSON with "alt_text" and "caption" fields.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                  detail: 'low',
                },
              },
            ],
          },
        ],
        max_tokens: 200,
      }),
    });

    const data = await response.json();
    const content = data.choices[0].message.content;

    try {
      return JSON.parse(content);
    } catch {
      return {
        alt_text: content.slice(0, 125),
        caption: content,
      };
    }
  } catch (error) {
    console.error('Alt text generation failed:', error);
    return {
      alt_text: '',
      caption: '',
    };
  }
}

/**
 * Detect objects using Google Vision API
 */
async function detectObjects(base64Image: string): Promise<DetectedObject[]> {
  try {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Image },
            features: [
              { type: 'OBJECT_LOCALIZATION', maxResults: 10 },
              { type: 'LABEL_DETECTION', maxResults: 10 },
            ],
          }],
        }),
      }
    );

    const data = await response.json();
    const annotations = data.responses[0];
    const objects: DetectedObject[] = [];

    // Process object localization
    if (annotations.localizedObjectAnnotations) {
      for (const obj of annotations.localizedObjectAnnotations) {
        objects.push({
          label: obj.name,
          confidence: obj.score,
          bbox: convertBoundingBox(obj.boundingPoly),
        });
      }
    }

    // Add labels as well
    if (annotations.labelAnnotations) {
      for (const label of annotations.labelAnnotations) {
        if (!objects.find(o => o.label === label.description)) {
          objects.push({
            label: label.description,
            confidence: label.score,
          });
        }
      }
    }

    return objects;
  } catch (error) {
    console.error('Object detection failed:', error);
    return [];
  }
}

/**
 * Extract text (OCR)
 */
async function extractText(base64Image: string): Promise<string> {
  try {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Image },
            features: [{ type: 'TEXT_DETECTION' }],
          }],
        }),
      }
    );

    const data = await response.json();
    const textAnnotation = data.responses[0].textAnnotations;

    if (textAnnotation && textAnnotation.length > 0) {
      return textAnnotation[0].description;
    }

    return '';
  } catch (error) {
    console.error('Text extraction failed:', error);
    return '';
  }
}

/**
 * Detect faces
 */
async function detectFaces(base64Image: string): Promise<DetectedFace[]> {
  try {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Image },
            features: [{ type: 'FACE_DETECTION', maxResults: 10 }],
          }],
        }),
      }
    );

    const data = await response.json();
    const faceAnnotations = data.responses[0].faceAnnotations || [];

    return faceAnnotations.map((face: any) => ({
      confidence: face.detectionConfidence,
      bbox: convertBoundingBox(face.boundingPoly),
      emotions: {
        joy: likelihoodToScore(face.joyLikelihood),
        sorrow: likelihoodToScore(face.sorrowLikelihood),
        anger: likelihoodToScore(face.angerLikelihood),
        surprise: likelihoodToScore(face.surpriseLikelihood),
      },
    }));
  } catch (error) {
    console.error('Face detection failed:', error);
    return [];
  }
}

/**
 * Suggest tags
 */
async function suggestTags(base64Image: string): Promise<string[]> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4-vision-preview',
        messages: [
          {
            role: 'system',
            content: 'Generate relevant tags for SEO and categorization. Return as JSON array of strings.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Suggest 10-15 relevant tags for this image.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                  detail: 'low',
                },
              },
            ],
          },
        ],
        max_tokens: 150,
      }),
    });

    const data = await response.json();
    const content = data.choices[0].message.content;

    try {
      return JSON.parse(content);
    } catch {
      // Parse comma-separated list
      return content.split(',').map((s: string) => s.trim());
    }
  } catch (error) {
    console.error('Tag suggestion failed:', error);
    return [];
  }
}

/**
 * Extract dominant colors
 */
async function extractColors(base64Image: string): Promise<DominantColor[]> {
  try {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Image },
            features: [{ type: 'IMAGE_PROPERTIES' }],
          }],
        }),
      }
    );

    const data = await response.json();
    const props = data.responses[0].imagePropertiesAnnotation;

    if (!props || !props.dominantColors) return [];

    return props.dominantColors.colors.slice(0, 5).map((color: any) => ({
      hex: rgbToHex(color.color),
      percentage: color.pixelFraction * 100,
      name: getColorName(color.color),
    }));
  } catch (error) {
    console.error('Color extraction failed:', error);
    return [];
  }
}

// Helper functions

function convertBoundingBox(poly: any): BoundingBox {
  const vertices = poly.normalizedVertices || poly.vertices;
  const minX = Math.min(...vertices.map((v: any) => v.x || 0));
  const minY = Math.min(...vertices.map((v: any) => v.y || 0));
  const maxX = Math.max(...vertices.map((v: any) => v.x || 0));
  const maxY = Math.max(...vertices.map((v: any) => v.y || 0));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function likelihoodToScore(likelihood: string): number {
  const scores: Record<string, number> = {
    VERY_UNLIKELY: 0,
    UNLIKELY: 0.25,
    POSSIBLE: 0.5,
    LIKELY: 0.75,
    VERY_LIKELY: 1,
  };
  return scores[likelihood] || 0;
}

function rgbToHex(color: { red?: number; green?: number; blue?: number }): string {
  const r = Math.round(color.red || 0);
  const g = Math.round(color.green || 0);
  const b = Math.round(color.blue || 0);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function getColorName(color: any): string {
  // Simplified color naming
  const r = color.red || 0;
  const g = color.green || 0;
  const b = color.blue || 0;

  if (r > 200 && g > 200 && b > 200) return 'White';
  if (r < 50 && g < 50 && b < 50) return 'Black';
  if (r > g && r > b) return 'Red';
  if (g > r && g > b) return 'Green';
  if (b > r && b > g) return 'Blue';

  return 'Gray';
}

function calculateConfidence(response: VisionResponse): number {
  let totalConfidence = 0;
  let count = 0;

  if (response.objects) {
    response.objects.forEach(obj => {
      totalConfidence += obj.confidence;
      count++;
    });
  }

  if (response.faces) {
    response.faces.forEach(face => {
      totalConfidence += face.confidence;
      count++;
    });
  }

  return count > 0 ? totalConfidence / count : 0.5;
}