/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VideoRenderer } from '../../../../../src/renderer/components/media/VideoRenderer';
import '@testing-library/jest-dom';

const mockWindowOpen = vi.fn();

describe('VideoRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('open', mockWindowOpen);
  });

  describe('rendering', () => {
    it('renders a video element with the provided URL', () => {
      render(<VideoRenderer url="https://example.com/video.mp4" />);
      
      const video = screen.getByTestId('video-player');
      expect(video).toBeInTheDocument();
      expect(video).toHaveAttribute('src', 'https://example.com/video.mp4');
    });

    it('renders with controls by default', () => {
      render(<VideoRenderer url="https://example.com/video.mp4" />);
      
      const video = screen.getByTestId('video-player');
      expect(video).toHaveAttribute('controls');
    });

    it('renders without autoplay by default', () => {
      render(<VideoRenderer url="https://example.com/video.mp4" />);
      
      const video = screen.getByTestId('video-player');
      expect(video).not.toHaveAttribute('autoplay');
    });

    it('can enable autoplay', () => {
      render(<VideoRenderer url="https://example.com/video.mp4" autoPlay />);
      
      const video = screen.getByTestId('video-player');
      expect(video).toHaveAttribute('autoplay');
    });

    it('renders muted by default when autoplay is enabled', () => {
      render(<VideoRenderer url="https://example.com/video.mp4" autoPlay />);
      
      const video = screen.getByTestId('video-player');
      expect(video).toHaveProperty('muted', true);
    });
  });

  describe('loading state', () => {
    it('shows loading indicator initially', () => {
      render(<VideoRenderer url="https://example.com/video.mp4" />);
      
      expect(screen.getByTestId('video-loading')).toBeInTheDocument();
    });

    it('hides loading indicator when video can play', async () => {
      render(<VideoRenderer url="https://example.com/video.mp4" />);
      
      const video = screen.getByTestId('video-player');
      fireEvent.canPlay(video);
      
      await waitFor(() => {
        expect(screen.queryByTestId('video-loading')).not.toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('shows error message when video fails to load', async () => {
      render(<VideoRenderer url="https://example.com/broken.mp4" />);
      
      const video = screen.getByTestId('video-player');
      fireEvent.error(video);
      
      await waitFor(() => {
        expect(screen.getByText(/failed to load video/i)).toBeInTheDocument();
      });
    });

    it('hides video element when error occurs', async () => {
      render(<VideoRenderer url="https://example.com/broken.mp4" />);
      
      const video = screen.getByTestId('video-player');
      fireEvent.error(video);
      
      await waitFor(() => {
        expect(video).toHaveClass('hidden');
      });
    });
  });

  describe('download functionality', () => {
    it('shows download button', async () => {
      render(<VideoRenderer url="https://example.com/video.mp4" />);
      
      const video = screen.getByTestId('video-player');
      fireEvent.canPlay(video);
      
      await waitFor(() => {
        expect(screen.getByTestId('video-download-button')).toBeInTheDocument();
      });
    });

    it('triggers download when download button is clicked', async () => {
      render(<VideoRenderer url="https://example.com/video.mp4" />);
      
      const video = screen.getByTestId('video-player');
      fireEvent.canPlay(video);
      
      await waitFor(() => {
        expect(screen.getByTestId('video-download-button')).toBeInTheDocument();
      });
      
      const downloadButton = screen.getByTestId('video-download-button');
      fireEvent.click(downloadButton);
      
      expect(mockWindowOpen).toHaveBeenCalledWith('https://example.com/video.mp4', '_blank');
    });
  });

  describe('sizing', () => {
    it('respects maxWidth prop', () => {
      render(<VideoRenderer url="https://example.com/video.mp4" maxWidth={500} />);
      
      const container = screen.getByTestId('video-renderer');
      expect(container).toHaveStyle({ maxWidth: '500px' });
    });

    it('uses full width by default', () => {
      render(<VideoRenderer url="https://example.com/video.mp4" />);
      
      const container = screen.getByTestId('video-renderer');
      expect(container).toHaveClass('w-full');
    });
  });

  describe('poster image', () => {
    it('displays poster image when provided', () => {
      render(
        <VideoRenderer 
          url="https://example.com/video.mp4" 
          poster="https://example.com/thumbnail.jpg"
        />
      );
      
      const video = screen.getByTestId('video-player');
      expect(video).toHaveAttribute('poster', 'https://example.com/thumbnail.jpg');
    });
  });

  describe('supported formats', () => {
    it.each([
      'https://example.com/video.mp4',
      'https://example.com/video.webm',
      'https://example.com/video.mov',
      'https://example.com/video.ogv',
    ])('renders video for URL: %s', (url) => {
      render(<VideoRenderer url={url} />);
      
      const video = screen.getByTestId('video-player');
      expect(video).toHaveAttribute('src', url);
    });
  });
});
