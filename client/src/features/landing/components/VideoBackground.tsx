import React, { useEffect, useRef } from 'react'

interface VideoBackgroundProps {
  videoUrl: string
  className?: string
}

/**
 * VideoBackground Component
 * 
 * Lazy-loaded video background with autoplay optimization
 * Handles browser autoplay restrictions and ensures video plays
 * 
 * Requirements: 21.3, 21.5
 */
export const VideoBackground: React.FC<VideoBackgroundProps> = ({ 
  videoUrl,
  className = ''
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    console.log('[Hero Video] Initializing...')

    let playAttempt = 0
    const maxAttempts = 5

    const playVideo = async () => {
      if (playAttempt >= maxAttempts) return
      playAttempt++

      try {
        console.log(`[Hero Video] Play attempt ${playAttempt}`)
        // Force critical attributes
        video.muted = true
        video.volume = 0
        video.playsInline = true
        
        await video.play()
        console.log('[Hero Video] ✓ Playing!')
      } catch (err: any) {
        console.log(`[Hero Video] ✗ Play failed: ${err.name}`)
        if (err.name === 'NotAllowedError') {
          console.log('[Hero Video] Browser blocked autoplay - need user interaction')
        }
      }
    }

    // Prevent video from pausing
    const preventPause = (e: Event) => {
      console.log('[Hero Video] ⚠️ Pause event detected!')
      e.preventDefault()
      e.stopPropagation()
      setTimeout(() => playVideo(), 10)
    }

    video.addEventListener('pause', preventPause)

    // Try immediately
    playVideo()

    // Try when ready
    video.addEventListener('canplay', playVideo, { once: true })
    video.addEventListener('loadeddata', playVideo, { once: true })

    // Try on first interaction
    const onInteraction = () => {
      console.log('[Hero Video] User interaction detected')
      playVideo()
    }

    const events = ['touchstart', 'touchend', 'click', 'mousemove'] as const
    events.forEach(event => {
      document.addEventListener(event, onInteraction, { once: true, passive: true, capture: true })
    })

    return () => {
      video.removeEventListener('pause', preventPause)
      events.forEach(event => {
        document.removeEventListener(event, onInteraction)
      })
    }
  }, [])

  return (
    <>
      {/* Gradient Placeholder while video loads */}
      <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-[#0a1128] via-[#122143] to-[#5c3a18] z-0" />

      {/* Video Background */}
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        disableRemotePlayback
        className={`absolute inset-0 w-full h-full object-cover z-0 pointer-events-none ${className}`}
        aria-hidden="true"
        // @ts-ignore - webkit-playsinline is needed for old iOS
        webkit-playsinline="true"
        x5-playsinline="true"
        x5-video-player-type="h5"
        x5-video-player-fullscreen="true"
        onLoadedMetadata={(e) => {
          const vid = e.currentTarget
          vid.muted = true
          vid.play().catch(() => {})
        }}
        onCanPlay={(e) => {
          const vid = e.currentTarget
          vid.muted = true
          vid.play().catch(() => {})
        }}
      >
        <source src={videoUrl} type="video/mp4" />
      </video>

      {/* Subtle dark overlay for text legibility */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{ background: 'rgba(0,0,0,0.35)' }}
        aria-hidden="true"
      />
    </>
  )
}
