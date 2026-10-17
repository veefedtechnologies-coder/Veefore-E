import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import FloatingStatusBadge from '../FloatingStatusBadge';
import { Zap, CheckCircle } from 'lucide-react';

describe('FloatingStatusBadge', () => {
  it('renders with correct text content', () => {
    render(
      <FloatingStatusBadge
        text="24/7 Automation Active"
        icon={Zap}
        position={{ bottom: '10px', right: '10px' }}
        color="blue"
      />
    );

    expect(screen.getByText('24/7 Automation Active')).toBeInTheDocument();
  });

  it('renders with green color theme', () => {
    const { container } = render(
      <FloatingStatusBadge
        text="AI is actively engaging"
        icon={CheckCircle}
        position={{ bottom: '10px', left: '10px' }}
        color="green"
      />
    );

    expect(screen.getByText('AI is actively engaging')).toBeInTheDocument();
    // Check if the component container has the expected classes
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('border-green-500/30');
  });

  it('renders with purple color theme', () => {
    const { container } = render(
      <FloatingStatusBadge
        text="Processing"
        icon={Zap}
        position={{ top: '10px' }}
        color="purple"
      />
    );

    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('border-purple-500/30');
  });

  it('applies glass morphism styling', () => {
    const { container } = render(
      <FloatingStatusBadge
        text="Test Badge"
        icon={Zap}
        position={{ bottom: '10px' }}
        color="blue"
      />
    );

    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-black/60');
    expect(badge.className).toContain('backdrop-blur-md');
    expect(badge.className).toContain('border');
  });

  it('renders icon', () => {
    const { container } = render(
      <FloatingStatusBadge
        text="Test Badge"
        icon={Zap}
        position={{ bottom: '10px' }}
        color="blue"
      />
    );

    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('applies absolute positioning', () => {
    const { container } = render(
      <FloatingStatusBadge
        text="Test Badge"
        icon={Zap}
        position={{ bottom: '10px' }}
        color="blue"
      />
    );

    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('absolute');
  });

  it('includes z-index for proper layering', () => {
    const { container } = render(
      <FloatingStatusBadge
        text="Test Badge"
        icon={Zap}
        position={{ bottom: '10px' }}
        color="blue"
      />
    );

    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('z-20');
  });

  it('accepts animation delay prop', () => {
    // Just verify it doesn't crash with animationDelay
    const { container } = render(
      <FloatingStatusBadge
        text="Test Badge"
        icon={Zap}
        position={{ bottom: '10px' }}
        color="blue"
        animationDelay={0.5}
      />
    );

    expect(container.firstChild).toBeInTheDocument();
  });

  // Accessibility tests for Task 8.1
  it('has role="status" for screen reader announcements', () => {
    const { container } = render(
      <FloatingStatusBadge
        text="AI is actively engaging"
        icon={CheckCircle}
        position={{ top: '20px', left: '10px' }}
        color="green"
      />
    );
    
    const badge = container.querySelector('[role="status"]');
    expect(badge).toBeInTheDocument();
  });

  it('has descriptive aria-label', () => {
    const { container } = render(
      <FloatingStatusBadge
        text="24/7 Automation Active"
        icon={Zap}
        position={{ bottom: '20px', right: '10px' }}
        color="blue"
      />
    );
    
    const badge = container.querySelector('[aria-label="Status: 24/7 Automation Active"]');
    expect(badge).toBeInTheDocument();
  });

  it('has aria-live="polite" for dynamic updates', () => {
    const { container } = render(
      <FloatingStatusBadge
        text="Processing"
        icon={Zap}
        position={{ top: '50%', left: '50%' }}
        color="purple"
      />
    );
    
    const badge = container.querySelector('[aria-live="polite"]');
    expect(badge).toBeInTheDocument();
  });

  it('marks icon as decorative with aria-hidden', () => {
    const { container } = render(
      <FloatingStatusBadge
        text="Test Status"
        icon={CheckCircle}
        position={{ top: '0', left: '0' }}
        color="green"
      />
    );
    
    const icon = container.querySelector('svg[aria-hidden="true"]');
    expect(icon).toBeInTheDocument();
  });
});
