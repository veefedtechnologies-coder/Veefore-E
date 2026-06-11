import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import MagneticButton from './MagneticButton';

// Mock framer-motion to avoid hook issues in tests
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual('framer-motion');
  return {
    ...actual,
    motion: new Proxy(
      {},
      {
        get: (_, prop) => {
          const Component = ({ children, ...props }: any) => {
            const { onMouseMove, onMouseLeave, onClick, style, ...restProps } = props;
            return (
              <button
                {...restProps}
                onMouseMove={onMouseMove}
                onMouseLeave={onMouseLeave}
                onClick={onClick}
                data-motion={String(prop)}
              >
                {children}
              </button>
            );
          };
          Component.displayName = `motion.${String(prop)}`;
          return Component;
        },
      }
    ),
    useMotionValue: () => ({
      set: vi.fn(),
      get: vi.fn(() => 0),
    }),
    useSpring: (value: any) => value,
  };
});

// Mock the useIsMobile hook
vi.mock('../hooks/use-is-mobile', () => ({
  useIsMobile: vi.fn(),
}));

describe('MagneticButton', () => {
  beforeEach(() => {
    // Reset mock
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders children correctly', async () => {
      const { useIsMobile } = await import('../hooks/use-is-mobile');
      vi.mocked(useIsMobile).mockReturnValue(false);
      
      render(
        <MagneticButton>
          <span data-testid="button-content">Click Me</span>
        </MagneticButton>
      );

      expect(screen.getByTestId('button-content')).toBeInTheDocument();
      expect(screen.getByText('Click Me')).toBeInTheDocument();
    });

    it('applies custom className', async () => {
      const { useIsMobile } = await import('../hooks/use-is-mobile');
      vi.mocked(useIsMobile).mockReturnValue(false);
      
      const { container } = render(
        <MagneticButton className="custom-class bg-blue-500">
          <span>Button</span>
        </MagneticButton>
      );

      const button = container.querySelector('button');
      expect(button).toHaveClass('custom-class');
      expect(button).toHaveClass('bg-blue-500');
    });

    it('renders on desktop', async () => {
      const { useIsMobile } = await import('../hooks/use-is-mobile');
      vi.mocked(useIsMobile).mockReturnValue(false);
      
      const { container } = render(
        <MagneticButton>
          <span>Desktop Button</span>
        </MagneticButton>
      );

      const button = container.querySelector('button');
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('data-motion', 'button');
    });

    it('renders as static button on mobile', async () => {
      const { useIsMobile } = await import('../hooks/use-is-mobile');
      vi.mocked(useIsMobile).mockReturnValue(true);
      
      const { container } = render(
        <MagneticButton>
          <span>Mobile Button</span>
        </MagneticButton>
      );

      const button = container.querySelector('button');
      expect(button).toBeInTheDocument();
      expect(screen.getByText('Mobile Button')).toBeInTheDocument();
      // Mobile version should not have data-motion attribute
      expect(button).not.toHaveAttribute('data-motion');
    });
  });

  describe('Mobile Behavior', () => {
    it('disables magnetic effect on mobile devices', async () => {
      const { useIsMobile } = await import('../hooks/use-is-mobile');
      vi.mocked(useIsMobile).mockReturnValue(true);

      const { container } = render(
        <MagneticButton>
          <span>Mobile Button</span>
        </MagneticButton>
      );

      const button = container.querySelector('button');
      expect(button).toBeInTheDocument();
      // Verify it's a static button (no motion wrapper)
      expect(button).not.toHaveAttribute('data-motion');
    });
  });

  describe('Click Handling', () => {
    it('handles onClick event on desktop', async () => {
      const { useIsMobile } = await import('../hooks/use-is-mobile');
      vi.mocked(useIsMobile).mockReturnValue(false);
      
      const handleClick = vi.fn();

      render(
        <MagneticButton onClick={handleClick}>
          <span>Clickable Button</span>
        </MagneticButton>
      );

      const button = screen.getByText('Clickable Button').closest('button')!;
      button.click();

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('handles onClick event on mobile', async () => {
      const { useIsMobile } = await import('../hooks/use-is-mobile');
      vi.mocked(useIsMobile).mockReturnValue(true);
      
      const handleClick = vi.fn();

      render(
        <MagneticButton onClick={handleClick}>
          <span>Mobile Click</span>
        </MagneticButton>
      );

      const button = screen.getByText('Mobile Click').closest('button')!;
      button.click();

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('works without onClick handler', async () => {
      const { useIsMobile } = await import('../hooks/use-is-mobile');
      vi.mocked(useIsMobile).mockReturnValue(false);
      
      render(
        <MagneticButton>
          <span>No Handler</span>
        </MagneticButton>
      );

      const button = screen.getByText('No Handler').closest('button')!;
      
      // Should not throw error when clicked without handler
      expect(() => button.click()).not.toThrow();
    });
  });

  describe('Accessibility', () => {
    it('maintains button semantics', async () => {
      const { useIsMobile } = await import('../hooks/use-is-mobile');
      vi.mocked(useIsMobile).mockReturnValue(false);
      
      render(
        <MagneticButton>
          <span>Accessible Button</span>
        </MagneticButton>
      );

      const button = screen.getByText('Accessible Button').closest('button');
      expect(button?.tagName).toBe('BUTTON');
    });
  });

  describe('Requirements Validation', () => {
    it('validates Requirement 3.1: implements magnetic pull effect on desktop', async () => {
      const { useIsMobile } = await import('../hooks/use-is-mobile');
      vi.mocked(useIsMobile).mockReturnValue(false);

      const { container } = render(
        <MagneticButton>
          <span>Req 3.1</span>
        </MagneticButton>
      );

      const button = container.querySelector('button')!;
      
      // Verify component renders with motion wrapper on desktop
      expect(button).toHaveAttribute('data-motion', 'button');
      expect(screen.getByText('Req 3.1')).toBeInTheDocument();
    });

    it('validates Requirement 3.2: disables on mobile devices', async () => {
      const { useIsMobile } = await import('../hooks/use-is-mobile');
      vi.mocked(useIsMobile).mockReturnValue(true);

      const { container } = render(
        <MagneticButton>
          <span>Req 3.2</span>
        </MagneticButton>
      );

      const button = container.querySelector('button')!;
      
      // Should render static button on mobile (no motion wrapper)
      expect(button).not.toHaveAttribute('data-motion');
      expect(screen.getByText('Req 3.2')).toBeInTheDocument();
    });
  });
});
