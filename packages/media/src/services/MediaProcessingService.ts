/**
 * MediaProcessingService - Intelligent media optimization
 * Handles image processing, optimization, and AI metadata generation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { encode as encodeBlurhash } from 'blurhash';
import PQueue from 'p-queue';
import { nanoid } from 'nanoid';
import type {
  MediaAsset,
  MediaProcessingTask,
  MediaVariant,
  ProcessingOptions,
  AIVisionResult,
} from '@kiban/types';

// ============================================
// TYPES
// ============================================

interface MediaContext {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
}

interface ProcessingResult {
  original: MediaAsset;
  variants: MediaVariant[];
  blurhash: string;
  aiMetadata?: AIVisionResult;
}

interface OptimizationConfig {
  breakpoints: number[];
  formats: ('webp' | 'avif' | 'jpg')[];
  quality: number;
  maxWidth: number;
  maxHeight: number;
}

// ============================================
// SERVICE
// ============================================

export class MediaProcessingService {
  private context: MediaContext;
  private queue: PQueue;
  private config: OptimizationConfig;

  constructor(context: MediaContext) {
    this.context = context;
    this.queue = new PQueue({ concurrency: 3 });

    // Default optimization config
    this.config = {
      breakpoints: [320, 640, 768, 1024, 1366, 1920],
      formats: ['webp', 'jpg'],
      quality: 85,
      maxWidth: 2560,
      maxHeight: 2560,
    };
  }

  /**
   * Process uploaded file
   */
  async processUpload(
    file: File,
    options: ProcessingOptions = {}
  ): Promise<ProcessingResult> {
    try {
      // Generate unique ID and paths
      const assetId = nanoid();
      const timestamp = Date.now();
      const ext = this.getFileExtension(file.name);
      const basePath = `${this.context.organizationId}/${timestamp}`;

      // Upload original
      const originalPath = `${basePath}/original.${ext}`;
      const { data: uploadData, error: uploadError } = await this.context.supabase.storage
        .from('media')
        .upload(originalPath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Get file dimensions and metadata
      const metadata = await this.extractMetadata(file);

      // Create media asset record
      const mediaAsset: MediaAsset = {
        id: assetId,
        organization_id: this.context.organizationId,
        filename: `${timestamp}-${file.name}`,
        original_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        storage_path: originalPath,
        width: metadata.width,
        height: metadata.height,
        uploaded_by: this.context.userId,
        folder_path: options.folder || '/',
        is_public: options.isPublic || false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Queue processing tasks
      const processingTasks: Promise<any>[] = [];

      // Generate blurhash
      processingTasks.push(
        this.queue.add(() => this.generateBlurhash(file))
      );

      // Generate responsive variants
      if (this.isImage(file.type)) {
        processingTasks.push(
          this.queue.add(() => this.generateResponsiveVariants(file, basePath))
        );
      }

      // AI Vision analysis
      if (options.enableAI !== false) {
        processingTasks.push(
          this.queue.add(() => this.analyzeWithAI(file))
        );
      }

      // Execute all tasks
      const [blurhash, variants, aiMetadata] = await Promise.all(processingTasks);

      // Save to database
      const { error: dbError } = await this.context.supabase
        .from('media_assets')
        .insert(mediaAsset);

      if (dbError) throw dbError;

      // Save variants
      if (variants && variants.length > 0) {
        await this.context.supabase
          .from('media_variants')
          .insert(variants.map((v: any) => ({ ...v, original_media_id: assetId })));
      }

      // Update with AI metadata if available
      if (aiMetadata) {
        await this.updateMediaWithAI(assetId, aiMetadata);
      }

      return {
        original: mediaAsset,
        variants: variants || [],
        blurhash,
        aiMetadata,
      };
    } catch (error) {
      console.error('Media processing failed:', error);
      throw error;
    }
  }

  /**
   * Generate blurhash for lazy loading
   */
  private async generateBlurhash(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      img.onload = () => {
        // Scale down for blurhash (max 32x32)
        const scale = Math.min(32 / img.width, 32 / img.height);
        canvas.width = Math.floor(img.width * scale);
        canvas.height = Math.floor(img.height * scale);

        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);

        if (imageData) {
          const blurhash = encodeBlurhash(
            imageData.data,
            imageData.width,
            imageData.height,
            4,
            4
          );
          resolve(blurhash);
        } else {
          reject(new Error('Failed to generate blurhash'));
        }
      };

      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Generate responsive image variants
   */
  private async generateResponsiveVariants(
    file: File,
    basePath: string
  ): Promise<MediaVariant[]> {
    const variants: MediaVariant[] = [];

    // Call Edge Function for processing
    const { data, error } = await this.context.supabase.functions.invoke('process-image', {
      body: {
        file: await this.fileToBase64(file),
        filename: file.name,
        breakpoints: this.config.breakpoints,
        formats: this.config.formats,
        quality: this.config.quality,
        basePath,
      },
    });

    if (error) {
      console.error('Edge function error:', error);
      return variants;
    }

    return data.variants || [];
  }

  /**
   * Analyze image with AI Vision
   */
  private async analyzeWithAI(file: File): Promise<AIVisionResult> {
    try {
      // Convert to base64 for API
      const base64 = await this.fileToBase64(file);

      // Call AI service (Edge Function)
      const { data, error } = await this.context.supabase.functions.invoke('ai-vision', {
        body: {
          image: base64,
          tasks: [
            'generate_alt_text',
            'detect_objects',
            'extract_text',
            'detect_faces',
            'suggest_tags',
            'dominant_colors',
          ],
        },
      });

      if (error) throw error;

      return {
        alt_text: data.alt_text,
        caption: data.caption,
        detected_objects: data.objects,
        detected_text: data.text,
        faces_count: data.faces?.length || 0,
        tags: data.tags,
        dominant_colors: data.colors,
        confidence: data.confidence,
      };
    } catch (error) {
      console.error('AI Vision analysis failed:', error);
      return {
        alt_text: '',
        caption: '',
        detected_objects: [],
        tags: [],
        dominant_colors: [],
        confidence: 0,
      };
    }
  }

  /**
   * Update media with AI metadata
   */
  private async updateMediaWithAI(
    mediaId: string,
    aiMetadata: AIVisionResult
  ): Promise<void> {
    await this.context.supabase
      .from('media_assets')
      .update({
        alt_text: aiMetadata.alt_text,
        caption: aiMetadata.caption,
        detected_objects: aiMetadata.detected_objects,
        detected_text: aiMetadata.detected_text,
        tags: aiMetadata.tags,
        metadata: {
          ai_analysis: aiMetadata,
          analyzed_at: new Date().toISOString(),
        },
      })
      .eq('id', mediaId);
  }

  /**
   * Extract file metadata
   */
  private async extractMetadata(file: File): Promise<any> {
    return new Promise((resolve) => {
      if (this.isImage(file.type)) {
        const img = new Image();
        img.onload = () => {
          resolve({
            width: img.width,
            height: img.height,
            aspectRatio: img.width / img.height,
          });
        };
        img.onerror = () => resolve({});
        img.src = URL.createObjectURL(file);
      } else if (this.isVideo(file.type)) {
        const video = document.createElement('video');
        video.onloadedmetadata = () => {
          resolve({
            width: video.videoWidth,
            height: video.videoHeight,
            duration: video.duration,
            aspectRatio: video.videoWidth / video.videoHeight,
          });
        };
        video.onerror = () => resolve({});
        video.src = URL.createObjectURL(file);
      } else {
        resolve({});
      }
    });
  }

  /**
   * Convert file to base64
   */
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });
  }

  /**
   * Check if file is image
   */
  private isImage(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  /**
   * Check if file is video
   */
  private isVideo(mimeType: string): boolean {
    return mimeType.startsWith('video/');
  }

  /**
   * Get file extension
   */
  private getFileExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || '';
  }

  /**
   * Generate CDN URL with transformations
   */
  generateCDNUrl(
    mediaAsset: MediaAsset,
    transformations?: {
      width?: number;
      height?: number;
      quality?: number;
      format?: string;
      fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
    }
  ): string {
    const baseUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/media/${mediaAsset.storage_path}`;

    if (!transformations) return baseUrl;

    // Build transformation string (for services like Cloudinary or custom CDN)
    const params = new URLSearchParams();
    if (transformations.width) params.append('w', transformations.width.toString());
    if (transformations.height) params.append('h', transformations.height.toString());
    if (transformations.quality) params.append('q', transformations.quality.toString());
    if (transformations.format) params.append('f', transformations.format);
    if (transformations.fit) params.append('fit', transformations.fit);

    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Get optimized srcset for responsive images
   */
  generateSrcSet(mediaAsset: MediaAsset, variants: MediaVariant[]): string {
    const srcset: string[] = [];

    // Add original
    srcset.push(`${this.generateCDNUrl(mediaAsset)} ${mediaAsset.width}w`);

    // Add variants
    for (const variant of variants) {
      if (variant.width) {
        srcset.push(`${variant.cdn_url} ${variant.width}w`);
      }
    }

    return srcset.join(', ');
  }

  /**
   * Clean up unused media
   */
  async cleanupUnusedMedia(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    // Find unused media
    const { data: unusedMedia, error } = await this.context.supabase
      .from('media_assets')
      .select('id, storage_path')
      .lt('created_at', cutoffDate.toISOString())
      .is('used_in', null); // Assuming we track usage

    if (error || !unusedMedia) return 0;

    // Delete files and records
    for (const media of unusedMedia) {
      await this.context.supabase.storage
        .from('media')
        .remove([media.storage_path]);

      await this.context.supabase
        .from('media_assets')
        .delete()
        .eq('id', media.id);
    }

    return unusedMedia.length;
  }
}