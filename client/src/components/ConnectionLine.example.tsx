import React from 'react';
import ConnectionLine from './ConnectionLine';

/**
 * ConnectionLine Usage Examples
 * 
 * This file demonstrates various ways to use the ConnectionLine component
 * in different scenarios.
 */

// Example 1: Single Connection Line
export function SingleLineExample() {
  return (
    <div className="relative w-full h-96 bg-black border border-white/10 rounded-lg">
      <ConnectionLine
        startPos={{ x: 50, y: 50 }}
        endPos={{ x: 350, y: 250 }}
        delay={0}
      />
      
      {/* Visual markers for demonstration */}
      <div className="absolute w-4 h-4 bg-blue-500 rounded-full" style={{ left: 46, top: 46 }} />
      <div className="absolute w-4 h-4 bg-purple-500 rounded-full" style={{ left: 346, top: 246 }} />
    </div>
  );
}

// Example 2: Multiple Lines with Staggered Animation
export function StaggeredLinesExample() {
  const connections = [
    { start: { x: 100, y: 100 }, end: { x: 300, y: 200 }, delay: 0 },
    { start: { x: 500, y: 100 }, end: { x: 300, y: 200 }, delay: 0.5 },
    { start: { x: 100, y: 300 }, end: { x: 300, y: 200 }, delay: 1.0 },
    { start: { x: 500, y: 300 }, end: { x: 300, y: 200 }, delay: 1.5 },
  ];

  return (
    <div className="relative w-full h-96 bg-black border border-white/10 rounded-lg">
      {connections.map((conn, i) => (
        <ConnectionLine
          key={i}
          startPos={conn.start}
          endPos={conn.end}
          delay={conn.delay}
        />
      ))}
      
      {/* Center point marker */}
      <div 
        className="absolute w-6 h-6 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full"
        style={{ left: 294, top: 194 }}
      />
    </div>
  );
}

// Example 3: Dynamic Calculation with Card Positions
export function DynamicPositionExample() {
  // Simulate feature card positions
  const featureCards = [
    { id: 1, x: 80, y: 80, title: 'Feature 1' },
    { id: 2, x: 520, y: 80, title: 'Feature 2' },
    { id: 3, x: 80, y: 320, title: 'Feature 3' },
    { id: 4, x: 520, y: 320, title: 'Feature 4' },
  ];

  const centerOrb = { x: 300, y: 200 };
  const cardSize = { width: 120, height: 80 };

  // Calculate connection points (center of each card)
  const getCardCenter = (card: typeof featureCards[0]) => ({
    x: card.x + cardSize.width / 2,
    y: card.y + cardSize.height / 2,
  });

  return (
    <div className="relative w-full h-96 bg-black border border-white/10 rounded-lg">
      {/* Connection lines */}
      {featureCards.map((card, i) => (
        <ConnectionLine
          key={card.id}
          startPos={getCardCenter(card)}
          endPos={centerOrb}
          delay={i * 0.5}
        />
      ))}

      {/* Feature cards */}
      {featureCards.map((card) => (
        <div
          key={card.id}
          className="absolute bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-white text-sm"
          style={{
            left: card.x,
            top: card.y,
            width: cardSize.width,
            height: cardSize.height,
          }}
        >
          {card.title}
        </div>
      ))}

      {/* Center orb */}
      <div
        className="absolute w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-white text-xs font-bold"
        style={{ left: centerOrb.x - 32, top: centerOrb.y - 32 }}
      >
        Center
      </div>
    </div>
  );
}

