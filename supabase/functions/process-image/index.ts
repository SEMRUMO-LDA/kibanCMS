/**
 * Supabase Edge Function - Image Processing
 * Generates optimized variants using Deno and ImageMagick/Sharp
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Types
interface ProcessingRequest {
  file: string; // Base64 encoded
  filename: string;
  breakpoints: number[];
  formats: string[];
  quality: number;
  basePath: string;
}

interface ProcessingResponse {
  success: boolean;
  variants: MediaVariant[];
  error?: string;
}

interface MediaVariant {
  variant_key: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  cdn_url: string;
  width: number;
  height: number;
  format: string;
  quality: number;
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    const { file, filename, breakpoints, formats, quality, basePath } =
      await req.json() as ProcessingRequest;

    // Decode base64 image
    const base64Data = file.split(',')[1] || file;
    const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    // Get original dimensions
    const originalDimensions = await getImageDimensions(imageBuffer);

    const variants: MediaVariant[] = [];

    // Process each breakpoint
    for (const width of breakpoints) {
      // Skip if breakpoint is larger than original
      if (width > originalDimensions.width) continue;

      // Calculate height maintaining aspect ratio
      const height = Math.round(
        (width / originalDimensions.width) * originalDimensions.height
      );

      // Process each format
      for (const format of formats) {
        const variantKey = `${width}w-${format}`;
        const variantFilename = `${basePath}/${variantKey}.${format}`;

        try {
          // Process image (would use sharp or similar in production)
          const processedImage = await processImage(imageBuffer, {
            width,
            height,
            format,
            quality,
          });

          // Upload to storage
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('media')
            .upload(variantFilename, processedImage.buffer, {
              contentType: `image/${format}`,
              upsert: false,
            });

          if (uploadError) throw uploadError;

          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('media')
            .getPublicUrl(variantFilename);

          variants.push({
            variant_key: variantKey,
            filename: `${variantKey}.${format}`,
            mime_type: `image/${format}`,
            size_bytes: processedImage.size,
            storage_path: variantFilename,
            cdn_url: publicUrl,
            width,
            height,
            format,
            quality,
          });
        } catch (error) {
          console.error(`Failed to process variant ${variantKey}:`, error);
        }
      }
    }

    // Generate thumbnail (150x150)
    try {
      const thumbnailSize = 150;
      const thumbnail = await processImage(imageBuffer, {
        width: thumbnailSize,
        height: thumbnailSize,
        format: 'webp',
        quality: 80,
        fit: 'cover',
      });

      const thumbnailPath = `${basePath}/thumbnail.webp`;
      const { data: thumbData } = await supabase.storage
        .from('media')
        .upload(thumbnailPath, thumbnail.buffer, {
          contentType: 'image/webp',
          upsert: false,
        });

      if (thumbData) {
        const { data: { publicUrl } } = supabase.storage
          .from('media')
          .getPublicUrl(thumbnailPath);

        variants.push({
          variant_key: 'thumbnail',
          filename: 'thumbnail.webp',
          mime_type: 'image/webp',
          size_bytes: thumbnail.size,
          storage_path: thumbnailPath,
          cdn_url: publicUrl,
          width: thumbnailSize,
          height: thumbnailSize,
          format: 'webp',
          quality: 80,
        });
      }
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
    }

    return new Response(
      JSON.stringify({
        success: true,
        variants,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Edge function error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        variants: [],
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
 * Get image dimensions
 */
async function getImageDimensions(buffer: Uint8Array): Promise<{ width: number; height: number }> {
  // Simple JPEG/PNG dimension detection
  // In production, use a proper image library

  // Check for JPEG
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    return getJPEGDimensions(buffer);
  }

  // Check for PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50) {
    return getPNGDimensions(buffer);
  }

  // Default fallback
  return { width: 1920, height: 1080 };
}

/**
 * Get JPEG dimensions
 */
function getJPEGDimensions(buffer: Uint8Array): { width: number; height: number } {
  let offset = 2;
  let width = 0;
  let height = 0;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xFF) break;

    const marker = buffer[offset + 1];

    if (marker === 0xC0 || marker === 0xC2) {
      height = (buffer[offset + 5] << 8) | buffer[offset + 6];
      width = (buffer[offset + 7] << 8) | buffer[offset + 8];
      break;
    }

    offset += 2 + ((buffer[offset + 2] << 8) | buffer[offset + 3]);
  }

  return { width, height };
}

/**
 * Get PNG dimensions
 */
function getPNGDimensions(buffer: Uint8Array): { width: number; height: number } {
  const width = (buffer[16] << 24) | (buffer[17] << 16) | (buffer[18] << 8) | buffer[19];
  const height = (buffer[20] << 24) | (buffer[21] << 16) | (buffer[22] << 8) | buffer[23];
  return { width, height };
}

/**
 * Process image (placeholder - would use sharp or similar)
 */
async function processImage(
  buffer: Uint8Array,
  options: {
    width: number;
    height: number;
    format: string;
    quality: number;
    fit?: string;
  }
): Promise<{ buffer: Uint8Array; size: number }> {
  // In production, this would use sharp, ImageMagick, or similar
  // For now, return a placeholder implementation

  // This is where you'd integrate with a real image processing library
  // Example with hypothetical API:
  /*
  const processed = await sharp(buffer)
    .resize(options.width, options.height, { fit: options.fit || 'inside' })
    .toFormat(options.format, { quality: options.quality })
    .toBuffer();
  */

  // Placeholder: return original for demo
  return {
    buffer: buffer,
    size: buffer.length,
  };
}