import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ConnectionLine from '../ConnectionLine';

describe('ConnectionLine Component', () => {
  const defaultProps = {
    startPos: { x: 100, y: 100 },
    endPos: { x: 300, y: 300 },
    delay: 0.5
  };

  it('should render an SVG element', () => {
    const { container } = render(<ConnectionLine {...defaultProps} />);
    const svg = container.querySelector('svg');
    
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass('absolute', 'inset-0', 'pointer-events-none');
  });

  it('should render two line elements (base and shimmer)', () => {
    const { container } = render(<ConnectionLine {...defaultProps} />);
    const lines = container.querySelectorAll('line');
    
    expect(lines).toHaveLength(2);
  });

  it('should apply correct coordinates to lines', () => {
    const { container } = render(<ConnectionLine {...defaultProps} />);
    const lines = container.querySelectorAll('line');
    
    lines.forEach(line => {
      expect(line.getAttribute('x1')).toBe('100');
      expect(line.getAttribute('y1')).toBe('100');
      expect(line.getAttribute('x2')).toBe('300');
      expect(line.getAttribute('y2')).toBe('300');
    });
  });

  it('should apply dashed stroke pattern to both lines', () => {
    const { container } = render(<ConnectionLine {...defaultProps} />);
    const lines = container.querySelectorAll('line');
    
    lines.forEach(line => {
      expect(line.getAttribute('stroke-dasharray')).toBe('4 4');
    });
  });

  it('should create a unique gradient ID based on delay', () => {
    const { container } = render(<ConnectionLine {...defaultProps} />);
    const gradient = container.querySelector('linearGradient');
    
    expect(gradient).toBeInTheDocument();
    expect(gradient?.getAttribute('id')).toBe('shimmer-0.5');
  });

  it('should apply gradient URL to shimmer line', () => {
    const { container } = render(<ConnectionLine {...defaultProps} />);
    const lines = container.querySelectorAll('line');
    const shimmerLine = lines[1]; // Second line is the shimmer line
    
    expect(shimmerLine.getAttribute('stroke')).toContain('url(#shimmer-0.5)');
  });

  it('should apply animation delay to gradient animations', () => {
    const { container } = render(<ConnectionLine {...defaultProps} />);
    const animations = container.querySelectorAll('animate');
    
    animations.forEach(animation => {
      expect(animation.getAttribute('begin')).toBe('0.5s');
    });
  });

  it('should set animation duration to 2 seconds', () => {
    const { container } = render(<ConnectionLine {...defaultProps} />);
    const animations = container.querySelectorAll('animate');
    
    animations.forEach(animation => {
      expect(animation.getAttribute('dur')).toBe('2s');
    });
  });

  it('should set animation to repeat infinitely', () => {
    const { container } = render(<ConnectionLine {...defaultProps} />);
    const animations = container.querySelectorAll('animate');
    
    animations.forEach(animation => {
      expect(animation.getAttribute('repeatCount')).toBe('indefinite');
    });
  });

  it('should position base line with subtle white color', () => {
    const { container } = render(<ConnectionLine {...defaultProps} />);
    const lines = container.querySelectorAll('line');
    const baseLine = lines[0]; // First line is the base line
    
    expect(baseLine.getAttribute('stroke')).toBe('rgba(255, 255, 255, 0.05)');
  });

  it('should apply stroke width of 2 to both lines', () => {
    const { container } = render(<ConnectionLine {...defaultProps} />);
    const lines = container.querySelectorAll('line');
    
    lines.forEach(line => {
      expect(line.getAttribute('stroke-width')).toBe('2');
    });
  });

  it('should render with different delay values', () => {
    const { container } = render(
      <ConnectionLine 
        startPos={{ x: 50, y: 50 }} 
        endPos={{ x: 200, y: 200 }} 
        delay={1.5} 
      />
    );
    
    const gradient = container.querySelector('linearGradient');
    const animations = container.querySelectorAll('animate');
    
    expect(gradient?.getAttribute('id')).toBe('shimmer-1.5');
    animations.forEach(animation => {
      expect(animation.getAttribute('begin')).toBe('1.5s');
    });
  });

  it('should handle different coordinate positions', () => {
    const { container } = render(
      <ConnectionLine 
        startPos={{ x: 0, y: 0 }} 
        endPos={{ x: 500, y: 400 }} 
        delay={0} 
      />
    );
    
    const lines = container.querySelectorAll('line');
    
    lines.forEach(line => {
      expect(line.getAttribute('x1')).toBe('0');
      expect(line.getAttribute('y1')).toBe('0');
      expect(line.getAttribute('x2')).toBe('500');
      expect(line.getAttribute('y2')).toBe('400');
    });
  });

  it('should create gradient with proper stop colors', () => {
    const { container } = render(<ConnectionLine {...defaultProps} />);
    const stops = container.querySelectorAll('stop');
    
    expect(stops).toHaveLength(5);
    
    // Check that gradient has transparent ends and colored middle
    expect(stops[0].getAttribute('stop-color')).toBe('transparent');
    expect(stops[1].getAttribute('stop-color')).toBe('transparent');
    expect(stops[2].getAttribute('stop-color')).toBe('rgba(99, 102, 241, 0.6)');
    expect(stops[3].getAttribute('stop-color')).toBe('transparent');
    expect(stops[4].getAttribute('stop-color')).toBe('transparent');
  });

  it('should apply strokeLinecap to shimmer line', () => {
    const { container } = render(<ConnectionLine {...defaultProps} />);
    const lines = container.querySelectorAll('line');
    const shimmerLine = lines[1];
    
    expect(shimmerLine.getAttribute('stroke-linecap')).toBe('round');
  });

  it('should have proper z-index for layering', () => {
    const { container } = render(<ConnectionLine {...defaultProps} />);
    const svg = container.querySelector('svg');
    
    expect(svg).toHaveStyle({ zIndex: 0 });
  });
});