// Example 4: Responsive Layout with useRef for Dynamic Positioning
export function ResponsiveExample() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [orbPosition, setOrbPosition] = React.useState({ x: 0, y: 0 });
  const [cardPositions, setCardPositions] = React.useState<Array<{ x: number; y: number }>>([]);

  React.useEffect(() => {
    const updatePositions = () => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      setOrbPosition({ x: centerX, y: centerY });

      // Position cards in a circle around center
      const radius = Math.min(centerX, centerY) * 0.6;
      const cardCount = 4;
      const positions = Array.from({ length: cardCount }, (_, i) => {
        const angle = (i * 2 * Math.PI) / cardCount - Math.PI / 2;
        return {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        };
      });

      setCardPositions(positions);
    };

    updatePositions();
    window.addEventListener('resize', updatePositions);
    return () => window.removeEventListener('resize', updatePositions);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-96 bg-black border border-white/10 rounded-lg">
      {cardPositions.length > 0 && (
        <>
          {/* Connection lines */}
          {cardPositions.map((pos, i) => (
            <ConnectionLine
              key={i}
              startPos={pos}
              endPos={orbPosition}
              delay={i * 0.5}
            />
          ))}

          {/* Cards */}
          {cardPositions.map((pos, i) => (
            <div
              key={i}
              className="absolute w-8 h-8 bg-blue-500 rounded-full -translate-x-4 -translate-y-4"
              style={{ left: pos.x, top: pos.y }}
            />
          ))}

          {/* Center orb */}
          <div
            className="absolute w-12 h-12 bg-purple-500 rounded-full -translate-x-6 -translate-y-6"
            style={{ left: orbPosition.x, top: orbPosition.y }}
          />
        </>
      )}
    </div>
  );
}

// Example 5: Integration Pattern for GrowthEngineSection
export function GrowthEngineSectionIntegrationExample() {
  // This is a simplified version showing the integration pattern
  // In the actual implementation, positions would be calculated based on
  // the actual feature card and center orb DOM elements

  const features = [
    { id: 1, title: 'AI Caption Engine', position: 'left-top' },
    { id: 2, title: 'Smart Scheduler', position: 'right-top' },
    { id: 3, title: 'Competitor Intel', position: 'left-bottom' },
    { id: 4, title: 'Adaptive Learning', position: 'right-bottom' },
  ];

  // Simulated positions - in real implementation, calculate from refs
  const positions = {
    'left-top': { x: 100, y: 100 },
    'right-top': { x: 500, y: 100 },
    'left-bottom': { x: 100, y: 300 },
    'right-bottom': { x: 500, y: 300 },
    center: { x: 300, y: 200 },
  };

  return (
    <div className="relative w-full h-96 bg-black border border-white/10 rounded-lg">
      {/* Connection lines layer (z-index: 0) */}
      <div className="absolute inset-0" style={{ zIndex: 0 }}>
        {features.map((feature, i) => (
          <ConnectionLine
            key={feature.id}
            startPos={positions[feature.position as keyof typeof positions]}
            endPos={positions.center}
            delay={i * 0.5}
          />
        ))}
      </div>

      {/* Content layer (z-index: 10) */}
      <div className="absolute inset-0" style={{ zIndex: 10 }}>
        {features.map((feature) => {
          const pos = positions[feature.position as keyof typeof positions];
          return (
            <div
              key={feature.id}
              className="absolute bg-white/5 border border-white/10 rounded-lg p-4 text-white text-xs"
              style={{
                left: pos.x - 60,
                top: pos.y - 30,
                width: 120,
                height: 60,
              }}
            >
              {feature.title}
            </div>
          );
        })}

        <div
          className="absolute w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-white text-xs font-bold"
          style={{
            left: positions.center.x - 32,
            top: positions.center.y - 32,
          }}
        >
          Central AI
        </div>
      </div>
    </div>
  );
}

// Example 6: Hidden on Mobile (Responsive Design)
export function ResponsiveVisibilityExample() {
  return (
    <div className="relative w-full h-96 bg-black border border-white/10 rounded-lg">
      {/* Connection lines hidden on mobile, shown on desktop */}
      <div className="hidden lg:block">
        <ConnectionLine
          startPos={{ x: 100, y: 150 }}
          endPos={{ x: 400, y: 250 }}
          delay={0}
        />
        <ConnectionLine
          startPos={{ x: 700, y: 150 }}
          endPos={{ x: 400, y: 250 }}
          delay={0.5}
        />
      </div>

      {/* Content visible on all screen sizes */}
      <div className="absolute inset-0 flex items-center justify-center">
        <p className="text-white text-sm">
          Connection lines hidden on mobile (resize to see)
        </p>
      </div>
    </div>
  );
}

// Export all examples for demonstration
export default {
  SingleLineExample,
  StaggeredLinesExample,
  DynamicPositionExample,
  ResponsiveExample,
  GrowthEngineSectionIntegrationExample,
  ResponsiveVisibilityExample,
};
