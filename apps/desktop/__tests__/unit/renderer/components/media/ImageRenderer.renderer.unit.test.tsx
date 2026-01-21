/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImageRenderer, ImageGallery } from '../../../../../src/renderer/components/media/ImageRenderer';
import '@testing-library/jest-dom';

// Mock window.open for download functionality
const mockWindowOpen = vi.fn();

describe('ImageRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.open inside beforeEach to ensure jsdom is loaded
    vi.stubGlobal('open', mockWindowOpen);
  });

  describe('single image rendering', () => {
    it('renders an image with the provided URL', () => {
      render(<ImageRenderer url="https://example.com/image.png" />);
      
      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://example.com/image.png');
    });

    it('renders with alt text when provided', () => {
      render(<ImageRenderer url="https://example.com/image.png" alt="Test image" />);
      
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('alt', 'Test image');
    });

    it('renders with default alt text when not provided', () => {
      render(<ImageRenderer url="https://example.com/image.png" />);
      
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('alt', 'Generated image');
    });

    it('shows loading state initially', () => {
      render(<ImageRenderer url="https://example.com/image.png" />);
      
      // Should have a loading placeholder or skeleton
      const container = screen.getByTestId('image-renderer');
      expect(container).toBeInTheDocument();
    });

    it('handles image load success', async () => {
      render(<ImageRenderer url="https://example.com/image.png" />);
      
      const img = screen.getByRole('img');
      fireEvent.load(img);
      
      await waitFor(() => {
        expect(img).toBeVisible();
      });
    });

    it('handles image load error', async () => {
      render(<ImageRenderer url="https://example.com/broken.png" />);
      
      const img = screen.getByRole('img');
      fireEvent.error(img);
      
      await waitFor(() => {
        expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
      });
    });
  });

  describe('lightbox functionality', () => {
    it('opens lightbox when image is clicked', async () => {
      render(<ImageRenderer url="https://example.com/image.png" />);
      
      const img = screen.getByRole('img');
      fireEvent.load(img); // Ensure image is loaded first
      fireEvent.click(img);
      
      await waitFor(() => {
        expect(screen.getByTestId('lightbox')).toBeInTheDocument();
      });
    });

    it('closes lightbox when close button is clicked', async () => {
      render(<ImageRenderer url="https://example.com/image.png" />);
      
      const img = screen.getByRole('img');
      fireEvent.load(img);
      fireEvent.click(img);
      
      await waitFor(() => {
        expect(screen.getByTestId('lightbox')).toBeInTheDocument();
      });
      
      const closeButton = screen.getByTestId('lightbox-close');
      fireEvent.click(closeButton);
      
      await waitFor(() => {
        expect(screen.queryByTestId('lightbox')).not.toBeInTheDocument();
      });
    });

    it('closes lightbox when escape key is pressed', async () => {
      render(<ImageRenderer url="https://example.com/image.png" />);
      
      const img = screen.getByRole('img');
      fireEvent.load(img);
      fireEvent.click(img);
      
      await waitFor(() => {
        expect(screen.getByTestId('lightbox')).toBeInTheDocument();
      });
      
      fireEvent.keyDown(document, { key: 'Escape' });
      
      await waitFor(() => {
        expect(screen.queryByTestId('lightbox')).not.toBeInTheDocument();
      });
    });

    it('closes lightbox when backdrop is clicked', async () => {
      render(<ImageRenderer url="https://example.com/image.png" />);
      
      const img = screen.getByRole('img');
      fireEvent.load(img);
      fireEvent.click(img);
      
      await waitFor(() => {
        expect(screen.getByTestId('lightbox')).toBeInTheDocument();
      });
      
      const backdrop = screen.getByTestId('lightbox-backdrop');
      fireEvent.click(backdrop);
      
      await waitFor(() => {
        expect(screen.queryByTestId('lightbox')).not.toBeInTheDocument();
      });
    });
  });

  describe('download functionality', () => {
    it('shows download button', () => {
      render(<ImageRenderer url="https://example.com/image.png" />);
      
      const img = screen.getByRole('img');
      fireEvent.load(img);
      
      expect(screen.getByTestId('download-button')).toBeInTheDocument();
    });

    it('triggers download when download button is clicked', () => {
      render(<ImageRenderer url="https://example.com/image.png" />);
      
      const img = screen.getByRole('img');
      fireEvent.load(img);
      
      const downloadButton = screen.getByTestId('download-button');
      fireEvent.click(downloadButton);
      
      // Should open the URL in a new tab for download
      expect(mockWindowOpen).toHaveBeenCalledWith('https://example.com/image.png', '_blank');
    });
  });

  describe('sizing', () => {
    it('respects maxWidth prop', () => {
      render(<ImageRenderer url="https://example.com/image.png" maxWidth={300} />);
      
      const container = screen.getByTestId('image-renderer');
      expect(container).toHaveStyle({ maxWidth: '300px' });
    });

    it('respects maxHeight prop', () => {
      render(<ImageRenderer url="https://example.com/image.png" maxHeight={200} />);
      
      const container = screen.getByTestId('image-renderer');
      expect(container).toHaveStyle({ maxHeight: '200px' });
    });
  });
});

