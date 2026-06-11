import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import GradientOrb from './GradientOrb';

describe('GradientOrb', () => {
  it('renders without crashing', () => {
    const { container } = render(<GradientOrb />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('applies default blue color', () => {
    const { container } = render(<GradientOrb />);
    const orb = container.firstChild as HTMLElement;
    expect(orb.className).toContain('bg-blue-400/40');
  });

  it('applies purple color when specified', () => {
    const { container } = render(<GradientOrb color="purple" />);
    const orb = container.firstChild as HTMLElement;
    expect(orb.className).toContain('bg-purple-400/40');
  });

  it('applies indigo color when specified', () => {
    const { container } = render(<GradientOrb color="indigo" />);
    const orb = container.firstChild as HTMLElement;
    expect(orb.className).toContain('bg-indigo-400/40');
  });

  it('applies cyan color when specified', () => {
    const { container } = render(<GradientOrb color="cyan" />);
    const orb = container.firstChild as HTMLElement;
    expect(orb.className).toContain('bg-cyan-400/40');
  });

  it('applies GPU-accelerated transforms', () => {
    const { container } = render(<GradientOrb />);
    const orb = container.firstChild as HTMLElement;
    expect(orb.style.transform).toBe('translateZ(0)');
    expect(orb.style.willChange).toBe('transform');
    expect(orb.style.backfaceVisibility).toBe('hidden');
  });

  it('applies blur-3xl class', () => {
    const { container } = render(<GradientOrb />);
    const orb = container.firstChild as HTMLElement;
    expect(orb.className).toContain('blur-3xl');
  });

  it('applies rounded-full class', () => {
    const { container } = render(<GradientOrb />);
    const orb = container.firstChild as HTMLElement;
    expect(orb.className).toContain('rounded-full');
  });

  it('applies absolute positioning', () => {
    const { container } = render(<GradientOrb />);
    const orb = container.firstChild as HTMLElement;
    expect(orb.className).toContain('absolute');
  });

  it('merges custom className prop', () => {
    const { container } = render(<GradientOrb className="w-96 h-96 top-0 left-0" />);
    const orb = container.firstChild as HTMLElement;
    expect(orb.className).toContain('w-96');
    expect(orb.className).toContain('h-96');
    expect(orb.className).toContain('top-0');
    expect(orb.className).toContain('left-0');
  });
});
