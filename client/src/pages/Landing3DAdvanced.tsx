import React from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { 
  OrbitControls, 
  Environment, 
  ContactShadows, 
  Float, 
  Text3D,
  useTexture,
  PerspectiveCamera,
  SpotLight,
  Html,
  useProgress,
  useScroll,
  useTransform,
  Sphere,
  Box,
  Torus,
  Cone,
  Octahedron
} from '@react-three/drei'
import { useRef, useState, useMemo, Suspense } from 'react'
import * as THREE from 'three'
import { motion } from 'framer-motion'
import { ArrowRight, Sparkles, Zap, Brain, Users, BarChart3, Rocket, Star, CheckCircle, Play, Pause, RotateCcw, Cpu, Database, Globe, Shield } from 'lucide-react'

// Spline Robot Integration Component
const SplineRobot = () => {
  return (
    <div className="absolute inset-0 w-full h-full">
      <iframe 
        src='https://my.spline.design/genkubgreetingrobot-eQYM2EpzY6qidVbLkEIm4eve/' 
        frameBorder='0' 
        width='100%' 
        height='100%'
        className="rounded-2xl"
        style={{ 
          filter: 'drop-shadow(0 0 20px rgba(59, 130, 246, 0.3))',
          borderRadius: '1rem'
        }}
      />
    </div>
  )
}

// Floating Tech Icons
const FloatingTechIcons = () => {
  const [activeIcon, setActiveIcon] = useState(0)
  
  const icons = [
    { icon: Brain, color: "#3b82f6", position: [4, 3, -3], label: "AI" },
    { icon: Cpu, color: "#10b981", position: [-4, 2, -2], label: "ML" },
    { icon: Database, color: "#f59e0b", position: [3, -2, -4], label: "Data" },
    { icon: Globe, color: "#ef4444", position: [-3, -3, -3], label: "Cloud" },
    { icon: Shield, color: "#8b5cf6", position: [0, 4, -2], label: "Secure" },
    { icon: Zap, color: "#06b6d4", position: [5, 0, -1], label: "Fast" },
  ]
  
  return (
    <>
      {icons.map((item, index) => (
        <Float
          key={index}
          speed={1 + index * 0.2}
          rotationIntensity={0.3}
          floatIntensity={0.4}
          position={item.position as [number, number, number]}
        >
          <mesh
            onClick={() => setActiveIcon(index)}
            onPointerOver={() => setActiveIcon(index)}
            scale={activeIcon === index ? 1.3 : 1}
          >
            <sphereGeometry args={[0.15, 16, 16]} />
            <meshStandardMaterial
              color={item.color}
              metalness={0.9}
              roughness={0.1}
              emissive={activeIcon === index ? item.color : "#000000"}
              emissiveIntensity={activeIcon === index ? 0.3 : 0}
            />
          </mesh>
          <Html
            position={[0, 0.4, 0]}
            center
            distanceFactor={8}
            occlude
          >
            <div className="text-white text-xs font-bold bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/20">
              <item.icon size={14} className="inline mr-1" />
              {item.label}
            </div>
          </Html>
        </Float>
      ))}
    </>
  )
}

// Particle System
const ParticleField = ({ mousePosition }: { mousePosition: THREE.Vector2 }) => {
  const points = useRef<THREE.Points>(null!)
  const particleCount = 2000
  
  const particles = useMemo(() => {
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)
    
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 50
      positions[i * 3 + 1] = (Math.random() - 0.5) * 50
      positions[i * 3 + 2] = (Math.random() - 0.5) * 50
      
      const color = new THREE.Color()
      color.setHSL(0.6 + Math.random() * 0.2, 0.8, 0.5 + Math.random() * 0.3)
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }
    
    return { positions, colors }
  }, [])
  
  useFrame((state) => {
    if (points.current) {
      points.current.rotation.x = state.clock.elapsedTime * 0.05
      points.current.rotation.y = state.clock.elapsedTime * 0.1
      
      const positions = points.current.geometry.attributes.position.array as Float32Array
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3 + 1] += Math.sin(state.clock.elapsedTime + i) * 0.001
      }
      points.current.geometry.attributes.position.needsUpdate = true
    }
  })
  
  return (
    <points ref={points}>
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
      </bufferGeometry>
      <pointsMaterial
        size={0.02}
        vertexColors
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// Holographic Grid
const HolographicGrid = () => {
  const gridRef = useRef<THREE.Mesh>(null!)
  
  useFrame((state) => {
    if (gridRef.current) {
      gridRef.current.rotation.x = -Math.PI / 2
      gridRef.current.material.opacity = 0.1 + Math.sin(state.clock.elapsedTime) * 0.05
    }
  })
  
  return (
    <mesh ref={gridRef} position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[20, 20, 32, 32]} />
      <meshBasicMaterial
        color="#3b82f6"
        wireframe
        transparent
        opacity={0.1}
      />
    </mesh>
  )
}

// Advanced Lighting Setup
const AdvancedLighting = () => {
  return (
    <>
      {/* Main directional light */}
      <directionalLight
        position={[10, 10, 5]}
        intensity={0.5}
        castShadow
        shadow-mapSize={2048}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      
      {/* Ambient light for overall illumination */}
      <ambientLight intensity={0.2} />
      
      {/* Colored spotlights for atmosphere */}
      <SpotLight
        position={[5, 5, 5]}
        angle={0.3}
        penumbra={0.5}
        intensity={0.3}
        color="#3b82f6"
        castShadow
      />
      <SpotLight
        position={[-5, 5, 5]}
        angle={0.3}
        penumbra={0.5}
        intensity={0.3}
        color="#8b5cf6"
        castShadow
      />
      
      {/* Rim lighting */}
      <pointLight position={[0, 0, -10]} intensity={0.2} color="#06b6d4" />
    </>
  )
}

