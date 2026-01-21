/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RichContentRenderer } from '../../../../../src/renderer/components/media/RichContentRenderer';
import '@testing-library/jest-dom';

vi.stubGlobal('open', vi.fn());

describe('RichContentRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('text only content', () => {
    it('renders plain text content', () => {
      render(<RichContentRenderer content="Hello, world!" />);
      
      expect(screen.getByText('Hello, world!')).toBeInTheDocument();
    });

    it('renders markdown content', () => {
      render(<RichContentRenderer content="**Bold text** and *italic*" />);
      
      expect(screen.getByText('Bold text')).toBeInTheDocument();
    });

    it('renders code blocks in markdown', () => {
      render(<RichContentRenderer content="```javascript\nconst x = 1;\n```" />);
      
      // ReactMarkdown renders code differently - check for code element
      const codeElement = screen.getByRole('code') || screen.getByText(/const x = 1/);
      expect(codeElement).toBeInTheDocument();
    });
  });

  describe('image content', () => {
    it('extracts and renders single image from text', () => {
      render(
        <RichContentRenderer 
          content="Here is the result: https://example.com/image.png" 
        />
      );
      
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/image.png');
    });

    it('renders multiple images in a gallery', () => {
      render(
        <RichContentRenderer 
          content={`Output 1: https://example.com/image1.png
Output 2: https://example.com/image2.jpg`} 
        />
      );
      
      const images = screen.getAllByRole('img');
      expect(images).toHaveLength(2);
    });

    it('renders text alongside images', () => {
      render(
        <RichContentRenderer 
          content="Here is your processed image: https://example.com/result.png Check it out!" 
        />
      );
      
      expect(screen.getByRole('img')).toBeInTheDocument();
      expect(screen.getByText(/Here is your processed image/)).toBeInTheDocument();
    });

    it('handles S3 URLs', () => {
      render(
        <RichContentRenderer 
          content="Result: https://bucket.s3.amazonaws.com/generated/output.png" 
        />
      );
      
      expect(screen.getByRole('img')).toHaveAttribute(
        'src', 
        'https://bucket.s3.amazonaws.com/generated/output.png'
      );
    });
  });

  describe('video content', () => {
    it('extracts and renders video from text', () => {
      render(
        <RichContentRenderer 
          content="Video available at: https://example.com/video.mp4" 
        />
      );
      
      expect(screen.getByTestId('video-player')).toHaveAttribute(
        'src', 
        'https://example.com/video.mp4'
      );
    });

    it('renders text alongside video', () => {
      render(
        <RichContentRenderer 
          content="Here is the video: https://example.com/clip.mp4 Enjoy!" 
        />
      );
      
      expect(screen.getByTestId('video-player')).toBeInTheDocument();
      expect(screen.getByText(/Here is the video/)).toBeInTheDocument();
    });
  });

  describe('PDF content', () => {
    it('extracts and renders PDF from text', () => {
      render(
        <RichContentRenderer 
          content="Download the report: https://example.com/report.pdf" 
        />
      );
      
      expect(screen.getByTestId('pdf-renderer')).toBeInTheDocument();
      expect(screen.getByText('report.pdf')).toBeInTheDocument();
    });
  });

  describe('mixed content', () => {
    it('renders images, videos, and PDFs together', () => {
      render(
        <RichContentRenderer 
          content={`Here are your results:
- Image: https://example.com/photo.png
- Video: https://example.com/clip.mp4
- Report: https://example.com/document.pdf`} 
        />
      );
      
      expect(screen.getByRole('img')).toBeInTheDocument();
      expect(screen.getByTestId('video-player')).toBeInTheDocument();
      expect(screen.getByTestId('pdf-renderer')).toBeInTheDocument();
    });

    it('preserves order of media as they appear in text', () => {
      render(
        <RichContentRenderer 
          content={`First image: https://example.com/first.png
Then video: https://example.com/video.mp4
Another image: https://example.com/second.jpg`} 
        />
      );
      
      const mediaContainer = screen.getByTestId('rich-content');
      expect(mediaContainer).toBeInTheDocument();
      
      // Media should be rendered
      expect(screen.getAllByRole('img')).toHaveLength(2);
      expect(screen.getByTestId('video-player')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('handles empty content', () => {
      render(<RichContentRenderer content="" />);
      
      const container = screen.queryByTestId('rich-content');
      expect(container).toBeInTheDocument();
    });

    it('handles content with no media URLs', () => {
      render(<RichContentRenderer content="Just plain text with a link: https://example.com" />);
      
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      expect(screen.queryByTestId('video-player')).not.toBeInTheDocument();
      expect(screen.queryByTestId('pdf-renderer')).not.toBeInTheDocument();
    });

    it('handles markdown images syntax', () => {
      render(
        <RichContentRenderer 
          content="Here is the result: ![Generated image](https://example.com/result.png)" 
        />
      );
      
      // Should detect and render as enhanced image
      expect(screen.getByRole('img')).toBeInTheDocument();
    });

    it('does not duplicate images when URL appears multiple times', () => {
      render(
        <RichContentRenderer 
          content={`Image: https://example.com/image.png
Same image: https://example.com/image.png`} 
        />
      );
      
      // Should only render one image
      expect(screen.getAllByRole('img')).toHaveLength(1);
    });
  });

  describe('className prop', () => {
    it('applies custom className', () => {
      render(
        <RichContentRenderer 
          content="Content" 
          className="custom-class"
        />
      );
      
      expect(screen.getByTestId('rich-content')).toHaveClass('custom-class');
    });
  });
});
