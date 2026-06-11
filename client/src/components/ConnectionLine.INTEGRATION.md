# ConnectionLine Integration Guide for GrowthEngineSection

## Overview

This guide explains how to integrate the `ConnectionLine` component into the existing `GrowthEngineSection` to create animated connection lines between feature cards and the center orb.

## Current State

The GrowthEngineSection currently displays:
- 4 feature cards (2 on left, 2 on right)
- Central intelligence orb in the middle
- Orbit rings around the center orb
- Horizontal shimmer lines connecting cards to the center area (using simple divs)

## Integration Steps

### Step 1: Import ConnectionLine

Add the import at the top of `GrowthEngineSection.tsx`:

```tsx
import ConnectionLine from './ConnectionLine';
```

### Step 2: Add Refs for Position Tracking

Add refs to track the positions of feature cards and center orb:

```tsx
const GrowthEngineSection = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const centerOrbRef = useRef<HTMLDivElement>(null);
    const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
    
    const [connections, setConnections] = useState<Array<{
        start: { x: number; y: number };
        end: { x: number; y: number };
        delay: number;
    }>>([]);
```

### Step 3: Calculate Connection Positions

Add a useEffect to calculate connection line positions:

```tsx
useEffect(() => {
    const calculatePositions = () => {
        if (!containerRef.current || !centerOrbRef.current) return;
        
        const containerRect = containerRef.current.getBoundingClientRect();
        const orbRect = centerOrbRef.current.getBoundingClientRect();
        
        const orbCenter = {
            x: orbRect.left - containerRect.left + orbRect.width / 2,
            y: orbRect.top - containerRect.top + orbRect.height / 2,
        };
        
        const newConnections = cardRefs.current
            .filter(ref => ref !== null)
            .map((cardRef, i) => {
                const cardRect = cardRef!.getBoundingClientRect();
                const cardCenter = {
                    x: cardRect.left - containerRect.left + cardRect.width / 2,
                    y: cardRect.top - containerRect.top + cardRect.height / 2,
                };
                
                return {
                    start: cardCenter,
                    end: orbCenter,
                    delay: i * 0.5,
                };
            });
        
        setConnections(newConnections);
    };
    
    // Calculate on mount and resize
    calculatePositions();
    window.addEventListener('resize', calculatePositions);
    
    return () => window.removeEventListener('resize', calculatePositions);
}, []);
```

### Step 4: Update Feature Card to Include Refs

Modify the FeatureCard component to accept and use refs:

```tsx
const FeatureCard = React.memo(({ 
    feature, 
    index, 
    isLeft,
    cardRef 
}: { 
    feature: FeatureType, 
    index: number, 
    isLeft: boolean,
    cardRef: (el: HTMLDivElement | null) => void
}) => {
    return (
        <div
            ref={cardRef}
            className="group relative"
            style={{ ...GPU_ACCELERATED_STYLES }}
        >
            {/* Remove existing horizontal shimmer line */}
            {/* <div className={`hidden lg:block absolute top-1/2 ${isLeft ? '-right-24' : '-left-24'} w-24 h-[2px] ...`}> */}
            
            <TiltCard maxTilt={8} scale={1.02}>
                {/* Rest of the card content */}
            </TiltCard>
        </div>
    );
});
```

### Step 5: Add ConnectionLine Layer

Add a dedicated layer for connection lines in the section layout:

```tsx
return (
    <section className="py-24 md:py-32 relative w-full overflow-hidden bg-black" style={GPU_ACCELERATED_STYLES}>
        {/* Background layers */}
        <div className="absolute inset-0 bg-[radial-gradient...]" />
        
        <div className="max-w-7xl mx-auto px-6 relative z-10">
            {/* Header section */}
            
            <div ref={containerRef} className="relative flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-24">
                
                {/* Connection Lines Layer - Hidden on mobile */}
                <div className="hidden lg:block absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
                    {connections.map((conn, i) => (
                        <ConnectionLine
                            key={i}
                            startPos={conn.start}
                            endPos={conn.end}
                            delay={conn.delay}
                        />
                    ))}
                </div>
                
                {/* Left feature cards */}
                <div className="flex flex-col gap-8 w-full lg:w-1/3 order-2 lg:order-1" style={{ zIndex: 10 }}>
                    {[features[0], features[2]].map((feature, i) => (
                        <FeatureCard 
                            key={i} 
                            feature={feature} 
                            index={i} 
                            isLeft={true}
                            cardRef={el => cardRefs.current[i * 2] = el}
                        />
                    ))}
                </div>
                
                {/* Center orb */}
                <div className="relative w-full lg:w-1/3 flex justify-center order-1 lg:order-2 py-8 sm:py-12 lg:py-0" style={{ zIndex: 10 }}>
                    <div ref={centerOrbRef} className="relative w-56 h-56 sm:w-72 sm:h-72 md:w-96 md:h-96">
                        {/* Center orb content */}
                    </div>
                </div>
                
                {/* Right feature cards */}
                <div className="flex flex-col gap-8 w-full lg:w-1/3 order-3" style={{ zIndex: 10 }}>
                    {[features[1], features[3]].map((feature, i) => (
                        <FeatureCard 
                            key={i} 
                            feature={feature} 
                            index={i} 
                            isLeft={false}
                            cardRef={el => cardRefs.current[i * 2 + 1] = el}
                        />
                    ))}
                </div>
                
            </div>
        </div>
    </section>
);
```

