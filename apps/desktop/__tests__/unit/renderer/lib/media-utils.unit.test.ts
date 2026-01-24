import { describe, it, expect } from 'vitest';
import {
  isImageUrl,
  isVideoUrl,
  isPdfUrl,
  extractMediaUrls,
  MediaType,
  isLocalPath,
  normalizeLocalPath,
  type ExtractedMedia,
} from '../../../../src/renderer/lib/media-utils';

describe('Media URL Detection Utilities', () => {
  describe('isLocalPath', () => {
    it.each([
      '/Users/adarsh/file.png',
      '/home/user/file.png',
      '/tmp/file.png',
      '/var/tmp/file.png',
      '/opt/app/file.png',
      'file:///Users/adarsh/file.png',
      'local-media:///Users/adarsh/file.png',
      'C:\\Users\\file.png',
      'C:/Users/file.png',
      'D:\\Documents\\file.pdf',
    ])('returns true for local path: "%s"', (path) => {
      expect(isLocalPath(path)).toBe(true);
    });

    it.each([
      'https://example.com/file.png',
      'http://example.com/file.png',
      'file.png',
      'relative/path/file.png',
      './file.png',
      '../file.png',
      '',
      'not-a-path',
    ])('returns false for non-local path: "%s"', (path) => {
      expect(isLocalPath(path)).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isLocalPath(null as unknown as string)).toBe(false);
      expect(isLocalPath(undefined as unknown as string)).toBe(false);
    });
  });

  describe('normalizeLocalPath', () => {
    it('converts Unix absolute path to local-media:// URL with 3 slashes', () => {
      expect(normalizeLocalPath('/Users/adarsh/file.png')).toBe('local-media:///Users/adarsh/file.png');
    });

    it('converts /var path correctly', () => {
      expect(normalizeLocalPath('/var/folders/test/file.png')).toBe('local-media:///var/folders/test/file.png');
    });

    it('converts /tmp path correctly', () => {
      expect(normalizeLocalPath('/tmp/file.png')).toBe('local-media:///tmp/file.png');
    });

    it('converts file:// URL to local-media://', () => {
      expect(normalizeLocalPath('file:///Users/adarsh/file.png')).toBe('local-media:///Users/adarsh/file.png');
    });

    it('keeps local-media:// URL with 3 slashes unchanged', () => {
      expect(normalizeLocalPath('local-media:///Users/adarsh/file.png')).toBe('local-media:///Users/adarsh/file.png');
    });

    it('fixes local-media:// URL with only 2 slashes', () => {
      expect(normalizeLocalPath('local-media://var/folders/test/file.png')).toBe('local-media:///var/folders/test/file.png');
    });

    it('converts Windows path with backslashes', () => {
      expect(normalizeLocalPath('C:\\Users\\file.png')).toBe('local-media:///C:/Users/file.png');
    });

    it('converts Windows path with forward slashes', () => {
      expect(normalizeLocalPath('C:/Users/file.png')).toBe('local-media:///C:/Users/file.png');
    });

    it('handles empty string', () => {
      expect(normalizeLocalPath('')).toBe('');
    });
  });

  describe('isImageUrl', () => {
    describe('should return true for valid image URLs', () => {
      it.each([
        // Common image extensions
        'https://example.com/image.png',
        'https://example.com/image.jpg',
        'https://example.com/image.jpeg',
        'https://example.com/image.gif',
        'https://example.com/image.webp',
        'https://example.com/image.svg',
        'https://example.com/image.bmp',
        'https://example.com/image.ico',
        // With query strings
        'https://example.com/image.png?width=100',
        'https://example.com/image.jpg?v=123&size=large',
        // With fragments
        'https://example.com/image.png#section',
        // Case insensitive
        'https://example.com/image.PNG',
        'https://example.com/image.JPG',
        'https://example.com/image.JPEG',
        // S3 URLs
        'https://s3.amazonaws.com/bucket/image.png',
        'https://bucket.s3.us-east-1.amazonaws.com/path/to/image.jpg',
        // CloudFront URLs
        'https://d1234.cloudfront.net/images/photo.webp',
        // CDN URLs
        'https://cdn.example.com/assets/logo.svg',
        // With paths
        'https://example.com/path/to/deep/nested/image.png',
      ])('detects image URL: "%s"', (url) => {
        expect(isImageUrl(url)).toBe(true);
      });
    });

    describe('should return false for non-image URLs', () => {
      it.each([
        'https://example.com/document.pdf',
        'https://example.com/video.mp4',
        'https://example.com/page.html',
        'https://example.com/script.js',
        'https://example.com/style.css',
        'https://example.com/',
        'https://example.com/api/images', // No extension
        'not-a-url',
        '',
        'image.png', // Relative path without protocol
      ])('returns false for: "%s"', (url) => {
        expect(isImageUrl(url)).toBe(false);
      });
    });

    describe('should handle edge cases', () => {
      it('returns false for null/undefined', () => {
        expect(isImageUrl(null as unknown as string)).toBe(false);
        expect(isImageUrl(undefined as unknown as string)).toBe(false);
      });

      it('handles URLs with image extensions in path but not at end', () => {
        expect(isImageUrl('https://example.com/png/file.txt')).toBe(false);
        expect(isImageUrl('https://example.com/image.png/download')).toBe(false);
      });
    });

    describe('should detect local image paths', () => {
      it.each([
        '/Users/adarsh/Desktop/screenshot.png',
        '/tmp/image.jpg',
        '/home/user/photos/image.webp',
        'file:///Users/adarsh/image.gif',
      ])('detects local image path: "%s"', (path) => {
        expect(isImageUrl(path)).toBe(true);
      });
    });
  });

  describe('isVideoUrl', () => {
    describe('should return true for valid video URLs', () => {
      it.each([
        // Common video extensions
        'https://example.com/video.mp4',
        'https://example.com/video.webm',
        'https://example.com/video.mov',
        'https://example.com/video.avi',
        'https://example.com/video.mkv',
        'https://example.com/video.m4v',
        'https://example.com/video.ogv',
        // With query strings
        'https://example.com/video.mp4?quality=hd',
        // Case insensitive
        'https://example.com/video.MP4',
        'https://example.com/video.WEBM',
        // S3/CDN URLs
        'https://s3.amazonaws.com/bucket/video.mp4',
        'https://cdn.example.com/videos/clip.webm',
      ])('detects video URL: "%s"', (url) => {
        expect(isVideoUrl(url)).toBe(true);
      });
    });

    describe('should return false for non-video URLs', () => {
      it.each([
        'https://example.com/image.png',
        'https://example.com/document.pdf',
        'https://example.com/audio.mp3',
        'https://example.com/',
        'https://youtube.com/watch?v=abc123', // Embedded video page, not direct file
        '',
      ])('returns false for: "%s"', (url) => {
        expect(isVideoUrl(url)).toBe(false);
      });
    });

    describe('should handle edge cases', () => {
      it('returns false for null/undefined', () => {
        expect(isVideoUrl(null as unknown as string)).toBe(false);
        expect(isVideoUrl(undefined as unknown as string)).toBe(false);
      });
    });

    describe('should detect local video paths', () => {
      it.each([
        '/Users/adarsh/Desktop/recording.mp4',
        '/tmp/video.webm',
        '/home/user/videos/clip.mov',
        'file:///Users/adarsh/video.avi',
      ])('detects local video path: "%s"', (path) => {
        expect(isVideoUrl(path)).toBe(true);
      });
    });
  });

  describe('isPdfUrl', () => {
    describe('should return true for valid PDF URLs', () => {
      it.each([
        'https://example.com/document.pdf',
        'https://example.com/document.PDF',
        'https://example.com/path/to/report.pdf',
        'https://example.com/document.pdf?download=true',
        'https://s3.amazonaws.com/bucket/invoice.pdf',
        'https://cdn.example.com/docs/manual.pdf',
      ])('detects PDF URL: "%s"', (url) => {
        expect(isPdfUrl(url)).toBe(true);
      });
    });

    describe('should return false for non-PDF URLs', () => {
      it.each([
        'https://example.com/image.png',
        'https://example.com/video.mp4',
        'https://example.com/document.doc',
        'https://example.com/document.docx',
        'https://example.com/',
        '',
      ])('returns false for: "%s"', (url) => {
        expect(isPdfUrl(url)).toBe(false);
      });
    });

    describe('should handle edge cases', () => {
      it('returns false for null/undefined', () => {
        expect(isPdfUrl(null as unknown as string)).toBe(false);
        expect(isPdfUrl(undefined as unknown as string)).toBe(false);
      });
    });

    describe('should detect local PDF paths', () => {
      it.each([
        '/Users/adarsh/Documents/report.pdf',
        '/tmp/document.pdf',
        '/home/user/docs/invoice.pdf',
        'file:///Users/adarsh/report.pdf',
      ])('detects local PDF path: "%s"', (path) => {
        expect(isPdfUrl(path)).toBe(true);
      });
    });
  });

  describe('extractMediaUrls', () => {
    describe('should extract image URLs from text', () => {
      it('extracts single image URL', () => {
        const text = 'Here is the result: https://example.com/image.png';
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          type: MediaType.IMAGE,
          url: 'https://example.com/image.png',
          isLocal: false,
        });
      });

      it('extracts multiple image URLs', () => {
        const text = `Output 1: https://example.com/image1.png
Output 2: https://example.com/image2.jpg
Output 3: https://example.com/image3.webp`;
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(3);
        expect(result.map(r => r.type)).toEqual([MediaType.IMAGE, MediaType.IMAGE, MediaType.IMAGE]);
      });

      it('extracts S3 URLs', () => {
        const text = 'Generated: https://bucket.s3.amazonaws.com/generated/output.png';
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe(MediaType.IMAGE);
      });
    });

    describe('should extract video URLs from text', () => {
      it('extracts single video URL', () => {
        const text = 'Video available at: https://example.com/video.mp4';
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          type: MediaType.VIDEO,
          url: 'https://example.com/video.mp4',
          isLocal: false,
        });
      });

      it('extracts multiple video URLs', () => {
        const text = `Clip 1: https://example.com/video1.mp4
Clip 2: https://example.com/video2.webm`;
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(2);
        expect(result.map(r => r.type)).toEqual([MediaType.VIDEO, MediaType.VIDEO]);
      });
    });

    describe('should extract PDF URLs from text', () => {
      it('extracts single PDF URL', () => {
        const text = 'Download report: https://example.com/report.pdf';
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          type: MediaType.PDF,
          url: 'https://example.com/report.pdf',
          isLocal: false,
        });
      });
    });

    describe('should extract mixed media types', () => {
      it('extracts images, videos, and PDFs from same text', () => {
        const text = `Here are the results:
- Image: https://example.com/photo.png
- Video: https://example.com/clip.mp4
- Report: https://example.com/document.pdf
- Another image: https://example.com/thumbnail.jpg`;
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(4);
        expect(result.map(r => r.type)).toEqual([
          MediaType.IMAGE,
          MediaType.VIDEO,
          MediaType.PDF,
          MediaType.IMAGE,
        ]);
      });
    });

    describe('should handle text without media URLs', () => {
      it('returns empty array for text without URLs', () => {
        const text = 'This is just plain text without any URLs.';
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(0);
      });

      it('returns empty array for text with non-media URLs', () => {
        const text = 'Visit https://example.com for more info.';
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(0);
      });

      it('returns empty array for empty string', () => {
        expect(extractMediaUrls('')).toHaveLength(0);
      });

      it('returns empty array for null/undefined', () => {
        expect(extractMediaUrls(null as unknown as string)).toHaveLength(0);
        expect(extractMediaUrls(undefined as unknown as string)).toHaveLength(0);
      });
    });

    describe('should handle markdown image syntax', () => {
      it('extracts URL from markdown image', () => {
        const text = '![Result](https://example.com/result.png)';
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(1);
        expect(result[0].url).toBe('https://example.com/result.png');
      });

      it('extracts URL from markdown image with alt text', () => {
        const text = '![Beautiful sunset photo](https://example.com/sunset.jpg)';
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(1);
        expect(result[0].url).toBe('https://example.com/sunset.jpg');
      });
    });

    describe('should handle URLs with special characters', () => {
      it('handles URLs with query parameters', () => {
        const text = 'Result: https://example.com/image.png?width=800&height=600';
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(1);
        expect(result[0].url).toBe('https://example.com/image.png?width=800&height=600');
      });

      it('handles URLs with encoded characters', () => {
        const text = 'Result: https://example.com/path%20with%20spaces/image.png';
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(1);
      });
    });

    describe('should preserve order of appearance', () => {
      it('returns URLs in order they appear', () => {
        const text = `First: https://example.com/first.png
Second: https://example.com/second.mp4
Third: https://example.com/third.pdf`;
        const result = extractMediaUrls(text);
        expect(result[0].url).toContain('first');
        expect(result[1].url).toContain('second');
        expect(result[2].url).toContain('third');
      });
    });

    describe('should not duplicate URLs', () => {
      it('returns unique URLs only', () => {
        const text = `Image: https://example.com/image.png
Same image: https://example.com/image.png`;
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(1);
      });
    });

    describe('should handle URLs wrapped in backticks', () => {
      it('extracts URL from single backticks', () => {
        const text = 'Image saved to: `https://example.com/image.png`';
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(1);
        expect(result[0].url).toBe('https://example.com/image.png');
      });

      it('extracts S3 URL from backticks', () => {
        const text = 'Image saved to: `https://future-me-ai.s3.ap-south-1.amazonaws.com/generated-images/task_123/image.png`';
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(1);
        expect(result[0].url).toBe('https://future-me-ai.s3.ap-south-1.amazonaws.com/generated-images/task_123/image.png');
        expect(result[0].type).toBe(MediaType.IMAGE);
      });

      it('extracts URL from triple backticks code block', () => {
        const text = '```\nhttps://example.com/photo.jpg\n```';
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(1);
        expect(result[0].url).toBe('https://example.com/photo.jpg');
      });

      it('handles URL with trailing backtick and other punctuation', () => {
        const text = 'See the image at `https://example.com/image.png`.';
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(1);
        expect(result[0].url).toBe('https://example.com/image.png');
      });
    });

    describe('should extract local file paths', () => {
      it('extracts local image path from markdown syntax', () => {
        const text = 'Here is the screenshot: ![Preview](/Users/adarsh/Desktop/screenshot.png)';
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          type: MediaType.IMAGE,
          url: 'local-media:///Users/adarsh/Desktop/screenshot.png',
          isLocal: true,
        });
      });

      it('extracts local PDF path from markdown syntax', () => {
        const text = 'Download the report: [Report](/Users/adarsh/Documents/report.pdf)';
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          type: MediaType.PDF,
          url: 'local-media:///Users/adarsh/Documents/report.pdf',
          isLocal: true,
        });
      });

      it('extracts local video path from markdown syntax', () => {
        const text = 'Watch the video: ![Video](/tmp/recording.mp4)';
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          type: MediaType.VIDEO,
          url: 'local-media:///tmp/recording.mp4',
          isLocal: true,
        });
      });

      it('extracts standalone local file paths', () => {
        const text = 'The file is saved at /Users/adarsh/Desktop/output.png for your review.';
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          type: MediaType.IMAGE,
          url: 'local-media:///Users/adarsh/Desktop/output.png',
          isLocal: true,
        });
      });

      it('extracts file:// URLs and converts to local-media://', () => {
        const text = 'Open the file: file:///Users/adarsh/Documents/photo.jpg';
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          type: MediaType.IMAGE,
          url: 'local-media:///Users/adarsh/Documents/photo.jpg',
          isLocal: true,
        });
      });

      it('extracts mixed local and remote URLs', () => {
        const text = `Remote image: https://example.com/photo.png
Local screenshot: ![Screenshot](/Users/adarsh/Desktop/screenshot.jpg)
Local PDF: /tmp/report.pdf`;
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({
          type: MediaType.IMAGE,
          url: 'https://example.com/photo.png',
          isLocal: false,
        });
        expect(result[1]).toEqual({
          type: MediaType.IMAGE,
          url: 'local-media:///Users/adarsh/Desktop/screenshot.jpg',
          isLocal: true,
        });
        expect(result[2]).toEqual({
          type: MediaType.PDF,
          url: 'local-media:///tmp/report.pdf',
          isLocal: true,
        });
      });

      it('handles /home paths (Linux)', () => {
        const text = 'File at: /home/user/images/photo.png';
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(1);
        expect(result[0].isLocal).toBe(true);
      });

      it('handles /var paths', () => {
        const text = 'Temp file: /var/tmp/video.mp4';
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(1);
        expect(result[0].isLocal).toBe(true);
      });

      it('handles /opt paths', () => {
        const text = 'App file: /opt/app/data/image.webp';
        const result = extractMediaUrls(text);
        expect(result).toHaveLength(1);
        expect(result[0].isLocal).toBe(true);
      });
    });
  });
});
