import React, { useState, useEffect } from 'react';
import { SEO, seoConfig, generateStructuredData } from '@/lib/seo-optimization';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

// Add CSS for slide-right animation
const slideRightCSS = `
  .slide-right {
    animation: slideRight 0.6s ease-out forwards;
    opacity: 0;
    transform: translateX(-30px);
  }
  
  @keyframes slideRight {
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
`;

// Inject CSS
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = slideRightCSS;
  document.head.appendChild(style);
}
import { Progress } from '@/components/ui/progress';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useUser } from '@/hooks/useUser';
import veeforceLogo from '@assets/output-onlinepngtools_1754815000405.png';
import { 
  Video, 
  Play, 
  Download, 
  Settings, 
  Eye, 
  Clock,
  Palette,
  Music,
  Mic,
  User,
  Globe,
  Sparkles,
  FileText,
  Clapperboard,
  Wand2,
  DollarSign,
  Zap,
  Timer,
  Monitor,
  ArrowLeft,
  Info,
  AlertCircle,
  X,
  Camera,
  Image
} from 'lucide-react';

interface ScriptScene {
  id: string;
  duration: number;
  description: string;
  visualStyle?: string;
  voiceover?: string;
  visualElements?: string;
  narration?: string;
  imagePrompt?: string;
}

interface GeneratedScript {
  title: string;
  totalDuration: number;
  scenes: ScriptScene[];
  hook: string;
  callToAction: string;
  fullScript?: string;
}

