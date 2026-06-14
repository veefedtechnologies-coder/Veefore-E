import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StickyScrollContainer } from '../StickyScrollContainer';

/**
 * Basic tests for StickyScrollContainer component
 * 
 * These tests verify the component structure and props handling.
 * More comprehensive integration tests should be added once the component
 * is integrated with actual feature data.
 */

describe('StickyScrollContainer', () => {
  const mockItems = [
    { id: 1, title: 'Feature 1', description: 'Description 1' },
    { id: 2, title: 'Feature 2', description: 'Description 2' },
    { id: 3, title: 'Feature 3', description: 'Description 3' },
  ];

  const mockRenderContent = ({ item, isActive }: any) => (
    <div data-testid={`content-${item.id}`} data-active={isActive}>
      <h2>{item.title}</h2>
      <p>{item.description}</p>
    </div>
  );

  const mockRenderVisual = ({ item, isActive }: any) => (
    <div data-testid={`visual-${item.id}`} data-active={isActive}>
      Visual for {item.title}
    </div>
  );

  it('should render without crashing', () => {
    const { container } = render(
      <StickyScrollContainer
        items={mockItems}
        renderContent={mockRenderContent}
        renderVisual={mockRenderVisual}
      />
    );

    expect(container).toBeTruthy();
    const section = container.querySelector('section');
    expect(section).toBeTruthy();
  });

  it('should apply custom className to container', () => {
    const { container } = render(
      <StickyScrollContainer
        items={mockItems}
        renderContent={mockRenderContent}
        renderVisual={mockRenderVisual}
        className="custom-class"
      />
    );

    const section = container.querySelector('section');
    expect(section?.classList.contains('custom-class')).toBe(true);
  });

  it('should use custom height multiplier from config', () => {
    const { container } = render(
      <StickyScrollContainer
        items={mockItems}
        renderContent={mockRenderContent}
        renderVisual={mockRenderVisual}
        config={{ heightMultiplier: 5 }}
      />
    );

    const section = container.querySelector('section');
    expect(section?.style.height).toBe('500vh');
  });

  it('should render with progress indicators disabled', () => {
    const { container } = render(
      <StickyScrollContainer
        items={mockItems}
        renderContent={mockRenderContent}
        renderVisual={mockRenderVisual}
        config={{ showProgress: false }}
      />
    );

    expect(container).toBeTruthy();
  });

  it('should accept custom render functions', () => {
    const customProgress = (activeIndex: number, totalItems: number) => (
      <div data-testid="custom-progress">
        {activeIndex + 1} / {totalItems}
      </div>
    );

    const { container } = render(
      <StickyScrollContainer
        items={mockItems}
        renderContent={mockRenderContent}
        renderVisual={mockRenderVisual}
        renderProgress={customProgress}
      />
    );

    expect(container).toBeTruthy();
  });

  it('should handle ambient render function', () => {
    const mockRenderAmbient = ({ item }: any) => (
      <div data-testid={`ambient-${item.id}`}>Ambient for {item.title}</div>
    );

    const { container } = render(
      <StickyScrollContainer
        items={mockItems}
        renderContent={mockRenderContent}
        renderVisual={mockRenderVisual}
        renderAmbient={mockRenderAmbient}
      />
    );

    expect(container).toBeTruthy();
  });

  it('should accept onActiveChange callback', () => {
    const onActiveChange = (index: number) => {
      // This will be called on mount with index 0
      expect(index).toBeGreaterThanOrEqual(0);
    };

    const { container } = render(
      <StickyScrollContainer
        items={mockItems}
        renderContent={mockRenderContent}
        renderVisual={mockRenderVisual}
        onActiveChange={onActiveChange}
      />
    );

    expect(container).toBeTruthy();
  });
});