// Loading Component
const Loader = () => {
  const { progress } = useProgress()
  
  return (
    <Html center>
      <div className="flex flex-col items-center space-y-4">
        <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
        <div className="text-white text-lg font-medium">
          {Math.round(progress)}% loaded
        </div>
      </div>
    </Html>
  )
}

// Main 3D Scene
const Scene = () => {
  const [mousePosition, setMousePosition] = useState(new THREE.Vector2())
  const [isPlaying, setIsPlaying] = useState(true)
  
  const handleMouseMove = (event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    setMousePosition(new THREE.Vector2(x - 0.5, -(y - 0.5)))
  }
  
  return (
    <div 
      className="w-full h-screen relative overflow-hidden bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900"
      onMouseMove={handleMouseMove}
    >
      {/* Spline Robot Container */}
      <div className="absolute inset-0 z-10">
        <div className="w-full h-full flex items-center justify-center p-8">
          <div className="w-full max-w-4xl h-full max-h-96 relative">
            <SplineRobot />
            
            {/* Overlay Controls */}
            <div className="absolute top-4 right-4 flex space-x-2">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="bg-black/50 backdrop-blur-md text-white p-2 rounded-full hover:bg-black/70 transition-colors"
              >
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button className="bg-black/50 backdrop-blur-md text-white p-2 rounded-full hover:bg-black/70 transition-colors">
                <RotateCcw size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* 3D Background Scene */}
      <Canvas
        shadows
        camera={{ position: [0, 0, 8], fov: 75 }}
        gl={{ 
          antialias: true, 
          alpha: true,
          powerPreference: "high-performance"
        }}
        className="absolute inset-0 z-0"
      >
        <Suspense fallback={<Loader />}>
          <AdvancedLighting />
          
          {/* Environment */}
          <Environment preset="night" />
          
          {/* Particle Field */}
          <ParticleField mousePosition={mousePosition} />
          
          {/* Floating Tech Icons */}
          <FloatingTechIcons />
          
          {/* Holographic Grid */}
          <HolographicGrid />
          
          {/* Contact Shadows */}
          <ContactShadows
            position={[0, -3, 0]}
            opacity={0.3}
            scale={20}
            blur={2}
            far={4.5}
          />
          
          {/* Controls */}
          <OrbitControls
            enablePan={false}
            enableZoom={true}
            enableRotate={true}
            autoRotate={isPlaying}
            autoRotateSpeed={0.3}
            maxPolarAngle={Math.PI / 2}
            minPolarAngle={Math.PI / 3}
          />
        </Suspense>
      </Canvas>
      
      {/* UI Overlay */}
      <div className="absolute inset-0 pointer-events-none z-20">
        {/* Navigation */}
        <div className="absolute top-8 left-8 right-8 flex justify-between items-center pointer-events-auto">
          <motion.div 
            className="text-white text-3xl font-bold"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            VeeFore
          </motion.div>
          <div className="flex space-x-6">
            <motion.button 
              className="text-white/80 hover:text-white transition-colors font-medium"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
            >
              Features
            </motion.button>
            <motion.button 
              className="text-white/80 hover:text-white transition-colors font-medium"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              Pricing
            </motion.button>
            <motion.button 
              className="text-white/80 hover:text-white transition-colors font-medium"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            >
              Sign In
            </motion.button>
            <motion.button 
              className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-6 py-2 rounded-full font-medium hover:from-blue-600 hover:to-purple-600 transition-all duration-300 shadow-lg"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
            >
              Get Started
            </motion.button>
          </div>
        </div>
        
        {/* Hero Content */}
        <div className="absolute bottom-16 left-8 right-8 text-center pointer-events-auto">
          <motion.h1 
            className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.5 }}
          >
            The Future of
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Social Media
            </span>
            <br />
            is Here
          </motion.h1>
          
          <motion.p 
            className="text-xl text-white/80 mb-8 max-w-3xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.7 }}
          >
            Experience the next generation of AI-powered social media management. 
            Create, schedule, and optimize content with our advanced robotic assistant.
          </motion.p>
          
          <motion.div 
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.9 }}
          >
            <button className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-8 py-4 rounded-full font-semibold text-lg hover:from-blue-600 hover:to-purple-600 transition-all duration-300 shadow-xl hover:shadow-2xl flex items-center space-x-2">
              <span>Start Your Journey</span>
              <ArrowRight size={20} />
            </button>
            <button className="border-2 border-white/30 text-white px-8 py-4 rounded-full font-semibold text-lg hover:border-white/60 hover:bg-white/10 transition-all duration-300 backdrop-blur-sm">
              Watch Demo
            </button>
          </motion.div>
        </div>
        
        {/* Floating Stats */}
        <div className="absolute top-1/2 right-8 transform -translate-y-1/2 space-y-4 pointer-events-auto">
          {[
            { label: "AI Models", value: "50+", icon: Brain },
            { label: "Platforms", value: "12", icon: Globe },
            { label: "Users", value: "10K+", icon: Users },
            { label: "Uptime", value: "99.9%", icon: Shield }
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              className="bg-black/40 backdrop-blur-md border border-white/20 rounded-2xl p-4 text-white"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 1 + index * 0.1 }}
            >
              <div className="flex items-center space-x-3">
                <stat.icon size={20} className="text-blue-400" />
                <div>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <div className="text-sm text-white/70">{stat.label}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Main Landing3DAdvanced Component
const Landing3DAdvanced = () => {
  return (
    <div className="min-h-screen bg-black overflow-hidden">
      <Scene />
    </div>
  )
}

export default Landing3DAdvanced