describe('ImageGallery', () => {
  const testImages = [
    'https://example.com/image1.png',
    'https://example.com/image2.jpg',
    'https://example.com/image3.webp',
  ];

  describe('rendering', () => {
    it('renders all images in the gallery', () => {
      render(<ImageGallery urls={testImages} />);
      
      const images = screen.getAllByRole('img');
      expect(images).toHaveLength(3);
    });

    it('renders images in a grid layout', () => {
      render(<ImageGallery urls={testImages} />);
      
      const gallery = screen.getByTestId('image-gallery');
      expect(gallery).toBeInTheDocument();
      expect(gallery).toHaveClass('grid');
    });

    it('renders nothing when urls array is empty', () => {
      render(<ImageGallery urls={[]} />);
      
      expect(screen.queryByTestId('image-gallery')).not.toBeInTheDocument();
    });
  });

  describe('gallery lightbox', () => {
    it('opens lightbox showing clicked image', async () => {
      render(<ImageGallery urls={testImages} />);
      
      const images = screen.getAllByRole('img');
      images.forEach(img => fireEvent.load(img));
      
      fireEvent.click(images[1]); // Click second image
      
      await waitFor(() => {
        const lightboxImg = screen.getByTestId('lightbox-image');
        expect(lightboxImg).toHaveAttribute('src', 'https://example.com/image2.jpg');
      });
    });

    it('navigates to next image in lightbox', async () => {
      render(<ImageGallery urls={testImages} />);
      
      const images = screen.getAllByRole('img');
      images.forEach(img => fireEvent.load(img));
      
      fireEvent.click(images[0]);
      
      await waitFor(() => {
        expect(screen.getByTestId('lightbox')).toBeInTheDocument();
      });
      
      const nextButton = screen.getByTestId('lightbox-next');
      fireEvent.click(nextButton);
      
      await waitFor(() => {
        const lightboxImg = screen.getByTestId('lightbox-image');
        expect(lightboxImg).toHaveAttribute('src', 'https://example.com/image2.jpg');
      });
    });

    it('navigates to previous image in lightbox', async () => {
      render(<ImageGallery urls={testImages} />);
      
      const images = screen.getAllByRole('img');
      images.forEach(img => fireEvent.load(img));
      
      fireEvent.click(images[1]); // Start at second image
      
      await waitFor(() => {
        expect(screen.getByTestId('lightbox')).toBeInTheDocument();
      });
      
      const prevButton = screen.getByTestId('lightbox-prev');
      fireEvent.click(prevButton);
      
      await waitFor(() => {
        const lightboxImg = screen.getByTestId('lightbox-image');
        expect(lightboxImg).toHaveAttribute('src', 'https://example.com/image1.png');
      });
    });

    it('wraps around to first image when navigating past last', async () => {
      render(<ImageGallery urls={testImages} />);
      
      const images = screen.getAllByRole('img');
      images.forEach(img => fireEvent.load(img));
      
      fireEvent.click(images[2]); // Start at last image
      
      await waitFor(() => {
        expect(screen.getByTestId('lightbox')).toBeInTheDocument();
      });
      
      const nextButton = screen.getByTestId('lightbox-next');
      fireEvent.click(nextButton);
      
      await waitFor(() => {
        const lightboxImg = screen.getByTestId('lightbox-image');
        expect(lightboxImg).toHaveAttribute('src', 'https://example.com/image1.png');
      });
    });

    it('supports keyboard navigation', async () => {
      render(<ImageGallery urls={testImages} />);
      
      const images = screen.getAllByRole('img');
      images.forEach(img => fireEvent.load(img));
      
      fireEvent.click(images[0]);
      
      await waitFor(() => {
        expect(screen.getByTestId('lightbox')).toBeInTheDocument();
      });
      
      // Press right arrow
      fireEvent.keyDown(document, { key: 'ArrowRight' });
      
      await waitFor(() => {
        const lightboxImg = screen.getByTestId('lightbox-image');
        expect(lightboxImg).toHaveAttribute('src', 'https://example.com/image2.jpg');
      });
      
      // Press left arrow
      fireEvent.keyDown(document, { key: 'ArrowLeft' });
      
      await waitFor(() => {
        const lightboxImg = screen.getByTestId('lightbox-image');
        expect(lightboxImg).toHaveAttribute('src', 'https://example.com/image1.png');
      });
    });
  });

  describe('image counter', () => {
    it('shows image counter in lightbox', async () => {
      render(<ImageGallery urls={testImages} />);
      
      const images = screen.getAllByRole('img');
      images.forEach(img => fireEvent.load(img));
      
      fireEvent.click(images[0]);
      
      await waitFor(() => {
        expect(screen.getByText('1 / 3')).toBeInTheDocument();
      });
    });
  });
});