const VideoGeneratorAdvanced = () => {
  const { userData, loading: userLoading, user: firebaseUser } = useUser();

  // Real AI Image generation function
  const startImageGeneration = async () => {
    if (!generatedScript) return;
    
    // Reset states
    setGeneratedImages({});
    setImageGenerationProgress({});
    setCurrentImageGeneratingScene('starting');
    
    try {
      console.log('[IMAGE GEN] Starting real AI image generation for script:', generatedScript.title);
      
      // Get authentication token from Firebase user
      if (!firebaseUser) {
        throw new Error('Please sign in to generate AI images');
      }
      
      const token = await firebaseUser.getIdToken();
      
      if (!token) {
        throw new Error('Unable to get authentication token');
      }
      
      console.log('[IMAGE GEN] Authentication token obtained successfully');
      console.log('[IMAGE GEN] Sending request to /api/video/generate-images with scenes:', generatedScript.scenes.length);
      
      // Call real API endpoint for AI image generation
      const response = await fetch('/api/video/generate-images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          script: generatedScript,
          scenes: generatedScript.scenes
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('[IMAGE GEN] API Error:', response.status, errorData);
        throw new Error(errorData.error || `HTTP ${response.status}: ${errorData.details || 'Unknown error'}`);
      }
      
      const result = await response.json();
      console.log('[IMAGE GEN] Full API response:', result);
      
      if (result.success && result.generatedImages) {
        console.log('[IMAGE GEN] ✓ Real AI images generated successfully:', result);
        console.log('[IMAGE GEN] Generated images count:', Object.keys(result.generatedImages).length);
        console.log('[IMAGE GEN] Generated images URLs:', result.generatedImages);
        
        // Animate the images appearing one by one
        const imageKeys = Object.keys(result.generatedImages);
        for (let i = 0; i < imageKeys.length; i++) {
          const sceneId = imageKeys[i];
          setCurrentImageGeneratingScene(sceneId);
          
          // Simulate progress for visual feedback
          for (let progress = 0; progress <= 100; progress += 20) {
            setImageGenerationProgress(prev => ({
              ...prev,
              [sceneId]: progress
            }));
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
        // Add the real generated image
        console.log('[IMAGE GEN] Setting image for scene:', sceneId, 'URL:', result.generatedImages[sceneId]);
        setGeneratedImages(prev => {
          const newImages = {
            ...prev,
            [sceneId]: result.generatedImages[sceneId]
          };
          console.log('[IMAGE GEN] Updated generatedImages state:', newImages);
          return newImages;
        });
        
        // Update progress
        setImageGenerationProgress(prev => ({
          ...prev,
          [sceneId]: 100
        }));
          
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        console.log('[IMAGE GEN] ✓ All AI images loaded and displayed');
        setIsGeneratingImages(false);
      } else {
        throw new Error('Invalid response format');
      }
      
    } catch (error) {
      console.error('[IMAGE GEN] Real AI image generation failed:', error);
      
      // Fallback to placeholder images if AI generation fails
      console.log('[IMAGE GEN] Falling back to placeholder images...');
      for (let i = 0; i < generatedScript.scenes.length; i++) {
        const scene = generatedScript.scenes[i];
        setCurrentImageGeneratingScene(scene.id);
        
        // Simulate progress
        for (let progress = 0; progress <= 100; progress += 25) {
          setImageGenerationProgress(prev => ({
            ...prev,
            [scene.id]: progress
          }));
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Use fallback image
        const fallbackImage = `https://picsum.photos/800/600?random=${scene.id}`;
        setGeneratedImages(prev => ({
          ...prev,
          [scene.id]: fallbackImage
        }));
        
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } finally {
      setCurrentImageGeneratingScene(null);
      setIsGeneratingImages(false);
    }
  };
  
  // Use Firebase user data as fallback if API user data is not available
  const displayUserData = userData || (firebaseUser ? {
    displayName: firebaseUser.displayName,
    email: firebaseUser.email,
    avatar: firebaseUser.photoURL,
    plan: 'Free'
  } : null);
  
  // Ensure we have the right field names for display
  const finalUserData = displayUserData ? {
    displayName: displayUserData.displayName || displayUserData.username || 'User',
    email: displayUserData.email,
    avatar: displayUserData.avatar || displayUserData.photoURL,
    plan: displayUserData.plan || 'Free'
  } : null;

  const [currentStep, setCurrentStep] = useState<'prompt' | 'settings' | 'script' | 'advanced' | 'preview'>('prompt');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // Generated script state
  const [generatedScript, setGeneratedScript] = useState<GeneratedScript | null>(null);

  // Video generator UI state
  const [isVideoSidebarCollapsed, setIsVideoSidebarCollapsed] = useState(false);
  const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);

  // Animation and pipeline states
  const [scriptAnimationStep, setScriptAnimationStep] = useState(0);
  const [isScriptApproved, setIsScriptApproved] = useState(false);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<{[sceneId: string]: string}>({});
  const [imageGenerationProgress, setImageGenerationProgress] = useState<{[sceneId: string]: number}>({});
  const [currentImageGeneratingScene, setCurrentImageGeneratingScene] = useState<string | null>(null);
  
  // Advanced settings based on video-generator.md specifications
  const [settings, setSettings] = useState({
    // Video Quality & Duration
    duration: 60,
    aspectRatio: '16:9',
    resolution: '1080p',
    fps: 30,
    
    // Motion Engine (core feature from video-generator.md)
    motionEngine: 'Auto', // Auto, Runway Gen-2, AnimateDiff + Interpolation
    visualStyle: 'cinematic',
    
    // Voice & Audio (comprehensive ElevenLabs integration)
    voiceGender: 'female',
    voiceLanguage: 'English',
    voiceAccent: 'American',
    voiceTone: 'professional',
    voiceStability: 0.4,
    voiceSimilarity: 0.75,
    
    // Background Audio
    backgroundMusic: true,
    musicGenre: 'corporate',
    musicVolume: 0.3,
    
    // Avatar & Visual Features (Hedra integration)
    avatar: false,
    avatarStyle: 'realistic',
    avatarPosition: 'corner', // corner, fullscreen, intro-only
    
    // Text & Captions
    language: 'en',
    captions: true,
    captionStyle: 'modern',
    onScreenText: true,
    
    // Effects & Transitions
    transitions: 'smooth',
    colorScheme: 'vibrant',
    zoomEffects: true,
    fadeTransitions: true,
    
    // Advanced Features
    enableWatermark: true,
    enableLogo: false,
    speedControl: 1.0, // 0.5x to 2.0x
    enableColorGrading: true,
    
    // Additional properties for Generate Modal
    voiceEnabled: false,
    effects: [],
    transitionStyle: 'smooth'
  });

  const queryClient = useQueryClient();
  
  // Fetch recent video projects from backend
  const { data: recentProjects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['/api/video/jobs'],
    queryFn: () => apiRequest('/api/video/jobs'),
    select: (data) => data?.map(job => ({
      id: job.id,
      title: job.title || 'Untitled Project',
      thumbnail: job.finalVideo ? '🎬' : '⏳',
      lastEdited: new Date(job.updatedAt || job.createdAt).toLocaleDateString(),
      status: job.status
    })) || []
  });

  // Script generation mutation
  const generateScriptMutation = useMutation({
    mutationFn: async () => {
      console.log('[SCRIPT GEN] Starting script generation with:', {
        prompt,
        duration: settings.duration,
        visualStyle: settings.visualStyle,
        tone: settings.voiceTone,
        voiceGender: settings.voiceGender,
        language: settings.voiceLanguage,
        accent: settings.voiceAccent
      });
      
      const response = await apiRequest('/api/video/generate-script', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          duration: settings.duration,
          visualStyle: settings.visualStyle,
          tone: settings.voiceTone,
          voiceGender: settings.voiceGender,
          language: settings.voiceLanguage,
          accent: settings.voiceAccent
        })
      });
      
      console.log('[SCRIPT GEN] API Response:', response);
      return response;
    },
    onSuccess: (data) => {
      console.log('[SCRIPT GEN] Success:', data);
      if (data.script) {
        setGeneratedScript(data.script);
        setCurrentStep('script');
      } else {
        console.error('[SCRIPT GEN] No script in response data');
      }
    },
    onError: (error) => {
      console.error('[SCRIPT GEN] Script generation failed:', error);
      setIsGenerating(false);
    }
  });

  // Video generation mutation
  const generateVideoMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/video/generate', {
        method: 'POST',
        body: JSON.stringify({
          title: generatedScript?.title || 'AI Generated Video',
          prompt,
          script: generatedScript,
          duration: settings.duration,
          voiceProfile: {
            gender: settings.voiceGender,
            language: settings.voiceLanguage,
            accent: settings.voiceAccent,
            tone: settings.voiceTone
          },
          enableAvatar: settings.avatar,
          enableMusic: settings.backgroundMusic,
          visualStyle: settings.visualStyle,
          motionEngine: settings.motionEngine,
          uploadedImages: []
        })
      });
      return response;
    },
    onSuccess: (data) => {
      if (data.jobId) {
        setCurrentJobId(data.jobId);
        setCurrentStep('preview');
        // Start polling for job progress
        queryClient.invalidateQueries(['/api/video/jobs']);
      }
    },
    onError: (error) => {
      console.error('Video generation failed:', error);
      setIsGenerating(false);
    }
  });

  // Track current job progress
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  
  const { data: currentJob } = useQuery({
    queryKey: ['/api/video/job', currentJobId],
    queryFn: () => apiRequest(`/api/video/job/${currentJobId}`),
    enabled: !!currentJobId,
    refetchInterval: false // Disable automatic refetching to prevent app refreshes
  });

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!currentJobId) return;
    
    const ws = new WebSocket(`ws://${window.location.host}/ws/video`);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      ws.send(JSON.stringify({ type: 'subscribe', jobId: currentJobId }));
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'progress') {
        setProgress(data.progress);
        setCurrentStep(data.step || 'Processing...');
      } else if (data.type === 'complete') {
        setIsGenerating(false);
        setProgress(100);
        queryClient.invalidateQueries(['/api/video/jobs']);
        queryClient.invalidateQueries(['/api/video/job', currentJobId]);
      }
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };
    
    return () => {
      ws.close();
    };
  }, [currentJobId, queryClient]);

  const generateScript = async () => {
    if (!prompt.trim()) {
      alert('Please enter a video prompt first');
      return;
    }
    
    setIsGenerating(true);
    setProgress(0);
    setCurrentStep('script');
    
    // Show progress animation while API call is in progress
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90; // Stop at 90% until API returns
        }
        return prev + 10;
      });
    }, 500);
    
    try {
      await generateScriptMutation.mutateAsync();
      setProgress(100);
      setIsGenerating(false);
      clearInterval(interval);
    } catch (error) {
      clearInterval(interval);
      setIsGenerating(false);
      setProgress(0);
    }
  };

  const renderPromptStep = () => (
     <div className="flex h-full">
       {/* Custom CSS to remove textarea focus styling and style slider */}
       <style>{`
         textarea:focus {
           outline: none !important;
           border: none !important;
           box-shadow: none !important;
           outline-offset: 0 !important;
           outline-width: 0 !important;
           -webkit-appearance: none !important;
           -moz-appearance: none !important;
           appearance: none !important;
         }
         textarea:focus-visible {
           outline: none !important;
           border: none !important;
           box-shadow: none !important;
         }
         
         /* Custom slider styling */
         .slider-thumb::-webkit-slider-thumb {
           appearance: none;
           height: 16px;
           width: 16px;
           border-radius: 50%;
           background: #3B82F6;
           cursor: pointer;
           border: none;
           box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
         }
         
         .slider-thumb::-moz-range-thumb {
           height: 16px;
           width: 16px;
           border-radius: 50%;
           background: #3B82F6;
           cursor: pointer;
           border: none;
           box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
         }

         /* Slide right animation */
         .slide-right {
           animation: slideInRight 0.8s ease-out forwards;
         }

         @keyframes slideInRight {
           from {
             opacity: 0;
             transform: translateX(-50px);
           }
           to {
             opacity: 1;
             transform: translateX(0);
           }
         }

         /* Shimmer effect */
         .shimmer {
           background: linear-gradient(90deg, 
             rgba(255,255,255,0) 0%, 
             rgba(255,255,255,0.2) 20%, 
             rgba(255,255,255,0.5) 60%, 
             rgba(255,255,255,0) 100%
           );
           background-size: 200% 100%;
           animation: shimmer 2s infinite;
         }

         @keyframes shimmer {
           0% {
             background-position: -200% 0;
           }
           100% {
             background-position: 200% 0;
           }
         }

         /* Slide in up animation for images */
         @keyframes slideInUp {
           from {
             opacity: 0;
             transform: translateY(30px);
           }
           to {
             opacity: 1;
             transform: translateY(0);
           }
         }
         
         /* Hide scrollbar for Chrome, Safari and Opera */
         .hide-scrollbar::-webkit-scrollbar {
           display: none;
         }
         
         /* Hide scrollbar for IE, Edge and Firefox */
         .hide-scrollbar {
           -ms-overflow-style: none;  /* IE and Edge */
           scrollbar-width: none;  /* Firefox */
         }
       `}</style>
       {/* Video Tools Sidebar - Collapsible */}
       <div className={`${isVideoSidebarCollapsed ? 'w-16' : 'w-64'} bg-gray-900 border-r border-gray-800 transition-all duration-300 flex flex-col`}>
         {/* Sidebar Header */}
         <div className="p-3 border-b border-gray-800">
           <div className="flex items-center justify-between">
             {!isVideoSidebarCollapsed && (
               <div>
                 <h2 className="text-white font-semibold text-base">Video Studio</h2>
                 <p className="text-gray-400 text-xs">AI-powered creation</p>
            </div>
             )}
             <button
               onClick={() => setIsVideoSidebarCollapsed(!isVideoSidebarCollapsed)}
               className="p-1.5 hover:bg-gray-800 rounded-lg transition-colors duration-200"
             >
               <svg 
                 className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isVideoSidebarCollapsed ? 'rotate-180' : ''}`} 
                 fill="none" 
                 stroke="currentColor" 
                 viewBox="0 0 24 24"
               >
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
               </svg>
             </button>
          </div>
            </div>

         {!isVideoSidebarCollapsed && (
           <>
             {/* Quick Tools */}
             <div className="p-4">
               <h3 className="text-white text-xs font-medium mb-3">Quick Tools</h3>
               <div className="space-y-2">
                 <button className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-800 rounded-lg transition-colors duration-200">
                   <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 24 24">
                     <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
              </svg>
                   <div className="flex-1">
                     <p className="text-white text-xs font-medium">AI Scripts</p>
                     <p className="text-gray-400 text-xs">Generate narratives</p>
                   </div>
            </button>
                 
                 <button className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-800 rounded-lg transition-colors duration-200">
                   <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                     <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/>
                   </svg>
                   <div className="flex-1">
                     <p className="text-white text-xs font-medium">Motion Graphics</p>
                     <p className="text-gray-400 text-xs">Professional animations</p>
                   </div>
                 </button>
                 
                 <button className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-800 rounded-lg transition-colors duration-200">
                   <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                     <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                   </svg>
                   <div className="flex-1">
                     <p className="text-white text-xs font-medium">AI Voiceover</p>
                     <p className="text-gray-400 text-xs">Natural narration</p>
                   </div>
                 </button>
               </div>
             </div>

             {/* Recent Projects */}
             <div className="p-4 border-t border-gray-800">
               <h3 className="text-white text-xs font-medium mb-3">Recent Projects</h3>
               <div className="space-y-3">
                 {recentProjects.slice(0, 3).map((project) => (
                   <div key={project.id} className="flex items-center gap-3 p-3 hover:bg-gray-800 rounded-lg cursor-pointer transition-colors duration-200">
                     <Play className="w-4 h-4 text-gray-400" />
                     <div className="flex-1 min-w-0">
                       <p className="text-white text-xs font-medium truncate">{project.title}</p>
                       <p className="text-gray-400 text-xs">{project.lastEdited}</p>
                     </div>
                   </div>
                 ))}
               </div>
             </div>
           </>
         )}

         {isVideoSidebarCollapsed && (
           <div className="p-3 space-y-4 flex flex-col items-center">
             <button className="p-2 hover:bg-gray-800 rounded-lg transition-colors cursor-pointer">
               <svg className="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 24 24">
                 <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
               </svg>
             </button>
             <button className="p-2 hover:bg-gray-800 rounded-lg transition-colors cursor-pointer">
               <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                 <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/>
               </svg>
             </button>
             <button className="p-2 hover:bg-gray-800 rounded-lg transition-colors cursor-pointer">
               <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                 <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
               </svg>
             </button>
           </div>
         )}
       </div>

       {/* Main Content Area */}
       <div className="flex-1 bg-gray-950 text-white flex flex-col" style={{fontFamily: '"Google Sans", "Helvetica Neue", Arial, sans-serif'}}>
         {/* Page Header */}
         <header className="flex items-center justify-between p-6 border-b border-gray-800">
           <div className="flex items-center gap-4">
             <div className="flex items-center gap-3">
               <img src={veeforceLogo} alt="VeeFore" className="w-10 h-10 rounded-xl" />
               <div>
                 <h1 className="text-white text-xl font-semibold">Video Studio</h1>
                 <p className="text-gray-400 text-sm">Create AI-powered videos</p>
               </div>
             </div>
           </div>
           
           <div className="flex items-center gap-4">
             {finalUserData && (
               <>
                 <span className="text-white text-sm bg-gradient-to-r from-purple-600 to-blue-600 px-3 py-1 rounded-full font-medium">
                   {finalUserData.plan.toUpperCase()}
                 </span>
                 <div className="flex items-center gap-2">
                   <div className="text-right">
                     <p className="text-white text-sm font-medium">{finalUserData.displayName}</p>
                     <p className="text-gray-400 text-xs">{finalUserData.email}</p>
                   </div>
                   <div 
                     className="w-8 h-8 bg-center bg-cover rounded-full border-2 border-gray-700 hover:border-gray-600 transition-colors duration-200" 
                     style={{
                       backgroundImage: finalUserData.avatar 
                         ? `url("${finalUserData.avatar}")` 
                         : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                     }}
                   >
                     {!finalUserData.avatar && (
                       <div className="w-full h-full flex items-center justify-center text-white text-sm font-semibold">
                         {finalUserData.displayName?.charAt(0)?.toUpperCase() || 'U'}
                       </div>
                     )}
                   </div>
                 </div>
               </>
             )}
          </div>
        </header>

          {/* Main content area - matching Gemini layout */}
          <div className="flex-1 flex flex-col px-8 py-16 overflow-y-auto">
            {/* Show different content based on state */}
            {!isGeneratingScript && !generatedScript ? (
              <>
                {/* Default view - Centered greeting and subtitle */}
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="text-center mb-16">
                    <h1 className="text-4xl font-normal mb-4">
                      <span className="text-blue-400">Hello, Creator</span>
            </h1>
                    <p className="text-gray-400 text-xl font-normal">
                      Want to create some amazing videos?
                    </p>
                  </div>
            
           {/* Suggestion Cards - Exact Gemini Layout with Mixed Grid */}
           <div className="max-w-4xl w-full mb-16">
             <div className="grid grid-cols-12 grid-rows-2 gap-3 h-48">
               {/* First card - Make my own custom mini figure (Rectangle - spans 4 columns, 2 rows) */}
               <div className="col-span-4 row-span-2 group cursor-pointer" onClick={() => setPrompt('Make my own custom mini figure')}>
                 <div className="bg-gray-800 hover:bg-gray-750 rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-lg border border-gray-700 hover:border-gray-600 h-full">
                   <div className="flex flex-col justify-between p-4 h-full">
                     <div>
                       <h3 className="text-white text-sm font-medium mb-2">Make my own custom mini figure</h3>
                     </div>
                     <div className="w-full h-20 rounded-xl overflow-hidden">
                       <div className="w-full h-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center">
                         <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                           <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                         </svg>
                       </div>
                     </div>
                   </div>
                 </div>
               </div>

               {/* Second card - Turn me into a superhero (Large square - spans 4 columns, 2 rows) */}
               <div className="col-span-4 row-span-2 group cursor-pointer" onClick={() => setPrompt('Turn me into a superhero')}>
                 <div className="bg-gray-800 hover:bg-gray-750 rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-lg border border-gray-700 hover:border-gray-600 h-full">
                   <div className="relative w-full h-full">
                     <div className="w-full h-full bg-gradient-to-br from-red-500 via-orange-500 to-yellow-500 rounded-2xl">
                       <div className="absolute inset-0 bg-black bg-opacity-20 rounded-2xl"></div>
                       <div className="absolute bottom-0 left-0 right-0 p-3">
                         <h3 className="text-white text-sm font-medium">Turn me into a superhero</h3>
                       </div>
                       <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                         <div className="w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center">
                           <span className="text-red-600 font-bold text-lg">S</span>
                         </div>
                       </div>
                     </div>
                   </div>
                 </div>
               </div>

               {/* Third and Fourth cards - Right column (2 squares stacked) */}
               <div className="col-span-4 row-span-1 group cursor-pointer" onClick={() => setPrompt('Give me an 80s style makeover')}>
                 <div className="bg-gray-800 hover:bg-gray-750 rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-lg border border-gray-700 hover:border-gray-600 h-full">
                   <div className="flex items-center p-3 h-full">
                     <div className="flex-1">
                       <h3 className="text-white text-sm font-medium">Give me an 80s style makeover</h3>
                     </div>
                     <div className="w-12 h-12 rounded-xl overflow-hidden ml-3 flex-shrink-0">
                       <div className="w-full h-full bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-400 flex items-center justify-center">
                         <div className="w-6 h-6 bg-pink-400 rounded-full"></div>
                       </div>
                     </div>
                   </div>
                 </div>
               </div>

               <div className="col-span-4 row-span-1 group cursor-pointer" onClick={() => setPrompt('Create a professional headshot')}>
                 <div className="bg-gray-800 hover:bg-gray-750 rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-lg border border-gray-700 hover:border-gray-600 h-full">
                   <div className="flex items-center p-3 h-full">
                     <div className="flex-1">
                       <h3 className="text-white text-sm font-medium">Create a professional headshot</h3>
                     </div>
                     <div className="w-12 h-12 rounded-xl overflow-hidden ml-3 flex-shrink-0">
                       <div className="w-full h-full bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 flex items-center justify-center">
                         <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
                           <svg className="w-3 h-3 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                             <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                           </svg>
                         </div>
                       </div>
                     </div>
                   </div>
                 </div>
               </div>
             </div>
           </div>

           {/* Bottom input area with fixed positioning and upward expansion */}
           <div className="w-full max-w-3xl relative">
             {/* Input container with upward expansion */}
             <div 
               className="absolute bottom-0 left-0 right-0 flex items-end gap-3 p-3 border border-gray-200/20 rounded-[25px] bg-white/5 backdrop-blur-[20px] shadow-lg hover:shadow-xl transition-all duration-200 min-h-[44px]"
               style={{
                 backdropFilter: 'blur(20px)',
                 WebkitBackdropFilter: 'blur(20px)',
                 boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)',
                 maxHeight: '200px', // Limit to ~50% of suggestion area
                 transform: 'translateY(0)'
               }}
             >
               {/* Attachment button */}
               <button className="p-1 hover:bg-gray-500/10 rounded-full transition-colors duration-200 flex-shrink-0 mb-1">
                 <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                 </svg>
               </button>

               {/* Input field wrapper with scrollable textarea */}
               <div className="flex-1 flex flex-col justify-end">
                <textarea
                   placeholder="Describe your video idea..."
                  value={prompt}
                   onChange={(e) => {
                     setPrompt(e.target.value);
                     // Auto-resize with max height limit
                     const textarea = e.target as HTMLTextAreaElement;
                     textarea.style.height = 'auto';
                     const newHeight = Math.min(150, Math.max(20, textarea.scrollHeight)); // Max 150px height
                     textarea.style.height = newHeight + 'px';
                   }}
                   className="bg-transparent text-gray-700 dark:text-gray-300 placeholder-gray-400 text-base focus:outline-none focus:ring-0 focus:border-none min-h-[20px] max-h-[150px] py-1 resize-none overflow-y-auto w-full scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent"
                   onKeyDown={(e) => {
                     if (e.key === 'Enter' && !e.shiftKey && prompt.trim()) {
                       e.preventDefault();
                       setCurrentStep('settings');
                     }
                   }}
                   rows={1}
                   style={{
                     fontSize: '16px',
                     lineHeight: '24px',
                     border: 'none !important',
                     outline: 'none !important',
                     boxShadow: 'none !important',
                     WebkitAppearance: 'none',
                     MozAppearance: 'none',
                     appearance: 'none',
                     // Force remove all focus styling
                     outlineOffset: '0',
                     outlineWidth: '0',
                     borderRadius: '0',
                     borderColor: 'transparent !important',
                     // Remove webkit focus styling
                     WebkitTapHighlightColor: 'transparent',
                     WebkitFocusRingColor: 'transparent',
                     // Custom scrollbar
                     scrollbarWidth: 'thin',
                     scrollbarColor: '#4B5563 transparent'
                   }}
                 />
            </div>
            
               {/* Tools button */}
              <button
                 onClick={() => setIsToolsModalOpen(true)}
                 className="flex items-center gap-2 p-1 hover:bg-gray-500/10 rounded-full transition-colors duration-200 flex-shrink-0 mb-1"
               >
                 <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 7.172V5L8 4z" />
                 </svg>
                 <span className="text-sm text-gray-400">Tools</span>
               </button>

               {/* Microphone button */}
               <button className="p-1 hover:bg-gray-500/10 rounded-full transition-colors duration-200 flex-shrink-0 mb-1">
                 <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                 </svg>
              </button>
            </div>

             {/* Spacer to maintain layout */}
             <div className="h-[44px]"></div>
                      </div>
             
            {/* Generate button that appears when there's text */}
            {prompt.trim() && (
              <div className="flex justify-center mt-4">
                <button
                  onClick={() => setIsGenerateModalOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-full font-medium transition-colors duration-200"
                >
                  Generate Video
                </button>
              </div>
            )}
                </div>
              </>
            ) : (
              <>
                {/* Script Generation View */}
                <div className="max-w-6xl mx-auto w-full">
                  {/* User's Original Prompt */}
                  <div className="mb-8 bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                    <h3 className="text-gray-400 text-sm font-medium mb-2">Your Video Idea:</h3>
                    <p className="text-white text-lg">{prompt}</p>
                  </div>

                  {/* Loading State */}
                  {isGeneratingScript && (
                    <div className="flex flex-col items-center justify-center py-16">
                      <div className="relative">
                        <div className="w-16 h-16 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Sparkles className="w-6 h-6 text-blue-400 animate-pulse" />
                        </div>
                      </div>
                      <p className="mt-4 text-gray-400 text-lg">AI is crafting your video script...</p>
                      <p className="mt-2 text-gray-500 text-sm">This usually takes 10-30 seconds</p>
                    </div>
                  )}

                  {/* Generated Script Blocks with Slide-Right Animation */}
                  {generatedScript && !isGeneratingScript && !isScriptApproved && (
                    <div className="space-y-6">
                      {/* Script Title - Animation Step 1 */}
                      <div className={`flex items-center justify-between mb-6 ${scriptAnimationStep >= 1 ? 'slide-right' : 'opacity-0'}`}
                           style={{ animationDelay: '0.1s' }}>
                        <h2 className="text-2xl font-semibold text-white">Generated Script</h2>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-400">
                            Total Duration: {generatedScript.totalDuration}s
                          </span>
                        </div>
                      </div>

                      {/* Full Script Overview - Animation Step 2 with Shimmer */}
                      {generatedScript.fullScript && scriptAnimationStep >= 2 && (
                        <div className={`mb-6 bg-gray-800/50 border border-gray-700 rounded-xl p-6 relative overflow-hidden ${scriptAnimationStep >= 2 ? 'slide-right' : 'opacity-0'}`}
                             style={{ animationDelay: '0.3s' }}>
                          <div className="absolute inset-0 shimmer"></div>
                          <div className="relative z-10">
                            <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                              <FileText className="w-4 h-4" />
                              Complete Script
                            </h3>
                            <p className="text-gray-300 text-sm leading-relaxed">{generatedScript.fullScript}</p>
                          </div>
                        </div>
                      )}

                      {/* Scene Blocks - Animation Step 3 with Slide-Right */}
                      {scriptAnimationStep >= 3 && (
                        <div className="space-y-4">
                          {generatedScript.scenes.map((scene, index) => (
                            <div 
                              key={scene.id} 
                              className={`bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden hover:border-gray-600 relative ${
                                scriptAnimationStep >= 3 ? 'slide-right' : 'opacity-0'
                              }`}
                              style={{ animationDelay: `${0.5 + index * 0.2}s` }}
                            >
                              <div className="absolute inset-0 shimmer"></div>
                              <div className="relative z-10">
                            {/* Scene Header */}
                            <div className="bg-gradient-to-r from-gray-800 to-gray-700 px-6 py-4 flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
                                  <span className="text-blue-400 font-semibold">{index + 1}</span>
                        </div>
                                <div>
                                  <h3 className="text-white font-medium">Scene {scene.id}</h3>
                                  <p className="text-gray-400 text-sm">{scene.duration} seconds</p>
                      </div>
                    </div>
                              <button className="text-gray-400 hover:text-white transition-colors">
                                <Settings className="w-5 h-5" />
                              </button>
                    </div>

                            {/* Scene Content */}
                            <div className="p-6 space-y-4">
                              {/* Description */}
                              <div>
                                <h4 className="text-gray-400 text-sm font-medium mb-2 flex items-center gap-2">
                                  <FileText className="w-4 h-4" />
                                  Scene Description
                                </h4>
                                <p className="text-gray-300">{scene.description}</p>
                              </div>

                              {/* Visuals and Narration */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <h4 className="text-gray-400 text-sm font-medium mb-2 flex items-center gap-2">
                                    <Camera className="w-4 h-4" />
                                    Visual Elements
                                  </h4>
                                  <div className="bg-gray-900/50 rounded-lg p-3">
                                    <p className="text-gray-300 text-sm">{scene.visualElements}</p>
                                  </div>
                                </div>

                                {/* Narration */}
                                <div>
                                  <h4 className="text-gray-400 text-sm font-medium mb-2 flex items-center gap-2">
                                    <Mic className="w-4 h-4" />
                                    Narration Script
                                  </h4>
                                  <div className="bg-gray-900/50 rounded-lg p-3">
                                    <p className="text-gray-300 text-sm italic">"{scene.narration}"</p>
                                  </div>
                                </div>
                              </div>

                              {/* Image Generation Prompt */}
                              {scene.imagePrompt && (
                                <div className="mt-4">
                                  <h4 className="text-gray-400 text-sm font-medium mb-2 flex items-center gap-2">
                                    <Sparkles className="w-4 h-4" />
                                    AI Image Prompt
                                  </h4>
                                  <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-500/30 rounded-lg p-3">
                                    <p className="text-purple-200 text-sm font-mono">{scene.imagePrompt}</p>
                                  </div>
                                </div>
                              )}

                              {/* Visual Preview Placeholder */}
                              <div className="bg-gray-900/30 rounded-lg h-40 flex items-center justify-center border border-gray-700/50">
                                 <div className="text-center">
                                   <Image className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                                   <p className="text-gray-500 text-sm">Visual preview will appear here</p>
                                 </div>
                              </div>
                              </div>
                            </div>
                          </div>
                          ))}
                        </div>
                      )}

                      {/* Add padding bottom for fixed approval box */}
                      {scriptAnimationStep >= 4 && !isScriptApproved && (
                        <div className="pb-24"></div>
                      )}

                      {/* Image Generation Progress */}
                      {isGeneratingImages && (
                        <div className="mt-8 space-y-6">
                          <div className="text-center">
                            <h3 className="text-xl font-semibold text-white mb-2">🎨 Creating Real AI Images...</h3>
                            <p className="text-gray-400">DALL-E 3 is generating custom images based on your script, scenes, and visuals</p>
                            <p className="text-gray-500 text-sm mt-2">This may take 1-2 minutes per image</p>
                          </div>
                          
                          <div className="grid gap-4">
                            {generatedScript.scenes.map((scene, index) => (
                              <div key={scene.id} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                                <div className="flex items-center gap-4">
                                  <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
                                    <span className="text-blue-400 font-semibold">{index + 1}</span>
                                  </div>
                                  <div className="flex-1">
                                    <h4 className="text-white font-medium">Scene {index + 1}</h4>
                                    <p className="text-gray-400 text-sm truncate">{scene.imagePrompt}</p>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    {generatedImages[scene.id] ? (
                                      <div className="flex items-center gap-2 text-green-400">
                                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                        <span className="text-sm">Complete</span>
                                      </div>
                                    ) : currentImageGeneratingScene === scene.id ? (
                                      <div className="flex items-center gap-2 text-blue-400">
                                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                                        <span className="text-sm">Generating...</span>
                                        <div className="w-16 bg-gray-700 rounded-full h-2">
                                          <div 
                                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                            style={{ width: `${imageGenerationProgress[scene.id] || 0}%` }}
                                          ></div>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2 text-gray-500">
                                        <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                                        <span className="text-sm">Waiting</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Fallback Image Display - Show images even if script not approved */}
                      {!isScriptApproved && Object.keys(generatedImages).length > 0 && (
                        <div className="mt-8 space-y-6">
                          <h3 className="text-xl font-semibold text-white text-center mb-8">Generated Images</h3>
                          <div className="text-white text-center mb-4 text-sm">
                            Images generated: {Object.keys(generatedImages).length}
                          </div>
                          <div className="grid gap-4">
                            {(generatedScript?.scenes || Object.keys(generatedImages).map((id, index) => ({ id, title: `Scene ${index + 1}` }))).map((scene, index) => {
                              const imageUrl = generatedImages[scene.id];
                              if (!imageUrl) return null;
                              
                              return (
                                <div 
                                  key={scene.id} 
                                  className="slide-right"
                                  style={{ animationDelay: `${index * 0.3}s` }}
                                >
                                  <div className="relative">
                                    <img 
                                      src={imageUrl} 
                                      alt={`Scene ${index + 1}`}
                                      className="w-full h-64 object-cover rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-300"
                                      onLoad={() => console.log('[UI DEBUG] Image loaded successfully:', imageUrl)}
                                      onError={(e) => {
                                        console.error('[UI DEBUG] Image failed to load:', imageUrl, e);
                                        const target = e.target as HTMLImageElement;
                                        target.src = `https://picsum.photos/seed/${scene.id}/600/400`;
                                      }}
                                      style={{ 
                                        minHeight: '256px',
                                        backgroundColor: '#374151'
                                      }}
                                    />
                                    <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                                      Scene {index + 1}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Simple Generated Images Display - Borderless with Slide-Right */}
                      {Object.keys(generatedImages).length > 0 && (
                        <div className="mt-8 space-y-6">
                          <h3 className="text-xl font-semibold text-white text-center mb-8">Generated Scene Images</h3>
                          <div className="text-white text-center mb-4 text-sm">
                            Debug: isScriptApproved={isScriptApproved.toString()}, generatedImages count={Object.keys(generatedImages).length}
                            <br />
                            Generated images: {JSON.stringify(generatedImages)}
                            <br />
                            isGeneratingImages: {isGeneratingImages.toString()}
                            <br />
                            generatedScript exists: {!!generatedScript}
                            <br />
                            scenes count: {generatedScript?.scenes?.length || 0}
                            <br />
                            <strong>TEST: Should show images now!</strong>
                            <br />
                            <strong>Image IDs: {Object.keys(generatedImages).join(', ')}</strong>
                          </div>
                          <div className="grid gap-4">
                            {Object.keys(generatedImages).map((imageId, index) => {
                              const imageUrl = generatedImages[imageId];
                              console.log('[UI DEBUG] Rendering image:', imageId, 'URL:', imageUrl);
                              return (
                                <div 
                                  key={imageId} 
                                  className={`${imageUrl ? 'slide-right' : 'opacity-0'}`}
                                  style={{ animationDelay: `${index * 0.3}s` }}
                                >
                                  {imageUrl ? (
                                    <div className="relative">
                                      <img 
                                        src={imageUrl} 
                                        alt={`Generated Image ${index + 1}`}
                                        className="w-full h-64 object-cover rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-300"
                                        onLoad={() => console.log('[UI DEBUG] Image loaded successfully:', imageUrl)}
                                        onError={(e) => {
                                          console.error('[UI DEBUG] Image failed to load:', imageUrl, e);
                                          // Show fallback image
                                          const target = e.target as HTMLImageElement;
                                          target.src = `https://picsum.photos/seed/${imageId}/600/400`;
                                        }}
                                        style={{ 
                                          minHeight: '256px',
                                          backgroundColor: '#374151' // Fallback background
                                        }}
                                      />
                                      <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                                        Scene {index + 1}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="w-full h-64 bg-gray-700 rounded-lg flex items-center justify-center">
                                      <div className="text-center">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-2"></div>
                                        <p className="text-gray-400">Generating image for Scene {index + 1}...</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          
                          {generatedScript && generatedScript.scenes && Object.keys(generatedImages).length === generatedScript.scenes.length && (
                            <div className="text-center mt-8 pb-24">
                              <button 
                                onClick={() => setCurrentStep('preview')}
                                className="px-8 py-4 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white rounded-lg font-medium transition-all transform hover:scale-105 flex items-center gap-2 mx-auto"
                              >
                                <Play className="w-5 h-5" />
                                Generate Final Video
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
            </div>
              </>
            )}
          </div>
        </div>

        {/* Fixed Approval Box at Bottom */}
        {scriptAnimationStep >= 4 && !isScriptApproved && !isGeneratingImages && generatedScript && (
          <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
            <div className="bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-2xl px-6 py-4 shadow-2xl">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-400" />
                  <span className="text-white font-medium">Script Ready!</span>
                </div>
                <div className="flex gap-3">
              <button
                onClick={() => {
                      setScriptAnimationStep(0);
                      setGeneratedScript(null);
                    }}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    ↻ Regenerate
                  </button>
                  <button
                    onClick={() => {
                      // Edit functionality
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={async () => {
                      console.log('[UI] User clicked Approve button');
                      setIsScriptApproved(true);
                      setIsGeneratingImages(true);
                      try {
                        await startImageGeneration();
                        console.log('[UI] Image generation completed successfully');
                      } catch (error) {
                        console.error('[UI] Image generation failed:', error);
                      }
                    }}
                    className="px-6 py-2 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white rounded-lg text-sm font-medium transition-all transform hover:scale-105"
                  >
                    ✓ Approve
              </button>
            </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );

  // Tools Modal Component

  // Tools Modal Component
  const renderToolsModal = () => (
    <>
      {isToolsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsToolsModalOpen(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
                  <Settings className="w-4 h-4 text-white" />
                      </div>
                <h3 className="text-white text-lg font-semibold">Video Settings</h3>
                        </div>
              <button 
                onClick={() => setIsToolsModalOpen(false)}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors duration-200"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
                      </div>

            {/* Settings Content - Scrollable */}
            <div className="space-y-6 overflow-y-auto flex-1 pr-2 -mr-2 scroll-smooth hide-scrollbar">
              {/* Duration Setting */}
              <div>
                <label className="block text-white text-sm font-medium mb-3">
                  Duration: {settings.duration} seconds
                </label>
                <div className="px-3">
                  <input
                    type="range"
                    min="5"
                    max="180"
                    value={settings.duration}
                    onChange={(e) => setSettings({...settings, duration: parseInt(e.target.value)})}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-thumb"
                    style={{
                      background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${((settings.duration - 5) / (180 - 5)) * 100}%, #374151 ${((settings.duration - 5) / (180 - 5)) * 100}%, #374151 100%)`
                    }}
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>5s</span>
                    <span>3min</span>
                    </div>
                    </div>
                  </div>

              {/* Quality Setting */}
              <div>
                <label className="block text-white text-sm font-medium mb-3">Quality</label>
                <div className="grid grid-cols-3 gap-2">
                  {['720p', '1080p', '4K'].map((quality) => (
                    <button
                      key={quality}
                      onClick={() => setSettings({...settings, resolution: quality})}
                      className={`p-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                        settings.resolution === quality
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-750 hover:border-gray-600'
                      } border`}
                    >
                      {quality}
                    </button>
                ))}
                </div>
            </div>

              {/* Motion Engine Setting */}
              <div>
                <label className="block text-white text-sm font-medium mb-3">Motion Engine</label>
                <div className="space-y-2">
                  {[
                    { 
                      id: 'auto', 
                      name: 'Auto (Recommended)', 
                      description: 'AI selects best model based on complexity & credits',
                      icon: (
                        <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                      )
                    },
                    { id: 'runway-gen2', name: 'Runway Gen-2', description: 'High-quality realistic motion' },
                    { id: 'runway-gen3', name: 'Runway Gen-3', description: 'Latest generation with enhanced realism' },
                    { id: 'stable-video', name: 'Stable Video Diffusion', description: 'Consistent and smooth animations' }
                  ].map((engine) => (
                    <button
                      key={engine.id}
                      onClick={() => setSettings({...settings, motionEngine: engine.name})}
                      className={`w-full p-3 rounded-lg text-left transition-all duration-200 ${
                        settings.motionEngine === engine.name
                          ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                          : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-750 hover:border-gray-600'
                      } border`}
                    >
                      <div className="flex items-center gap-2">
                        {engine.icon && engine.icon}
                        <div className="font-medium text-sm">{engine.name}</div>
                  </div>
                      <div className="text-xs text-gray-400 mt-1">{engine.description}</div>
                    </button>
                  ))}
              </div>
            </div>

              {/* Auto Mode Info */}
              {settings.motionEngine === 'Auto (Recommended)' && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-xs">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-yellow-200">
                      <p className="font-medium mb-1">Auto mode analyzes:</p>
                      <ul className="space-y-0.5 text-yellow-100/80">
                        <li>• Scene complexity & motion requirements</li>
                        <li>• Your available credits balance</li>
                        <li>• Video duration & quality settings</li>
                      </ul>
                  </div>
                  </div>
                </div>
              )}

              </div>
            
            {/* Apply Button - Fixed at bottom */}
            <div className="pt-4 mt-4 border-t border-gray-700 flex-shrink-0">
              <button
                onClick={() => setIsToolsModalOpen(false)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium transition-colors duration-200"
              >
                Apply Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // Generate Video Modal Component
  const renderGenerateModal = () => {
    // Calculate cost based on settings
    const calculateCost = () => {
      let baseCost = 10; // Base cost in credits
      
      // Duration cost
      baseCost += Math.floor(settings.duration / 30) * 5;
      
      // Quality cost
      if (settings.resolution === '4K') baseCost += 20;
      else if (settings.resolution === '1080p') baseCost += 10;
      
      // Motion engine cost
      if (settings.motionEngine === 'Runway Gen-3') baseCost += 15;
      else if (settings.motionEngine === 'Stable Video Diffusion') baseCost += 8;
      
      // Voice cost
      if (settings.voiceEnabled) baseCost += 5;
      
      // Effects cost
      if (settings.effects && settings.effects.length > 0) baseCost += settings.effects.length * 3;
      
      // Music cost
      if (settings.backgroundMusic !== 'none') baseCost += 5;
      
      return baseCost;
    };

    const estimatedCost = calculateCost();

    return (
      <>
        {isGenerateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsGenerateModalOpen(false)}
            />
            
            {/* Modal - Wide */}
            <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-5xl w-full mx-4 shadow-2xl max-h-[90vh] flex flex-col">
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-6 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl flex items-center justify-center">
                    <Video className="w-5 h-5 text-white" />
      </div>
                  <div>
                    <h3 className="text-white text-xl font-semibold">Generate Your Video</h3>
                    <p className="text-gray-400 text-sm">Configure all settings for your AI video</p>
    </div>
                </div>
                <button 
                  onClick={() => setIsGenerateModalOpen(false)}
                  className="p-2 hover:bg-gray-800 rounded-lg transition-colors duration-200"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Settings Content - Scrollable */}
              <div className="overflow-y-auto flex-1 pr-2 -mr-2 scroll-smooth hide-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column */}
                  <div className="space-y-6">
                    {/* Voice & Audio Section */}
                    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
                      <h4 className="text-white font-medium mb-4 flex items-center gap-2">
                        <Mic className="w-4 h-4 text-purple-400" />
                        Voice & Audio
                      </h4>
                      <div className="space-y-4">
                        <div>
                          <label className="text-gray-300 text-sm mb-2 block">Voice Type</label>
                          <select 
                            value={settings.voiceGender || 'female'}
                            onChange={(e) => setSettings({...settings, voiceGender: e.target.value})}
                            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-gray-300 focus:border-blue-500 focus:outline-none"
                          >
                            <option value="female">Female</option>
                            <option value="male">Male</option>
                            <option value="child">Child</option>
                            <option value="elderly">Elderly</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-gray-300 text-sm mb-2 block">Language & Accent</label>
                          <div className="grid grid-cols-2 gap-2">
                            <select 
                              value={settings.voiceLanguage || 'English'}
                              onChange={(e) => setSettings({...settings, voiceLanguage: e.target.value})}
                              className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-gray-300 focus:border-blue-500 focus:outline-none"
                            >
                              <option value="English">English</option>
                              <option value="Spanish">Spanish</option>
                              <option value="French">French</option>
                              <option value="German">German</option>
                            </select>
                            <select 
                              value={settings.voiceAccent || 'American'}
                              onChange={(e) => setSettings({...settings, voiceAccent: e.target.value})}
                              className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-gray-300 focus:border-blue-500 focus:outline-none"
                            >
                              <option value="American">American</option>
                              <option value="British">British</option>
                              <option value="Australian">Australian</option>
                              <option value="Neutral">Neutral</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox" 
                            id="voiceEnabled"
                            checked={settings.voiceEnabled || false}
                            onChange={(e) => setSettings({...settings, voiceEnabled: e.target.checked})}
                            className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500"
                          />
                          <label htmlFor="voiceEnabled" className="text-gray-300 text-sm">Enable AI Voiceover</label>
                        </div>
                      </div>
                    </div>

                    {/* Avatars & Visual Features */}
                    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
                      <h4 className="text-white font-medium mb-4 flex items-center gap-2">
                        <User className="w-4 h-4 text-blue-400" />
                        Avatars & Visual Features
                      </h4>
                      <div className="space-y-4">
                        <div>
                          <label className="text-gray-300 text-sm mb-2 block">Avatar Style</label>
                          <div className="grid grid-cols-2 gap-2">
                            {['Realistic', 'Cartoon', '3D Animated', 'None'].map((style) => (
                              <button
                                key={style}
                                onClick={() => setSettings({...settings, avatarStyle: style})}
                                className={`p-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                                  (settings.avatarStyle || 'None') === style
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-750'
                                }`}
                              >
                                {style}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-gray-300 text-sm mb-2 block">Visual Style</label>
                          <select 
                            value={settings.visualStyle || 'cinematic'}
                            onChange={(e) => setSettings({...settings, visualStyle: e.target.value})}
                            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-gray-300 focus:border-blue-500 focus:outline-none"
                          >
                            <option value="cinematic">Cinematic</option>
                            <option value="documentary">Documentary</option>
                            <option value="animation">Animation</option>
                            <option value="minimalist">Minimalist</option>
                            <option value="vintage">Vintage</option>
                            <option value="modern">Modern</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-6">
                    {/* Effects & Transitions */}
                    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
                      <h4 className="text-white font-medium mb-4 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-yellow-400" />
                        Effects & Transitions
                      </h4>
                      <div className="space-y-4">
                        <div>
                          <label className="text-gray-300 text-sm mb-2 block">Transition Style</label>
                          <div className="grid grid-cols-3 gap-2">
                            {['Smooth', 'Cut', 'Dissolve', 'Wipe', 'Zoom', 'Slide'].map((transition) => (
                              <button
                                key={transition}
                                onClick={() => setSettings({...settings, transitionStyle: transition})}
                                className={`p-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                  (settings.transitionStyle || 'Smooth') === transition
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-750'
                                }`}
                              >
                                {transition}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-gray-300 text-sm mb-2 block">Special Effects</label>
                          <div className="space-y-2">
                            {[
                              { id: 'particles', name: 'Particle Effects', icon: '✨' },
                              { id: 'blur', name: 'Motion Blur', icon: '💨' },
                              { id: 'glow', name: 'Glow Effects', icon: '🌟' },
                              { id: 'shake', name: 'Camera Shake', icon: '📹' }
                            ].map((effect) => (
                              <label key={effect.id} className="flex items-center gap-3 cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  checked={settings.effects?.includes(effect.id) || false}
                                  onChange={(e) => {
                                    const effects = settings.effects || [];
                                    if (e.target.checked) {
                                      setSettings({...settings, effects: [...effects, effect.id]});
                                    } else {
                                      setSettings({...settings, effects: effects.filter(e => e !== effect.id)});
                                    }
                                  }}
                                  className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500"
                                />
                                <span className="text-gray-300 text-sm flex items-center gap-2">
                                  <span>{effect.icon}</span>
                                  {effect.name}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Background Music */}
                    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
                      <h4 className="text-white font-medium mb-4 flex items-center gap-2">
                        <Music className="w-4 h-4 text-green-400" />
                        Background Music
                      </h4>
                      <div className="space-y-4">
                        <div>
                          <label className="text-gray-300 text-sm mb-2 block">Music Genre</label>
                          <select 
                            value={settings.backgroundMusic || 'none'}
                            onChange={(e) => setSettings({...settings, backgroundMusic: e.target.value})}
                            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-gray-300 focus:border-blue-500 focus:outline-none"
                          >
                            <option value="none">No Music</option>
                            <option value="upbeat">Upbeat & Energetic</option>
                            <option value="corporate">Corporate & Professional</option>
                            <option value="ambient">Ambient & Calm</option>
                            <option value="dramatic">Dramatic & Cinematic</option>
                            <option value="electronic">Electronic & Modern</option>
                            <option value="acoustic">Acoustic & Natural</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-gray-300 text-sm mb-2 block">Music Volume</label>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={settings.musicVolume || 50}
                            onChange={(e) => setSettings({...settings, musicVolume: parseInt(e.target.value)})}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-thumb"
                            style={{
                              background: `linear-gradient(to right, #10B981 0%, #10B981 ${settings.musicVolume || 50}%, #374151 ${settings.musicVolume || 50}%, #374151 100%)`
                            }}
                          />
                          <div className="flex justify-between text-xs text-gray-400 mt-1">
                            <span>Muted</span>
                            <span>{settings.musicVolume || 50}%</span>
                            <span>Loud</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cost Estimation */}
                <div className="mt-6 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-white font-medium mb-1 flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-yellow-400" />
                        Estimated Cost
                      </h4>
                      <p className="text-gray-400 text-sm">Based on your current settings</p>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-white">{estimatedCost}</div>
                      <div className="text-sm text-gray-400">credits</div>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between text-gray-300">
                      <span>Base Generation</span>
                      <span>10 credits</span>
                    </div>
                    {settings.duration > 60 && (
                      <div className="flex justify-between text-gray-300">
                        <span>Extended Duration</span>
                        <span>+{Math.floor(settings.duration / 30) * 5} credits</span>
                      </div>
                    )}
                    {settings.resolution !== '720p' && (
                      <div className="flex justify-between text-gray-300">
                        <span>High Quality ({settings.resolution})</span>
                        <span>+{settings.resolution === '4K' ? 20 : 10} credits</span>
                      </div>
                    )}
                    {settings.voiceEnabled && (
                      <div className="flex justify-between text-gray-300">
                        <span>AI Voiceover</span>
                        <span>+5 credits</span>
                      </div>
                    )}
                    {settings.effects && settings.effects.length > 0 && (
                      <div className="flex justify-between text-gray-300">
                        <span>Special Effects ({settings.effects.length})</span>
                        <span>+{settings.effects.length * 3} credits</span>
                      </div>
                    )}
                    {settings.backgroundMusic !== 'none' && (
                      <div className="flex justify-between text-gray-300">
                        <span>Background Music</span>
                        <span>+5 credits</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Action Buttons - Fixed at bottom */}
              <div className="pt-4 mt-4 border-t border-gray-700 flex-shrink-0 flex gap-3">
                <button
                  onClick={() => setIsGenerateModalOpen(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-lg font-medium transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setIsGenerateModalOpen(false);
                    setIsGeneratingScript(true);
                    setScriptAnimationStep(0);
                    
                    // Animated script generation process
                    setTimeout(() => {
                      setScriptAnimationStep(1); // Start showing script title
                    }, 1000);
                    
                    setTimeout(() => {
                      setScriptAnimationStep(2); // Show full script
                    }, 2000);
                    
                    setTimeout(() => {
                      setScriptAnimationStep(3); // Show scenes one by one
                    }, 3000);
                    
                    // Mock script generation - replace with actual API call
                    setTimeout(() => {
                      const basePrompt = prompt.toLowerCase();
                      const isActionScene = basePrompt.includes('fight') || basePrompt.includes('battle') || basePrompt.includes('dragon');
                      
                      setGeneratedScript({
                        title: `AI-Generated Video Script: ${prompt}`,
                        totalDuration: settings.duration,
                        hook: isActionScene ? "Epic battle awaits..." : "An incredible story unfolds...",
                        callToAction: "Experience the magic of AI-generated storytelling.",
                        fullScript: isActionScene ? 
                          `A brave warrior stands at the edge of a mystical realm, ancient sword gleaming in the ethereal light. The ground trembles as a massive dragon emerges from the shadows, its scales shimmering like molten obsidian. This is not just a battle - it's a test of courage, skill, and destiny. The warrior charges forward with determination, knowing that the fate of the realm hangs in the balance. In a spectacular clash of steel and flame, good and evil collide in an epic confrontation that will be remembered for ages.` :
                          `${prompt} - A visual journey that captures the essence of creativity and imagination. Through carefully crafted scenes and masterful storytelling, we explore the depths of this concept, bringing it to life with stunning visuals and compelling narrative. Each moment builds upon the last, creating a cohesive story that resonates with viewers and leaves a lasting impact.`,
                        scenes: isActionScene ? [
                          {
                            id: "1",
                            duration: Math.floor(settings.duration * 0.15),
                            description: "A lone warrior standing on a cliff overlooking a dark, mystical valley shrouded in mist and ancient magic",
                            visualElements: "Dramatic wide shot, moody lighting, cinematic composition, fantasy landscape",
                            narration: "A brave warrior stands at the edge of a mystical realm, ancient sword gleaming in the ethereal light.",
                            imagePrompt: "Epic fantasy warrior with glowing sword standing on cliff edge, dark mystical valley below, dramatic lighting, cinematic composition, high detail"
                          },
                          {
                            id: "2", 
                            duration: Math.floor(settings.duration * 0.2),
                            description: "Massive dragon emerging from shadows, scales shimmering like obsidian, eyes glowing with ancient power",
                            visualElements: "Close-up dragon reveal, dramatic lighting, particle effects, intimidating perspective",
                            narration: "The ground trembles as a massive dragon emerges from the shadows, its scales shimmering like molten obsidian.",
                            imagePrompt: "Massive black dragon emerging from dark cave, glowing red eyes, obsidian scales, intimidating pose, fantasy art style, dramatic lighting"
                          },
                          {
                            id: "3",
                            duration: Math.floor(settings.duration * 0.25),
                            description: "Intense battle scene with warrior dodging dragon's fire breath, sword clashing against claws",
                            visualElements: "Dynamic action shots, fire effects, motion blur, epic battle choreography",
                            narration: "This is not just a battle - it's a test of courage, skill, and destiny. The warrior charges forward with determination.",
                            imagePrompt: "Epic battle scene warrior vs dragon, fire breath, sword combat, dynamic action pose, fantasy battle art, intense lighting"
                          },
                          {
                            id: "4",
                            duration: Math.floor(settings.duration * 0.25),
                            description: "Climactic moment as warrior's blade finds its mark, dragon roaring in defeat",
                            visualElements: "Dramatic close-up, victory pose, magical energy effects, triumphant lighting",
                            narration: "In a spectacular clash of steel and flame, good and evil collide in an epic confrontation.",
                            imagePrompt: "Warrior victory pose over defeated dragon, magical sword glowing, triumphant scene, epic fantasy art, golden lighting"
                          },
                          {
                            id: "5",
                            duration: Math.floor(settings.duration * 0.15),
                            description: "Peaceful aftermath with warrior watching sunset over the now-safe realm",
                            visualElements: "Serene wide shot, golden hour lighting, peaceful atmosphere, reflective mood",
                            narration: "The fate of the realm is secured, and peace returns to the land once more.",
                            imagePrompt: "Peaceful fantasy landscape at sunset, warrior silhouette, golden light, serene atmosphere, beautiful vista"
                          }
                        ] : [
                          {
                            id: "1",
                            duration: Math.floor(settings.duration * 0.3),
                            description: `Opening scene introducing the main concept: ${prompt}`,
                            visualElements: "Establishing shot, professional lighting, clean composition",
                            narration: `Welcome to an exploration of ${prompt}. Today we dive deep into this fascinating subject.`,
                            imagePrompt: `${prompt}, professional photography style, clean composition, modern aesthetic, high quality`
                          },
                          {
                            id: "2",
                            duration: Math.floor(settings.duration * 0.4),
                            description: `Detailed exploration and demonstration of ${prompt} with key insights and examples`,
                            visualElements: "Close-up details, dynamic angles, informative visuals",
                            narration: `Through careful analysis and detailed examination, we uncover the intricate details that make ${prompt} truly remarkable.`,
                            imagePrompt: `Detailed view of ${prompt}, informative style, dynamic composition, educational content, high detail`
                          },
                          {
                            id: "3",
                            duration: Math.floor(settings.duration * 0.3),
                            description: `Conclusion and final thoughts on ${prompt}`,
                            visualElements: "Conclusive shots, inspiring visuals, memorable ending",
                            narration: `As we conclude our journey through ${prompt}, we're left with a deeper understanding and appreciation for this incredible subject.`,
                            imagePrompt: `Conclusion scene about ${prompt}, inspiring visuals, memorable composition, professional finish`
                          }
                        ]
                      });
                      setIsGeneratingScript(false);
                      setScriptAnimationStep(4); // Show approval step
                    }, 4000);
                  }}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white py-3 rounded-lg font-medium transition-all duration-200 transform hover:scale-[1.02]"
                >
                  Generate Video ({estimatedCost} credits)
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  const renderSettingsStep = () => (
    <div className="relative flex size-full min-h-screen flex-col bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-colors duration-300" style={{fontFamily: '"Space Grotesk", "Noto Sans", sans-serif'}}>
      <div className="layout-container flex min-h-screen flex-col">
        {/* Header with enhanced visual appeal and dark theme support */}
        <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-gray-200 dark:border-gray-700 px-10 py-3 bg-white dark:bg-gray-800 shadow-sm transition-colors duration-300">
          <div className="flex items-center gap-4 text-gray-900 dark:text-gray-100">
            <div className="size-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center shadow-lg">
              <Video className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-gray-900 dark:text-gray-100 text-lg font-bold leading-tight tracking-[-0.015em]">VeeFore Studio</h2>
          </div>
          <div className="flex flex-1 justify-end gap-8">
            <div className="flex items-center gap-9">
              <a className="text-gray-700 dark:text-gray-300 text-sm font-medium leading-normal hover:text-purple-600 dark:hover:text-purple-400 transition-colors duration-200" href="#">Dashboard</a>
              <a className="text-gray-700 dark:text-gray-300 text-sm font-medium leading-normal hover:text-purple-600 dark:hover:text-purple-400 transition-colors duration-200" href="#">Templates</a>
              <a className="text-gray-700 dark:text-gray-300 text-sm font-medium leading-normal hover:text-purple-600 dark:hover:text-purple-400 transition-colors duration-200" href="#">Tutorials</a>
              <a className="text-gray-700 dark:text-gray-300 text-sm font-medium leading-normal hover:text-purple-600 dark:hover:text-purple-400 transition-colors duration-200" href="#">Community</a>
            </div>
            <button className="flex max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-xl h-10 bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 hover:from-gray-200 hover:to-gray-300 dark:hover:from-gray-600 dark:hover:to-gray-500 text-gray-900 dark:text-gray-100 gap-2 text-sm font-bold leading-normal tracking-[0.015em] min-w-0 px-2.5 transition-all duration-200 shadow-sm hover:shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" fill="currentColor" viewBox="0 0 256 256">
                <path d="M140,180a12,12,0,1,1-12-12A12,12,0,0,1,140,180ZM128,72c-22.06,0-40,16.15-40,36v4a8,8,0,0,0,16,0v-4c0-11,10.77-20,24-20s24,9,24,20-10.77,20-24,20a8,8,0,0,0-8,8v8a8,8,0,0,0,16,0v-.72c18.24-3.35,32-17.9,32-35.28C168,88.15,150.06,72,128,72Zm104,56A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"></path>
              </svg>
            </button>
            <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 ring-2 ring-purple-200 dark:ring-purple-600 shadow-lg" style={{backgroundImage: 'url("https://lh3.googleusercontent.com/a/ACg8ocJPrcoVstl69SDbEJG3VutOYCtG2q1O0L-jelhQ0JSevpHsGg=s96-c")'}}></div>
          </div>
        </header>

        {/* Main content area with enhanced visuals */}
        <div className="px-40 flex flex-1 justify-center py-5">
          <div className="layout-content-container flex flex-col max-w-[960px] flex-1">
            {/* Enhanced title section with animations and dark theme support */}
            <div className="text-center mb-8 animate-fade-in-up">
              <div className="inline-flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-r from-purple-500 via-blue-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg animate-pulse">
                  <Settings className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-gray-900 dark:text-gray-100 tracking-light text-[32px] font-bold leading-tight bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                  Configure Your Video Settings
                </h1>
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-base font-normal leading-normal max-w-2xl mx-auto">
                Customize every aspect of your video creation with our advanced AI-powered settings. From motion engines to voice synthesis, create exactly what you envision.
              </p>
              
              {/* Progress indicator */}
              <div className="flex items-center justify-center gap-2 mt-6">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <div className="w-8 h-2 bg-purple-500 rounded-full"></div>
                <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
              </div>
              <p className="text-sm text-gray-500 mt-2">Step 2 of 5 - Video Configuration</p>
            </div>
            
            {/* Enhanced Settings Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 px-4 animate-fade-in-up">
              {/* Duration & Quality - Enhanced with dark theme support */}
              <div className="group bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-2xl hover:border-purple-200 dark:hover:border-purple-600 transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
                    <Clock className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-gray-900 dark:text-gray-100 text-lg font-bold leading-tight tracking-[-0.015em]">Duration & Quality</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">Video Duration</label>
                    <select
                      value={settings.duration}
                      onChange={(e) => setSettings(prev => ({...prev, duration: parseInt(e.target.value)}))}
                      className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 border-none p-3 text-gray-900 dark:text-gray-100 focus:outline-0 focus:ring-0"
                    >
                      <option value={15}>15 seconds</option>
                      <option value={30}>30 seconds</option>
                      <option value={60}>1 minute</option>
                      <option value={90}>1.5 minutes</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">Resolution</label>
                    <select
                      value={settings.resolution}
                      onChange={(e) => setSettings(prev => ({...prev, resolution: e.target.value}))}
                      className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 border-none p-3 text-gray-900 dark:text-gray-100 focus:outline-0 focus:ring-0"
                    >
                      <option value="720p">720p HD</option>
                      <option value="1080p">1080p Full HD</option>
                      <option value="4K">4K Ultra HD</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">Aspect Ratio</label>
                    <select
                      value={settings.aspectRatio}
                      onChange={(e) => setSettings(prev => ({...prev, aspectRatio: e.target.value}))}
                      className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 border-none p-3 text-gray-900 dark:text-gray-100 focus:outline-0 focus:ring-0"
                    >
                      <option value="16:9">16:9 Landscape</option>
                      <option value="9:16">9:16 Portrait</option>
                      <option value="1:1">1:1 Square</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Motion Engine - Enhanced with dark theme support */}
              <div className="group bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-2xl hover:border-purple-200 dark:hover:border-purple-600 transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg flex items-center justify-center shadow-md">
                    <Zap className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-gray-900 dark:text-gray-100 text-lg font-bold leading-tight tracking-[-0.015em]">Motion Engine</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">Generation Method</label>
                    <select
                      value={settings.motionEngine}
                      onChange={(e) => setSettings(prev => ({...prev, motionEngine: e.target.value}))}
                      className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 border-none p-3 text-gray-900 dark:text-gray-100 focus:outline-0 focus:ring-0"
                    >
                      <option value="Auto">Auto (AI Decides) - Recommended</option>
                      <option value="Runway Gen-2">Runway Gen-2 (Cinematic Quality)</option>
                      <option value="AnimateDiff">AnimateDiff + Interpolation (Budget)</option>
                    </select>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                    {settings.motionEngine === 'Auto' && "AI analyzes scene complexity and credits to choose the best engine"}
                    {settings.motionEngine === 'Runway Gen-2' && "Premium cinematic quality. 10-20 credits per scene"}
                    {settings.motionEngine === 'AnimateDiff' && "Budget-friendly with smooth interpolation. 2-5 credits per scene"}
                  </div>
                  <div>
                    <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">Visual Style</label>
                    <select
                      value={settings.visualStyle}
                      onChange={(e) => setSettings(prev => ({...prev, visualStyle: e.target.value}))}
                      className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 border-none p-3 text-gray-900 dark:text-gray-100 focus:outline-0 focus:ring-0"
                    >
                      <option value="cinematic">Cinematic</option>
                      <option value="realistic">Realistic</option>
                      <option value="stylized">Stylized</option>
                      <option value="anime">Anime</option>
                      <option value="documentary">Documentary</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Voice & Audio - Enhanced with dark theme support */}
              <div className="group bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-2xl hover:border-emerald-200 dark:hover:border-emerald-600 transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-md">
                    <Mic className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-gray-900 dark:text-gray-100 text-lg font-bold leading-tight tracking-[-0.015em]">Voice & Audio</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">Voice Gender</label>
                    <select
                      value={settings.voiceGender}
                      onChange={(e) => setSettings(prev => ({...prev, voiceGender: e.target.value}))}
                      className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 border-none p-3 text-gray-900 dark:text-gray-100 focus:outline-0 focus:ring-0"
                    >
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="neutral">Neutral</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">Language & Accent</label>
                    <select
                      value={settings.voiceLanguage}
                      onChange={(e) => setSettings(prev => ({...prev, voiceLanguage: e.target.value}))}
                      className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 border-none p-3 text-gray-900 dark:text-gray-100 focus:outline-0 focus:ring-0"
                    >
                      <option value="English">English (American)</option>
                      <option value="English-UK">English (British)</option>
                      <option value="English-AU">English (Australian)</option>
                      <option value="Hindi">Hindi (Indian)</option>
                      <option value="Spanish">Spanish</option>
                      <option value="French">French</option>
                      <option value="German">German</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">Voice Tone</label>
                    <select
                      value={settings.voiceTone}
                      onChange={(e) => setSettings(prev => ({...prev, voiceTone: e.target.value}))}
                      className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 border-none p-3 text-gray-900 dark:text-gray-100 focus:outline-0 focus:ring-0"
                    >
                      <option value="professional">Professional</option>
                      <option value="casual">Casual</option>
                      <option value="energetic">Energetic</option>
                      <option value="calm">Calm</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                    <span className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal">Background Music</span>
                    <input
                      type="checkbox"
                      checked={settings.backgroundMusic}
                      onChange={(e) => setSettings(prev => ({...prev, backgroundMusic: e.target.checked}))}
                      className="rounded"
                    />
                  </div>
                </div>
              </div>

              {/* Avatar & Visual Features - Enhanced */}
              <div className="group bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-2xl hover:border-indigo-200 transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-cyan-600 rounded-lg flex items-center justify-center shadow-md">
                    <User className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-[#141414] text-lg font-bold leading-tight tracking-[-0.015em]">Avatar & Visual Features</h3>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-neutral-50 rounded-xl p-3">
                    <div>
                      <span className="text-[#141414] text-sm font-medium leading-normal block">AI Avatar</span>
                      <span className="text-neutral-500 text-xs">Talking head with lip sync</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.avatar}
                      onChange={(e) => setSettings(prev => ({...prev, avatar: e.target.checked}))}
                      className="rounded"
                    />
                  </div>
                  {settings.avatar && (
                    <>
                      <div>
                        <label className="text-[#141414] text-sm font-medium leading-normal block mb-2">Avatar Style</label>
                        <select
                          value={settings.avatarStyle}
                          onChange={(e) => setSettings(prev => ({...prev, avatarStyle: e.target.value}))}
                          className="w-full rounded-xl bg-neutral-50 border-none p-3 text-[#141414] focus:outline-0 focus:ring-0"
                        >
                          <option value="realistic">Realistic</option>
                          <option value="professional">Professional</option>
                          <option value="casual">Casual</option>
                          <option value="animated">Animated</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[#141414] text-sm font-medium leading-normal block mb-2">Avatar Position</label>
                        <select
                          value={settings.avatarPosition}
                          onChange={(e) => setSettings(prev => ({...prev, avatarPosition: e.target.value}))}
                          className="w-full rounded-xl bg-neutral-50 border-none p-3 text-[#141414] focus:outline-0 focus:ring-0"
                        >
                          <option value="corner">Corner Overlay</option>
                          <option value="intro-only">Intro Only (5-10s)</option>
                          <option value="fullscreen">Full Screen</option>
                          <option value="cutins">Story Cut-ins</option>
                        </select>
                      </div>
                    </>
                  )}
                  <div className="flex items-center justify-between bg-neutral-50 rounded-xl p-3">
                    <div>
                      <span className="text-[#141414] text-sm font-medium leading-normal block">Auto Captions</span>
                      <span className="text-neutral-500 text-xs">AI-generated subtitles</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.captions}
                      onChange={(e) => setSettings(prev => ({...prev, captions: e.target.checked}))}
                      className="rounded"
                    />
                  </div>
                  <div className="flex items-center justify-between bg-neutral-50 rounded-xl p-3">
                    <div>
                      <span className="text-[#141414] text-sm font-medium leading-normal block">On-Screen Text</span>
                      <span className="text-neutral-500 text-xs">Key quotes & highlights</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.onScreenText}
                      onChange={(e) => setSettings(prev => ({...prev, onScreenText: e.target.checked}))}
                      className="rounded"
                    />
                  </div>
                </div>
              </div>

              {/* Advanced Effects & Transitions - Enhanced */}
              <div className="group bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-2xl hover:border-orange-200 transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg flex items-center justify-center shadow-md">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-[#141414] text-lg font-bold leading-tight tracking-[-0.015em]">Effects & Transitions</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-[#141414] text-sm font-medium leading-normal block mb-2">Transition Style</label>
                    <select
                      value={settings.transitions}
                      onChange={(e) => setSettings(prev => ({...prev, transitions: e.target.value}))}
                      className="w-full rounded-xl bg-neutral-50 border-none p-3 text-[#141414] focus:outline-0 focus:ring-0"
                    >
                      <option value="smooth">Smooth Fade</option>
                      <option value="crossfade">Cross Fade</option>
                      <option value="slide">Slide Transition</option>
                      <option value="wipe">Wipe Effect</option>
                      <option value="zoom">Zoom Transition</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between bg-neutral-50 rounded-xl p-3">
                    <div>
                      <span className="text-[#141414] text-sm font-medium leading-normal block">Zoom Effects</span>
                      <span className="text-neutral-500 text-xs">Dynamic camera movements</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.zoomEffects}
                      onChange={(e) => setSettings(prev => ({...prev, zoomEffects: e.target.checked}))}
                      className="rounded"
                    />
                  </div>
                  <div className="flex items-center justify-between bg-neutral-50 rounded-xl p-3">
                    <div>
                      <span className="text-[#141414] text-sm font-medium leading-normal block">Color Grading</span>
                      <span className="text-neutral-500 text-xs">Cinematic color correction</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.enableColorGrading}
                      onChange={(e) => setSettings(prev => ({...prev, enableColorGrading: e.target.checked}))}
                      className="rounded"
                    />
                  </div>
                  <div>
                    <label className="text-[#141414] text-sm font-medium leading-normal block mb-2">Speed Control</label>
                    <select
                      value={settings.speedControl}
                      onChange={(e) => setSettings(prev => ({...prev, speedControl: parseFloat(e.target.value)}))}
                      className="w-full rounded-xl bg-neutral-50 border-none p-3 text-[#141414] focus:outline-0 focus:ring-0"
                    >
                      <option value={0.5}>0.5x (Slow Motion)</option>
                      <option value={0.75}>0.75x (Slow)</option>
                      <option value={1.0}>1.0x (Normal)</option>
                      <option value={1.25}>1.25x (Fast)</option>
                      <option value={1.5}>1.5x (Faster)</option>
                      <option value={2.0}>2.0x (Time-lapse)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Background Music & Audio Settings - Enhanced */}
              <div className="group bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-2xl hover:border-pink-200 transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-rose-600 rounded-lg flex items-center justify-center shadow-md">
                    <Music className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-[#141414] text-lg font-bold leading-tight tracking-[-0.015em]">Background Music</h3>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-neutral-50 rounded-xl p-3">
                    <div>
                      <span className="text-[#141414] text-sm font-medium leading-normal block">Enable Music</span>
                      <span className="text-neutral-500 text-xs">Add background soundtrack</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.backgroundMusic}
                      onChange={(e) => setSettings(prev => ({...prev, backgroundMusic: e.target.checked}))}
                      className="rounded"
                    />
                  </div>
                  {settings.backgroundMusic && (
                    <>
                      <div>
                        <label className="text-[#141414] text-sm font-medium leading-normal block mb-2">Music Genre</label>
                        <select
                          value={settings.musicGenre}
                          onChange={(e) => setSettings(prev => ({...prev, musicGenre: e.target.value}))}
                          className="w-full rounded-xl bg-neutral-50 border-none p-3 text-[#141414] focus:outline-0 focus:ring-0"
                        >
                          <option value="corporate">Corporate</option>
                          <option value="cinematic">Cinematic</option>
                          <option value="upbeat">Upbeat</option>
                          <option value="ambient">Ambient</option>
                          <option value="emotional">Emotional</option>
                          <option value="tech">Tech/Electronic</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[#141414] text-sm font-medium leading-normal block mb-2">Music Volume</label>
                        <input
                          type="range"
                          min="0.1"
                          max="0.8"
                          step="0.1"
                          value={settings.musicVolume}
                          onChange={(e) => setSettings(prev => ({...prev, musicVolume: parseFloat(e.target.value)}))}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-neutral-500 mt-1">
                          <span>Quiet</span>
                          <span>{Math.round(settings.musicVolume * 100)}%</span>
                          <span>Loud</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Credit Estimation & Cost Preview - Enhanced */}
              <div className="group bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-2xl hover:border-yellow-200 transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-yellow-500 to-amber-600 rounded-lg flex items-center justify-center shadow-md">
                    <DollarSign className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-[#141414] text-lg font-bold leading-tight tracking-[-0.015em]">Cost Estimation</h3>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Motion Engine:</span>
                    <span className="text-[#141414] font-medium">{settings.motionEngine}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Est. Credits per Scene:</span>
                    <span className="text-[#141414] font-medium">
                      {settings.motionEngine === 'Runway Gen-2' ? '10-20' : 
                       settings.motionEngine === 'AnimateDiff' ? '2-5' : 
                       'Auto (varies)'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Estimated Scenes:</span>
                    <span className="text-[#141414] font-medium">{Math.ceil(settings.duration / 10)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Voice Generation:</span>
                    <span className="text-[#141414] font-medium">5 credits</span>
                  </div>
                  {settings.avatar && (
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Avatar Lip Sync:</span>
                      <span className="text-[#141414] font-medium">15 credits</span>
                    </div>
                  )}
                  <hr className="border-gray-300" />
                  <div className="flex justify-between font-semibold">
                    <span className="text-[#141414]">Total Estimated:</span>
                    <span className="text-[#141414]">
                      {(() => {
                        const scenes = Math.ceil(settings.duration / 10);
                        const motionCost = settings.motionEngine === 'Runway Gen-2' ? scenes * 15 : 
                                         settings.motionEngine === 'AnimateDiff' ? scenes * 3.5 : 
                                         scenes * 8;
                        const voiceCost = 5;
                        const avatarCost = settings.avatar ? 15 : 0;
                        return Math.ceil(motionCost + voiceCost + avatarCost);
                      })()} credits
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500 mt-2">
                    * Final cost may vary based on actual scene complexity and AI optimization
                  </div>
                </div>
              </div>
            </div>
            
            {/* Modern Action Buttons with Floating Design and dark theme support */}
            <div className="flex px-4 py-8 justify-center gap-6">
              <button
                onClick={() => setCurrentStep('prompt')}
                className="group flex min-w-[120px] cursor-pointer items-center justify-center overflow-hidden rounded-2xl h-14 px-8 bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 hover:from-gray-200 hover:to-gray-300 dark:hover:from-gray-600 dark:hover:to-gray-500 text-gray-900 dark:text-gray-100 text-base font-bold leading-normal tracking-[0.015em] transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
              >
                <ArrowLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform duration-200" />
                <span className="truncate">Back</span>
              </button>
              <button
                onClick={generateScript}
                className="group flex min-w-[180px] cursor-pointer items-center justify-center overflow-hidden rounded-2xl h-14 px-8 bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 hover:from-purple-700 hover:via-blue-700 hover:to-indigo-700 text-white text-base font-bold leading-normal tracking-[0.015em] transition-all duration-300 shadow-lg hover:shadow-2xl transform hover:-translate-y-1 animate-pulse-glow"
              >
                <Wand2 className="w-5 h-5 mr-2 group-hover:rotate-12 transition-transform duration-200" />
                <span className="truncate">Generate Script</span>
                <Sparkles className="w-4 h-4 ml-2 group-hover:scale-110 transition-transform duration-200" />
              </button>
            </div>
            
            {/* Floating Action Hint with dark theme support */}
            <div className="flex justify-center pb-8">
              <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-full px-6 py-2 shadow-lg border border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  Configure your settings, then generate your AI script
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderScriptStep = () => {
    // Check if user hasn't configured settings properly
    if (!prompt.trim()) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 transition-colors duration-300">
          <div className="max-w-4xl mx-auto p-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Script Generation</h1>
              <p className="text-gray-600 dark:text-gray-400">Complete the workflow steps to generate your AI video script</p>
            </div>
            
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <AlertCircle className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Workflow Steps Required</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">Please complete the following steps in order:</p>
                
                <div className="space-y-4 mb-8">
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold">1</span>
                    </div>
                    <span className="text-gray-700 dark:text-gray-300">Enter your video prompt</span>
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
                      <span className="text-gray-600 dark:text-gray-300 font-bold">2</span>
                    </div>
                    <span className="text-gray-400 dark:text-gray-500">Configure video settings</span>
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
                      <span className="text-gray-600 dark:text-gray-300 font-bold">3</span>
                    </div>
                    <span className="text-gray-400 dark:text-gray-500">Generate AI script</span>
                  </div>
                </div>
                
                <button
                  onClick={() => setCurrentStep('prompt')}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8 py-3 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  Go to Prompt Step
                </button>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 transition-colors duration-300">
        <div className="max-w-7xl mx-auto p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Generated Script & Scenes</h1>
            <p className="text-gray-600 dark:text-gray-400">Review and customize your AI-generated video script</p>
          </div>

          {!generatedScript && !isGenerating ? (
            <div className="max-w-2xl mx-auto">
              <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Wand2 className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Ready to Generate Script</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">Click the button below to generate your AI video script with OpenAI</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    <strong>Prompt:</strong> {prompt}
                  </p>
                  
                  <button
                    onClick={generateScript}
                    disabled={isGenerating}
                    className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8 py-3 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50"
                  >
                    <Wand2 className="w-5 h-5 mr-2 inline" />
                    Generate Script with OpenAI
                  </button>
                </CardContent>
              </Card>
            </div>
          ) : isGenerating ? (
            <div className="max-w-2xl mx-auto">
              <Card className="bg-white">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                    <Wand2 className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold mb-4">Generating Your Script...</h3>
                  <Progress value={progress} className="h-2 mb-4" />
                  <p className="text-gray-600">AI is creating scenes and voiceover based on your prompt</p>
                </CardContent>
              </Card>
            </div>
          ) : generatedScript ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Script Overview */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="bg-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Script Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Total Duration</label>
                      <p className="text-lg">{generatedScript.totalDuration}s</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Scenes</label>
                      <p className="text-lg">{generatedScript.scenes.length}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Title</label>
                      <p className="text-gray-900 bg-blue-50 p-3 rounded-lg">{generatedScript.title}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Description</label>
                      <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">{generatedScript.fullScript || generatedScript.hook || 'No description available'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Scenes */}
              <Card className="bg-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clapperboard className="w-5 h-5" />
                    Video Scenes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {generatedScript.scenes.map((scene, index) => (
                      <div key={scene.id} className="border rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center font-medium">
                              {index + 1}
                            </div>
                            <span className="font-medium">Scene {index + 1}</span>
                          </div>
                          <Badge variant="outline">{scene.duration}s</Badge>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Visual</label>
                            <p className="text-gray-900">{scene.visualElements || scene.description}</p>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Camera & Lighting</label>
                            <p className="text-gray-700 text-sm">{scene.visualStyle || 'Standard'} • {scene.visualElements || 'Natural'}</p>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Voiceover</label>
                            <p className="text-gray-700 text-sm italic">"{scene.narration}"</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Controls */}
            <div className="space-y-6">
              <Card className="bg-white">
                <CardHeader>
                  <CardTitle>Script Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button className="w-full" variant="outline">
                    <Settings className="w-4 h-4 mr-2" />
                    Edit Script
                  </Button>
                  <Button className="w-full" variant="outline">
                    <Sparkles className="w-4 h-4 mr-2" />
                    Regenerate
                  </Button>
                  <Button 
                    className="w-full bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      setIsGenerating(true);
                      generateVideoMutation.mutate();
                    }}
                    disabled={isGenerating || generateVideoMutation.isPending}
                  >
                    <Video className="w-4 h-4 mr-2" />
                    {isGenerating || generateVideoMutation.isPending ? 'Generating Video...' : 'Generate Video'}
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardHeader>
                  <CardTitle>Your Prompt</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                    {prompt}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  const renderAdvancedSettings = () => (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <div className="max-w-6xl mx-auto p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Advanced Settings & Features</h1>
          <p className="text-gray-600">Customize your video generation parameters</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Settings Panel */}
          <div className="lg:col-span-2 space-y-6">
            {/* Video Settings */}
            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Video className="w-5 h-5" />
                  Video Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Clock className="w-4 h-4 inline mr-1" />
                      Duration
                    </label>
                    <select 
                      value={settings.duration}
                      onChange={(e) => setSettings(prev => ({...prev, duration: parseInt(e.target.value)}))}
                      className="w-full px-3 py-2 border rounded-lg bg-white"
                    >
                      <option value={30}>30 seconds</option>
                      <option value={60}>1 minute</option>
                      <option value={90}>1.5 minutes</option>
                      <option value={120}>2 minutes</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Aspect Ratio</label>
                    <select 
                      value={settings.aspectRatio}
                      onChange={(e) => setSettings(prev => ({...prev, aspectRatio: e.target.value}))}
                      className="w-full px-3 py-2 border rounded-lg bg-white"
                    >
                      <option value="16:9">16:9 (Landscape)</option>
                      <option value="9:16">9:16 (Portrait)</option>
                      <option value="1:1">1:1 (Square)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Resolution</label>
                    <select 
                      value={settings.resolution}
                      onChange={(e) => setSettings(prev => ({...prev, resolution: e.target.value}))}
                      className="w-full px-3 py-2 border rounded-lg bg-white"
                    >
                      <option value="720p">720p HD</option>
                      <option value="1080p">1080p Full HD</option>
                      <option value="4k">4K Ultra HD</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Palette className="w-4 h-4 inline mr-1" />
                      Visual Style
                    </label>
                    <select 
                      value={settings.visualStyle}
                      onChange={(e) => setSettings(prev => ({...prev, visualStyle: e.target.value}))}
                      className="w-full px-3 py-2 border rounded-lg bg-white"
                    >
                      <option value="cinematic">Cinematic</option>
                      <option value="realistic">Realistic</option>
                      <option value="animated">Animated</option>
                      <option value="artistic">Artistic</option>
                      <option value="corporate">Corporate</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Audio Settings */}
            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mic className="w-5 h-5" />
                  Audio & Voice
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Voice Gender</label>
                    <select 
                      value={settings.voiceGender}
                      onChange={(e) => setSettings(prev => ({...prev, voiceGender: e.target.value}))}
                      className="w-full px-3 py-2 border rounded-lg bg-white"
                    >
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Voice Tone</label>
                    <select 
                      value={settings.voiceTone}
                      onChange={(e) => setSettings(prev => ({...prev, voiceTone: e.target.value}))}
                      className="w-full px-3 py-2 border rounded-lg bg-white"
                    >
                      <option value="professional">Professional</option>
                      <option value="friendly">Friendly</option>
                      <option value="energetic">Energetic</option>
                      <option value="calm">Calm</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="flex items-center text-sm font-medium text-gray-700">
                        <Music className="w-4 h-4 mr-2" />
                        Background Music
                      </label>
                      <p className="text-xs text-gray-500">Add AI-generated background music</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.backgroundMusic}
                      onChange={(e) => setSettings(prev => ({...prev, backgroundMusic: e.target.checked}))}
                      className="rounded"
                    />
                  </div>
                  
                  {settings.backgroundMusic && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Music Genre</label>
                      <select 
                        value={settings.musicGenre}
                        onChange={(e) => setSettings(prev => ({...prev, musicGenre: e.target.value}))}
                        className="w-full px-3 py-2 border rounded-lg bg-white"
                      >
                        <option value="corporate">Corporate</option>
                        <option value="upbeat">Upbeat</option>
                        <option value="cinematic">Cinematic</option>
                        <option value="ambient">Ambient</option>
                      </select>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* AI Features */}
            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  AI Features
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="flex items-center text-sm font-medium text-gray-700">
                      <User className="w-4 h-4 mr-2" />
                      AI Avatar
                    </label>
                    <p className="text-xs text-gray-500">Add a virtual presenter to your video</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.avatar}
                    onChange={(e) => setSettings(prev => ({...prev, avatar: e.target.checked}))}
                    className="rounded"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Captions</label>
                    <p className="text-xs text-gray-500">Auto-generate subtitles</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.captions}
                    onChange={(e) => setSettings(prev => ({...prev, captions: e.target.checked}))}
                    className="rounded"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview & Actions */}
          <div className="space-y-6">
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Settings Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Duration:</span>
                    <span>{settings.duration}s</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Quality:</span>
                    <span>{settings.resolution}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Ratio:</span>
                    <span>{settings.aspectRatio}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Style:</span>
                    <span>{settings.visualStyle}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Generate Video</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                  onClick={async () => {
                    setIsGenerating(true);
                    setProgress(0);
                    try {
                      await generateVideoMutation.mutateAsync();
                    } catch (error) {
                      console.error('Video generation failed:', error);
                      setIsGenerating(false);
                    }
                  }}
                  disabled={isGenerating || !generatedScript}
                >
                  <Play className="w-4 h-4 mr-2" />
                  {isGenerating ? 'Generating Video...' : 'Generate Final Video'}
                </Button>
                <Button variant="outline" className="w-full">
                  <Eye className="w-4 h-4 mr-2" />
                  Preview Settings
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-0">
              <CardContent className="p-4">
                <h4 className="font-medium text-gray-900 mb-2">Pro Tip</h4>
                <p className="text-sm text-gray-700">
                  Higher resolution videos take longer to generate but provide better quality for professional use.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
  };

  const renderPreview = () => {
    const isVideoCompleted = currentJob?.status === 'completed' && currentJob?.finalVideo;
    const isVideoGenerating = currentJob?.status === 'generating' || isGenerating;
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 transition-colors duration-300">
        <div className="max-w-4xl mx-auto p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {isVideoCompleted ? 'Video Preview' : 'Video Generation'}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {isVideoCompleted ? 'Your AI-generated video is ready!' : 'AI is creating your video...'}
            </p>
          </div>

          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="p-8">
              {isVideoGenerating ? (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="w-20 h-20 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                      <Wand2 className="w-10 h-10 text-white" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">Creating Your Video</h3>
                    <p className="text-gray-600 mb-4">{currentJob?.currentStep || 'Starting video generation...'}</p>
                    <Progress value={currentJob?.progress || progress} className="h-3 mb-2" />
                    <p className="text-sm text-gray-500">{currentJob?.progress || progress}% complete</p>
                  </div>
                  
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-3">Generation Process</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-gray-700">Script processed</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${(currentJob?.progress || progress) > 20 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        <span className="text-gray-700">AI scenes generated</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${(currentJob?.progress || progress) > 50 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        <span className="text-gray-700">Motion applied</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${(currentJob?.progress || progress) > 80 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        <span className="text-gray-700">Voiceover added</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${(currentJob?.progress || progress) >= 100 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        <span className="text-gray-700">Final video compilation</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : isVideoCompleted ? (
                <>
                  <div className="aspect-video bg-gray-900 rounded-lg mb-6 flex items-center justify-center">
                    {currentJob?.finalVideo ? (
                      <video 
                        src={currentJob.finalVideo}
                        controls
                        className="w-full h-full rounded-lg"
                        poster={currentJob.thumbnailUrl}
                      />
                    ) : (
                      <div className="text-center text-white">
                        <Play className="w-20 h-20 mx-auto mb-4 opacity-70" />
                        <p className="text-xl">Generated Video Preview</p>
                        <p className="text-gray-400">Click to play your AI-generated video</p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="aspect-video bg-gray-900 rounded-lg mb-6 flex items-center justify-center">
                  <div className="text-center text-white">
                    <Play className="w-20 h-20 mx-auto mb-4 opacity-70" />
                    <p className="text-xl">Generated Video Preview</p>
                    <p className="text-gray-400">Click to play your AI-generated video</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Video Details</h3>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Duration:</span>
                      <span>{settings.duration}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Resolution:</span>
                      <span>{settings.resolution}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Style:</span>
                      <span>{settings.visualStyle}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Features</h3>
                  <div className="flex flex-wrap gap-2">
                    {settings.backgroundMusic && <Badge variant="secondary">Music</Badge>}
                    {settings.avatar && <Badge variant="secondary">AI Avatar</Badge>}
                    {settings.captions && <Badge variant="secondary">Captions</Badge>}
                    <Badge variant="secondary">{settings.voiceGender} Voice</Badge>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
              <Button 
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={!isVideoCompleted}
                onClick={() => {
                  if (currentJob?.finalVideo) {
                    const link = document.createElement('a');
                    link.href = currentJob.finalVideo;
                    link.download = `${currentJob.title || 'video'}.mp4`;
                    link.click();
                  }
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Download Video
              </Button>
              <Button variant="outline" className="flex-1">
                <Settings className="w-4 h-4 mr-2" />
                Edit Settings
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  setCurrentStep('prompt');
                  setPrompt('');
                  setGeneratedScript(null);
                  setCurrentJobId(null);
                  setIsGenerating(false);
                  setProgress(0);
                }}
              >
                Create New
              </Button>
            </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  // Main render logic
  const currentStepContent = () => {
  switch (currentStep) {
    case 'prompt':
      return renderPromptStep();
    case 'settings':
      return renderSettingsStep();
    case 'script':
      return renderScriptStep();
    case 'preview':
      return renderPreview();
    default:
      return renderPromptStep();
  }
  };

  return (
    <>
      {currentStepContent()}
      {renderToolsModal()}
      {renderGenerateModal()}
    </>
  );
};

function VideoGeneratorAdvancedWithSEO() {
  return (
    <>
      <SEO 
        {...seoConfig.videoGenerator}
        structuredData={generateStructuredData.softwareApplication()}
      />
      <VideoGeneratorAdvanced />
    </>
  )
}

export default VideoGeneratorAdvancedWithSEO;