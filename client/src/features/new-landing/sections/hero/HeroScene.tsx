import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import type { Points as ThreePoints, Group } from 'three'

import { clampPixelRatio, MAX_PIXEL_RATIO } from '../../hooks/pixelRatio'
import { COLORS } from '../../constants/colors'

/**
 * Props for {@link HeroScene}.
 */
export interface HeroSceneProps {
  /**
   * When `true`, the scene renders a single static frame with the R3F frameloop
   * set to `"demand"` (no continuous animation) (Requirements 7.9, 21.1).
   *
   * @default false
   */
  reducedMotion?: boolean
}

/** Accent palette used for the ambient backdrop — coral / cyan / gold only. */
const BACKDROP_COLORS = [COLORS.coral, COLORS.cyan, COLORS.gold] as const

/** A single low-poly floating shape descriptor. */
interface ShapeDescriptor {
  /** Stable identity for React keys (shapes never reorder, but avoids index keys). */
  id: string
  position: [number, number, number]
  color: string
  scale: number
  /** Per-shape float speed multiplier so they drift out of phase. */
  speed: number
  /** Phase offset so shapes don't bob in unison. */
  phase: number
}

/**
 * A small, fixed set of low-poly shapes positioned around the hero backdrop.
 * Kept tiny (5 shapes) so the scene stays lightweight (Requirement 22.x).
 */
const SHAPES: ShapeDescriptor[] = [
  { id: 'shape-1', position: [-2.2, 1.2, -1], color: COLORS.coral, scale: 0.55, speed: 0.7, phase: 0 },
  { id: 'shape-2', position: [2.4, 0.6, -1.5], color: COLORS.cyan, scale: 0.42, speed: 0.9, phase: 1.1 },
  { id: 'shape-3', position: [1.4, -1.4, -0.5], color: COLORS.gold, scale: 0.5, speed: 0.6, phase: 2.3 },
  { id: 'shape-4', position: [-1.8, -1.1, -1.2], color: COLORS.cyan, scale: 0.34, speed: 1.1, phase: 3.4 },
  { id: 'shape-5', position: [0.2, 1.8, -2], color: COLORS.coral, scale: 0.38, speed: 0.8, phase: 4.2 },
]

/**
 * The animated content of the hero backdrop: a cluster of slowly rotating,
 * gently bobbing low-poly shapes plus a drifting point cloud. All animation is
 * driven inside `useFrame`, which only runs while the frameloop is active. When
 * the parent sets `frameloop="demand"` (reduced motion), `useFrame` callbacks
 * are not pumped, so the scene is effectively static.
 */
const Backdrop: React.FC<{ animate: boolean }> = ({ animate }) => {
  const groupRef = useRef<Group>(null)
  const pointsRef = useRef<ThreePoints>(null)

  // Build a small static point cloud once. ~120 points in coral/cyan/gold.
  const { positions, colors } = useMemo(() => {
    const count = 120
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    // Deterministic pseudo-random so the cloud is stable across renders.
    let seed = 7
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    const hexToRgb = (hex: string): [number, number, number] => {
      const n = parseInt(hex.slice(1), 16)
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
    }
    const palette = BACKDROP_COLORS.map(hexToRgb)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() - 0.5) * 9
      pos[i * 3 + 1] = (rand() - 0.5) * 7
      pos[i * 3 + 2] = (rand() - 0.5) * 5 - 1
      const c = palette[i % palette.length]
      col[i * 3] = c[0]
      col[i * 3 + 1] = c[1]
      col[i * 3 + 2] = c[2]
    }
    return { positions: pos, colors: col }
  }, [])

  useFrame((state) => {
    if (!animate) return
    const t = state.clock.elapsedTime
    const group = groupRef.current
    if (group) {
      group.rotation.y = t * 0.08
      group.children.forEach((child, i) => {
        const shape = SHAPES[i]
        if (!shape) return
        child.position.y = shape.position[1] + Math.sin(t * shape.speed + shape.phase) * 0.25
        child.rotation.x = t * shape.speed * 0.3
        child.rotation.z = t * shape.speed * 0.2
      })
    }
    const points = pointsRef.current
    if (points) {
      points.rotation.y = t * 0.02
    }
  })

  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[5, 5, 5]} intensity={0.8} color={COLORS.cyan} />
      <pointLight position={[-5, -3, 2]} intensity={0.6} color={COLORS.coral} />

      <group ref={groupRef}>
        {SHAPES.map((shape) => (
          <mesh key={shape.id} position={shape.position} scale={shape.scale}>
            <icosahedronGeometry args={[1, 0]} />
            <meshStandardMaterial
              color={shape.color}
              emissive={shape.color}
              emissiveIntensity={0.35}
              flatShading
              roughness={0.4}
              metalness={0.1}
              transparent
              opacity={0.85}
            />
          </mesh>
        ))}
      </group>

      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colors, 3]}
          />
        </bufferGeometry>
        <pointsMaterial size={0.06} vertexColors transparent opacity={0.5} sizeAttenuation />
      </points>
    </>
  )
}

/**
 * Subtle ambient 3D backdrop for the Hero right column, rendered with React
 * Three Fiber.
 *
 * - The renderer device pixel ratio is capped at 2 via `dpr={[1, 2]}`, which
 *   resolves through {@link clampPixelRatio} (Requirement 22.2).
 * - The container reserves an explicit 100% width/height (the parent reserves
 *   the pixel box) so the canvas paints without causing layout shift
 *   (Requirements 22.1, 7.2).
 * - R3F disposes geometries, materials, and the WebGL context automatically on
 *   unmount; no manual `requestAnimationFrame` is started here, so there is no
 *   stray frame loop to cancel (Requirement 22.5).
 * - Under `reducedMotion`, the frameloop is set to `"demand"` so no continuous
 *   animation runs and only a single static frame is painted (Requirements 7.9,
 *   21.1).
 *
 * Requirements: 7.2, 7.9, 22.1, 22.2, 22.5
 */
export const HeroScene: React.FC<HeroSceneProps> = ({ reducedMotion = false }) => {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      <Canvas
        // Cap pixel ratio at 2 (Requirement 22.2). The lower bound 1 and upper
        // bound MAX_PIXEL_RATIO mirror clampPixelRatio's contract.
        dpr={[1, clampPixelRatio(MAX_PIXEL_RATIO)]}
        // Demand frameloop under reduced motion renders one static frame.
        frameloop={reducedMotion ? 'demand' : 'always'}
        camera={{ position: [0, 0, 6], fov: 50 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        style={{ width: '100%', height: '100%', background: 'transparent' }}
      >
        <Backdrop animate={!reducedMotion} />
      </Canvas>
    </div>
  )
}

HeroScene.displayName = 'HeroScene'