## Alternative: Simple Static Implementation

If you prefer a simpler static approach without dynamic calculation:

```tsx
<div className="relative flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-24">
    {/* Connection Lines - Fixed positions for desktop */}
    <div className="hidden lg:block absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        {/* Approximate positions based on layout */}
        <ConnectionLine
            startPos={{ x: 200, y: 150 }}  // Left top card
            endPos={{ x: 500, y: 300 }}     // Center orb
            delay={0}
        />
        <ConnectionLine
            startPos={{ x: 200, y: 450 }}  // Left bottom card
            endPos={{ x: 500, y: 300 }}
            delay={0.5}
        />
        <ConnectionLine
            startPos={{ x: 800, y: 150 }}  // Right top card
            endPos={{ x: 500, y: 300 }}
            delay={1.0}
        />
        <ConnectionLine
            startPos={{ x: 800, y: 450 }}  // Right bottom card
            endPos={{ x: 500, y: 300 }}
            delay={1.5}
        />
    </div>
    
    {/* Rest of the layout */}
</div>
```

## Key Considerations

### Z-Index Layering

Ensure proper layering:
- Background effects: z-index 0
- Connection lines: z-index 0 (above background, below cards)
- Feature cards and center orb: z-index 10 (above lines)

### Responsive Behavior

- **Desktop (lg+)**: Show connection lines with full animations
- **Tablet & Mobile**: Hide connection lines using `hidden lg:block` to improve performance
- The horizontal shimmer lines in FeatureCard should be removed as they're replaced by ConnectionLine

### Performance

- Connection lines use GPU-accelerated SVG animations
- `pointer-events-none` ensures they don't interfere with interactions
- Hidden on mobile to reduce animation overhead
- Dynamic position calculation only runs on mount and resize (throttled)

### Visual Polish

- Remove the existing horizontal shimmer divs from FeatureCard
- Ensure the center orb has a slight scale animation on hover (already implemented)
- Connection lines automatically inherit the shimmer timing from their delay prop

## Testing After Integration

1. **Visual Test**: Check that lines connect accurately from card centers to orb center
2. **Animation Test**: Verify shimmer effect travels along lines with staggered timing
3. **Responsive Test**: Confirm lines are hidden on mobile/tablet viewports
4. **Interaction Test**: Ensure lines don't interfere with card hover effects
5. **Performance Test**: Monitor FPS during animations (should maintain 60fps)

## Troubleshooting

### Lines Not Appearing

- Check z-index values
- Verify container has `position: relative`
- Ensure refs are properly assigned
- Check viewport width (lines hidden on < 1024px)

### Incorrect Positions

- Verify containerRef and centerOrbRef are attached
- Check that getBoundingClientRect() calculations account for scroll position
- Ensure calculations run after layout is complete

### Animation Not Smooth

- Verify GPU acceleration styles are applied
- Check that multiple gradients have unique IDs (based on delay)
- Ensure animations respect prefers-reduced-motion

## Next Steps

After integrating ConnectionLine:

1. Remove old horizontal shimmer lines from FeatureCard
2. Test on multiple screen sizes
3. Verify accessibility (animations respect prefers-reduced-motion)
4. Fine-tune animation delays for optimal visual effect
5. Consider adding hover effects (e.g., brighten line when card is hovered)

## Complete Modified GrowthEngineSection Example

See the example file at `ConnectionLine.example.tsx` for a complete implementation pattern showing how to integrate with refs and dynamic position calculation.
