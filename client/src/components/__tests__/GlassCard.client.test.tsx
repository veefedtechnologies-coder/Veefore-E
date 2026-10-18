import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import GlassCard from '../GlassCard';
import * as useIsMobileHook from '../../hooks/use-is-mobile';

// Mock the useIsMobile hook
vi.mock('../../hooks/use-is-mobile', () => ({
  useIsMobile: vi.fn()
}));

describe('GlassCard', () => {
  it('should render children correctly', () => {
    vi.spyOn(useIsMobileHook, 'useIsMobile').mockReturnValue(false);
    
    render(
      <GlassCard>
        <div>Test Content</div>
      </GlassCard>
    );
    
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('should apply glass morphism styling on desktop', () => {
    vi.spyOn(useIsMobileHook, 'useIsMobile').mockReturnValue(false);
    
    const { container } = render(
      <GlassCard>
        <div>Test</div>
      </GlassCard>
    );
    
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('backdrop-blur-md');
    expect(card).toHaveClass('bg-white/[0.02]');
    expect(card).toHaveClass('border-white/10');
    expect(card).toHaveClass('rounded-2xl');
  });

  it('should use higher opacity background on mobile', () => {
    vi.spyOn(useIsMobileHook, 'useIsMobile').mockReturnValue(true);
    
    const { container } = render(
      <GlassCard>
        <div>Test</div>
      </GlassCard>
    );
    
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('bg-white/[0.04]');
  });

  it('should accept and apply custom className', () => {
    vi.spyOn(useIsMobileHook, 'useIsMobile').mockReturnValue(false);
    
    const { container } = render(
      <GlassCard className="custom-class p-8">
        <div>Test</div>
      </GlassCard>
    );
    
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('custom-class');
    expect(card).toHaveClass('p-8');
  });

  it('should apply hover styles when hover prop is true', () => {
    vi.spyOn(useIsMobileHook, 'useIsMobile').mockReturnValue(false);
    
    const { container } = render(
      <GlassCard hover={true}>
        <div>Test</div>
      </GlassCard>
    );
    
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('hover:border-white/20');
    expect(card).toHaveClass('hover:bg-white/[0.04]');
  });

  it('should not apply hover styles when hover prop is false', () => {
    vi.spyOn(useIsMobileHook, 'useIsMobile').mockReturnValue(false);
    
    const { container } = render(
      <GlassCard hover={false}>
        <div>Test</div>
      </GlassCard>
    );
    
    const card = container.firstChild as HTMLElement;
    expect(card.className).not.toContain('hover:border-white/20');
  });

  it('should show gradient on desktop when showGradient is true', () => {
    vi.spyOn(useIsMobileHook, 'useIsMobile').mockReturnValue(false);
    
    const { container } = render(
      <GlassCard showGradient={true}>
        <div>Test</div>
      </GlassCard>
    );
    
    const gradient = container.querySelector('.bg-gradient-to-br');
    expect(gradient).toBeInTheDocument();
  });

  it('should not show gradient on mobile', () => {
    vi.spyOn(useIsMobileHook, 'useIsMobile').mockReturnValue(true);
    
    const { container } = render(
      <GlassCard showGradient={true}>
        <div>Test</div>
      </GlassCard>
    );
    
    const gradient = container.querySelector('.bg-gradient-to-br');
    expect(gradient).not.toBeInTheDocument();
  });

  it('should not show gradient when showGradient is false', () => {
    vi.spyOn(useIsMobileHook, 'useIsMobile').mockReturnValue(false);
    
    const { container } = render(
      <GlassCard showGradient={false}>
        <div>Test</div>
      </GlassCard>
    );
    
    const gradient = container.querySelector('.bg-gradient-to-br');
    expect(gradient).not.toBeInTheDocument();
  });

  it('should handle onClick event', () => {
    vi.spyOn(useIsMobileHook, 'useIsMobile').mockReturnValue(false);
    const handleClick = vi.fn();
    
    const { container } = render(
      <GlassCard onClick={handleClick}>
        <div>Test</div>
      </GlassCard>
    );
    
    const card = container.firstChild as HTMLElement;
    card.click();
    
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should pass through additional HTML attributes', () => {
    vi.spyOn(useIsMobileHook, 'useIsMobile').mockReturnValue(false);
    
    const { container } = render(
      <GlassCard data-testid="my-card" aria-label="Test Card">
        <div>Test</div>
      </GlassCard>
    );
    
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveAttribute('data-testid', 'my-card');
    expect(card).toHaveAttribute('aria-label', 'Test Card');
  });
});
