import React from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { 
  OrbitControls, 
  Environment, 
  ContactShadows, 
  Float, 
  MeshDistortMaterial, 
  Sphere, 
  Box, 
  Torus, 
  Cone, 
  Octahedron,
  Text3D,
  useTexture,
  useGLTF,
  PerspectiveCamera,
  SpotLight,
  useAnimations,
  Html,
  useProgress,
  MeshWobbleMaterial,
  MeshReflectorMaterial,
  MeshTransmissionMaterial,
  useScroll,
  useTransform
} from '@react-three/drei'
import { useRef, useState, useMemo, Suspense } from 'react'
import * as THREE from 'three'
import { motion } from 'framer-motion'
import { ArrowRight, Sparkles, Zap, Brain, Users, BarChart3, Rocket, Star, CheckCircle, Play, Pause, RotateCcw } from 'lucide-react'

// Advanced Robot Model
const RobotModel = ({ mousePosition }: { mousePosition: THREE.Vector2 }) => {
  const groupRef = useRef<THREE.Group>(null!)
  const headRef = useRef<THREE.Mesh>(null!)
  const bodyRef = useRef<THREE.Mesh>(null!)
  const leftArmRef = useRef<THREE.Mesh>(null!)
  const rightArmRef = useRef<THREE.Mesh>(null!)
  const leftLegRef = useRef<THREE.Mesh>(null!)
  const rightLegRef = useRef<THREE.Mesh>(null!)
  const [hovered, setHovered] = useState(false)
  const [clicked, setClicked] = useState(false)
  const timeRef = useRef(0)
  
  useFrame((state) => {
    timeRef.current += 0.01
    
    if (groupRef.current) {
      // Subtle breathing animation
      const breathScale = 1 + Math.sin(timeRef.current * 2) * 0.02
      groupRef.current.scale.setScalar(breathScale)
      
      // Gentle swaying motion
      groupRef.current.rotation.y = mousePosition.x * 0.1 + Math.sin(timeRef.current * 0.5) * 0.05
      groupRef.current.rotation.x = mousePosition.y * 0.05 + Math.sin(timeRef.current * 0.3) * 0.02
    }
    
    // Head movement
    if (headRef.current) {
      headRef.current.rotation.y = mousePosition.x * 0.2
      headRef.current.rotation.x = mousePosition.y * 0.1
    }
    
    // Arm movement
    if (leftArmRef.current) {
      leftArmRef.current.rotation.z = Math.sin(timeRef.current * 1.5) * 0.1 + mousePosition.x * 0.1
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.z = -Math.sin(timeRef.current * 1.5) * 0.1 - mousePosition.x * 0.1
    }
    
    // Leg movement
    if (leftLegRef.current) {
      leftLegRef.current.rotation.x = Math.sin(timeRef.current * 2) * 0.05
    }
    if (rightLegRef.current) {
      rightLegRef.current.rotation.x = -Math.sin(timeRef.current * 2) * 0.05
    }
  })

  return (
    <group 
      ref={groupRef}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onClick={() => setClicked(!clicked)}
    >
      {/* Robot Head */}
      <mesh ref={headRef} position={[0, 2.5, 0]}>
        <boxGeometry args={[1.2, 1.2, 1.2]} />
        <meshStandardMaterial
          color={hovered ? "#4a90e2" : "#2c3e50"}
          metalness={0.8}
          roughness={0.2}
          emissive={clicked ? "#00ff88" : "#000000"}
        />
        {/* Eyes */}
        <mesh position={[0, 0.2, 0.6]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshStandardMaterial color="#00ff88" emissive="#00ff88" />
        </mesh>
        <mesh position={[0, 0.2, 0.6]}>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      </mesh>
      
      {/* Robot Body */}
      <mesh ref={bodyRef} position={[0, 0.5, 0]}>
        <boxGeometry args={[1.5, 2, 0.8]} />
        <meshStandardMaterial
          color={hovered ? "#34495e" : "#2c3e50"}
          metalness={0.7}
          roughness={0.3}
        />
        {/* Chest Panel */}
        <mesh position={[0, 0.3, 0.4]}>
          <boxGeometry args={[1, 0.8, 0.1]} />
          <meshStandardMaterial color="#3498db" emissive="#3498db" />
        </mesh>
      </mesh>
      
      {/* Left Arm */}
      <mesh ref={leftArmRef} position={[-1.2, 1, 0]}>
        <boxGeometry args={[0.4, 1.5, 0.4]} />
        <meshStandardMaterial
          color="#34495e"
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>
      
      {/* Right Arm */}
      <mesh ref={rightArmRef} position={[1.2, 1, 0]}>
        <boxGeometry args={[0.4, 1.5, 0.4]} />
        <meshStandardMaterial
          color="#34495e"
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>
      
      {/* Left Leg */}
      <mesh ref={leftLegRef} position={[-0.4, -1.5, 0]}>
        <boxGeometry args={[0.4, 1.5, 0.4]} />
        <meshStandardMaterial
          color="#2c3e50"
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>
      
      {/* Right Leg */}
      <mesh ref={rightLegRef} position={[0.4, -1.5, 0]}>
        <boxGeometry args={[0.4, 1.5, 0.4]} />
        <meshStandardMaterial
          color="#2c3e50"
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>
    </group>
  )
}

// Wave System
const WaveSystem = ({ mousePosition }: { mousePosition: THREE.Vector2 }) => {
  const waveRef = useRef<THREE.Mesh>(null!)
  const timeRef = useRef(0)
  
  useFrame((state) => {
    timeRef.current += 0.02
    
    if (waveRef.current) {
      const positions = waveRef.current.geometry.attributes.position.array as Float32Array
      const count = positions.length / 3
      
      for (let i = 0; i < count; i++) {
        const i3 = i * 3
        const x = positions[i3]
        const z = positions[i3 + 2]
        
        // Create wave pattern
        const wave1 = Math.sin(x * 0.5 + timeRef.current) * 0.3
        const wave2 = Math.cos(z * 0.3 + timeRef.current * 1.2) * 0.2
        const wave3 = Math.sin(x * 0.2 + z * 0.2 + timeRef.current * 0.8) * 0.15
        
        // Mouse interaction creates ripples
        const mouseInfluence = Math.exp(-Math.sqrt(x * x + z * z) * 0.3) * 
          Math.sin(timeRef.current * 4) * mousePosition.length() * 0.5
        
        positions[i3 + 1] = wave1 + wave2 + wave3 + mouseInfluence
      }
      
      waveRef.current.geometry.attributes.position.needsUpdate = true
      waveRef.current.geometry.computeVertexNormals()
    }
  })
  
  return (
    <mesh ref={waveRef} position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[20, 20, 64, 64]} />
      <meshStandardMaterial
        color="#4a90e2"
        transparent
        opacity={0.6}
        wireframe={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

// Floating Data Particles
const DataParticles = ({ mousePosition }: { mousePosition: THREE.Vector2 }) => {
  const pointsRef = useRef<THREE.Points>(null!)
  const particleCount = 1000
  const timeRef = useRef(0)
  
  const particles = useMemo(() => {
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)
    const sizes = new Float32Array(particleCount)
    
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3
      
      // Create data stream pattern
      const angle = (i / particleCount) * Math.PI * 2
      const radius = 8 + Math.sin(i * 0.1) * 2
      const height = (Math.random() - 0.5) * 10
      
      positions[i3] = Math.cos(angle) * radius
      positions[i3 + 1] = height
      positions[i3 + 2] = Math.sin(angle) * radius
      
      // Color based on height
      const color = new THREE.Color().setHSL(
        (height + 5) / 10 * 0.3 + 0.5,
        0.8,
        0.6
      )
      colors[i3] = color.r
      colors[i3 + 1] = color.g
      colors[i3 + 2] = color.b
      
      sizes[i] = Math.random() * 2 + 1
    }
    
    return { positions, colors, sizes }
  }, [])
  
  useFrame((state) => {
    timeRef.current += 0.01
    
    if (pointsRef.current) {
      const positions = pointsRef.current.geometry.attributes.position.array as Float32Array
      
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3
        const originalY = positions[i3 + 1]
        positions[i3 + 1] = originalY + Math.sin(timeRef.current + i * 0.01) * 0.1
      }
      
      pointsRef.current.geometry.attributes.position.needsUpdate = true
      pointsRef.current.rotation.y = timeRef.current * 0.1
    }
  })
  
  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={particles.positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={particleCount}
          array={particles.colors}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={particleCount}
          array={particles.sizes}
          itemSize={1}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.1}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// Floating UI Elements
const FloatingUI = () => {
  const [activeElement, setActiveElement] = useState(0)
  
  const elements = [
    { icon: Brain, color: "#4a90e2", position: [3, 2, -2] },
    { icon: Zap, color: "#00ff88", position: [-3, 1, -1] },
    { icon: Users, color: "#ff6b6b", position: [2, -1, -3] },
    { icon: BarChart3, color: "#f39c12", position: [-2, -2, -2] },
  ]
  
  return (
    <>
      {elements.map((element, index) => (
        <Float
          key={index}
          speed={1 + index * 0.3}
          rotationIntensity={0.5}
          floatIntensity={0.5}
          position={element.position as [number, number, number]}
        >
          <mesh
            onClick={() => setActiveElement(index)}
            onPointerOver={() => setActiveElement(index)}
            scale={activeElement === index ? 1.2 : 1}
          >
            <sphereGeometry args={[0.2, 16, 16]} />
            <meshStandardMaterial
              color={element.color}
              metalness={0.8}
              roughness={0.2}
              emissive={activeElement === index ? element.color : "#000000"}
            />
          </mesh>
          <Html
            position={[0, 0.5, 0]}
            center
            distanceFactor={10}
            occlude
          >
            <div className="text-white text-xs font-medium bg-black/50 backdrop-blur-sm px-2 py-1 rounded">
              <element.icon size={12} />
            </div>
          </Html>
        </Float>
      ))}
    </>
  )
}

// Advanced Lighting Setup
const AdvancedLighting = () => {
  return (
    <>
      {/* Main Directional Light */}
      <directionalLight
        position={[10, 10, 5]}
        intensity={2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      
      {/* Ambient Light */}
      <ambientLight intensity={0.4} />
      
      {/* Colored Point Lights */}
      <pointLight position={[5, 5, 5]} color="#4a90e2" intensity={1} />
      <pointLight position={[-5, 5, 5]} color="#00ff88" intensity={1} />
      <pointLight position={[0, -5, 5]} color="#ff6b6b" intensity={1} />
      
      {/* Spot Light */}
      <SpotLight
        position={[0, 10, 0]}
        angle={0.3}
        penumbra={1}
        intensity={2}
        color="#ffffff"
        castShadow
      />
    </>
  )
}

// Loading Component
const Loader = () => {
  const { progress } = useProgress()
  return (
    <Html center>
      <div className="flex flex-col items-center space-y-4">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-white text-lg font-medium">
          Loading AI Experience...
        </div>
        <div className="w-48 bg-gray-700 rounded-full h-2">
          <div 
            className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>
    </Html>
  )
}

// Main 3D Scene
const Scene = () => {
  const [mousePosition, setMousePosition] = useState(new THREE.Vector2())
  
  const handleMouseMove = (event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    setMousePosition(new THREE.Vector2(x - 0.5, -(y - 0.5)))
  }
  
  return (
    <div 
      className="w-full h-screen relative overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      <Canvas
        shadows
        camera={{ position: [0, 0, 8], fov: 75 }}
        gl={{ 
          antialias: true, 
          alpha: true,
          powerPreference: "high-performance"
        }}
      >
        <Suspense fallback={<Loader />}>
          <AdvancedLighting />
          
          {/* Environment */}
          <Environment preset="studio" />
          
          {/* Robot Model */}
          <RobotModel mousePosition={mousePosition} />
          
          {/* Wave System */}
          <WaveSystem mousePosition={mousePosition} />
          
          {/* Data Particles */}
          <DataParticles mousePosition={mousePosition} />
          
          {/* Floating UI Elements */}
          <FloatingUI />
          
          {/* Contact Shadows */}
          <ContactShadows
            position={[0, -3, 0]}
            opacity={0.4}
            scale={20}
            blur={2}
            far={4.5}
          />
          
          {/* Controls */}
          <OrbitControls
            enablePan={false}
            enableZoom={true}
            enableRotate={true}
            autoRotate={true}
            autoRotateSpeed={0.5}
            maxPolarAngle={Math.PI / 2}
            minPolarAngle={Math.PI / 3}
          />
        </Suspense>
      </Canvas>
      
      {/* UI Overlay */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-8 left-8 right-8 flex justify-between items-center pointer-events-auto">
          <div className="text-white text-2xl font-bold">
            VeeFore
          </div>
          <div className="flex space-x-4">
            <button className="text-white/80 hover:text-white transition-colors">
              Classic View
            </button>
            <button className="text-white/80 hover:text-white transition-colors">
              Sign In
            </button>
            <button className="bg-white text-black px-6 py-2 rounded-full font-medium hover:bg-white/90 transition-colors">
              Get Started
            </button>
          </div>
        </div>
        
        <div className="absolute bottom-8 left-8 right-8 text-center pointer-events-auto">
          <motion.h1 
            className="text-6xl md:text-8xl font-bold text-white mb-6"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
          >
            AI-Powered
            <br />
            <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Social Media
            </span>
          </motion.h1>
          
          <motion.p 
            className="text-xl text-white/80 mb-8 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.3 }}
          >
            Transform your social media presence with advanced AI that creates, 
            schedules, and optimizes content across all platforms.
          </motion.p>
          
          <motion.div 
            className="flex flex-col sm:flex-row gap-4 justify-center"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.6 }}
          >
            <button className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-8 py-4 rounded-full font-medium text-lg hover:from-blue-600 hover:to-purple-600 transition-all duration-300 flex items-center justify-center space-x-2">
              <span>Start Free Trial</span>
              <ArrowRight size={20} />
            </button>
            <button className="border-2 border-white/30 text-white px-8 py-4 rounded-full font-medium text-lg hover:bg-white/10 transition-all duration-300 flex items-center justify-center space-x-2">
              <Play size={20} />
              <span>Watch Demo</span>
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

// Main Landing3D Component
const Landing3D = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
      <Scene />
    </div>
  )
}

export default Landing3D