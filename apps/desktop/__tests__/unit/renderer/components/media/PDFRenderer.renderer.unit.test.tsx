/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PDFRenderer } from '../../../../../src/renderer/components/media/PDFRenderer';
import '@testing-library/jest-dom';

const mockWindowOpen = vi.fn();

describe('PDFRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('open', mockWindowOpen);
  });

  describe('rendering', () => {
    it('renders a PDF preview card', () => {
      render(<PDFRenderer url="https://example.com/document.pdf" />);
      
      const container = screen.getByTestId('pdf-renderer');
      expect(container).toBeInTheDocument();
    });

    it('displays PDF icon', () => {
      render(<PDFRenderer url="https://example.com/document.pdf" />);
      
      expect(screen.getByTestId('pdf-icon')).toBeInTheDocument();
    });

    it('displays the filename extracted from URL', () => {
      render(<PDFRenderer url="https://example.com/path/to/document.pdf" />);
      
      expect(screen.getByText('document.pdf')).toBeInTheDocument();
    });

    it('displays custom title when provided', () => {
      render(
        <PDFRenderer 
          url="https://example.com/document.pdf" 
          title="My Custom Document"
        />
      );
      
      expect(screen.getByText('My Custom Document')).toBeInTheDocument();
    });

    it('handles URL-encoded filenames', () => {
      render(<PDFRenderer url="https://example.com/my%20document%20name.pdf" />);
      
      expect(screen.getByText('my document name.pdf')).toBeInTheDocument();
    });
  });

  describe('open functionality', () => {
    it('opens PDF in new tab when clicked', () => {
      render(<PDFRenderer url="https://example.com/document.pdf" />);
      
      const card = screen.getByTestId('pdf-renderer');
      fireEvent.click(card);
      
      expect(mockWindowOpen).toHaveBeenCalledWith('https://example.com/document.pdf', '_blank');
    });

    it('opens PDF when open button is clicked', () => {
      render(<PDFRenderer url="https://example.com/document.pdf" />);
      
      const openButton = screen.getByTestId('pdf-open-button');
      fireEvent.click(openButton);
      
      expect(mockWindowOpen).toHaveBeenCalledWith('https://example.com/document.pdf', '_blank');
    });
  });

  describe('download functionality', () => {
    it('shows download button', () => {
      render(<PDFRenderer url="https://example.com/document.pdf" />);
      
      expect(screen.getByTestId('pdf-download-button')).toBeInTheDocument();
    });

    it('triggers download when download button is clicked', () => {
      render(<PDFRenderer url="https://example.com/document.pdf" />);
      
      const downloadButton = screen.getByTestId('pdf-download-button');
      fireEvent.click(downloadButton);
      
      expect(mockWindowOpen).toHaveBeenCalledWith('https://example.com/document.pdf', '_blank');
    });

    it('stops propagation on download button click', () => {
      const onCardClick = vi.fn();
      render(
        <div onClick={onCardClick}>
          <PDFRenderer url="https://example.com/document.pdf" />
        </div>
      );
      
      const downloadButton = screen.getByTestId('pdf-download-button');
      fireEvent.click(downloadButton);
      
      // Only one call (from download button), not from card
      expect(mockWindowOpen).toHaveBeenCalledTimes(1);
    });
  });

  describe('styling', () => {
    it('applies custom className', () => {
      render(
        <PDFRenderer 
          url="https://example.com/document.pdf" 
          className="custom-class"
        />
      );
      
      const container = screen.getByTestId('pdf-renderer');
      expect(container).toHaveClass('custom-class');
    });

    it('shows hover state styles', () => {
      render(<PDFRenderer url="https://example.com/document.pdf" />);
      
      const container = screen.getByTestId('pdf-renderer');
      expect(container).toHaveClass('cursor-pointer');
    });
  });

  describe('file size display', () => {
    it('displays file size when provided', () => {
      render(
        <PDFRenderer 
          url="https://example.com/document.pdf" 
          fileSize="2.5 MB"
        />
      );
      
      expect(screen.getByText('2.5 MB')).toBeInTheDocument();
    });

    it('does not display file size section when not provided', () => {
      render(<PDFRenderer url="https://example.com/document.pdf" />);
      
      expect(screen.queryByTestId('pdf-file-size')).not.toBeInTheDocument();
    });
  });
});
