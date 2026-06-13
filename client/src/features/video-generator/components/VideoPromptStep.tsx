import React from 'react';
import { Sparkles } from 'lucide-react';

interface VideoPromptStepProps {
  prompt: string;
  setPrompt: (prompt: string) => void;
  onGenerateClick: () => void;
  isGenerating: boolean;
  isVideoSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onToolsModalOpen: () => void;
}

/**
 * VideoPromptStep Component
 * 
 * Displays the initial prompt input interface for video generation.
 * Features:
 * - Gemini-inspired greeting and layout
 * - Suggestion cards with example prompts
 * - Expandable textarea with auto-resize
 * - Tool buttons for attachments, tools, and voice input
 * - Generate button that appears when prompt is entered
 * 
 * Requirements: 2.1, 2.2, 5.2
 */
export const VideoPromptStep: React.FC<VideoPromptStepProps> = ({
  prompt,
  setPrompt,
  onGenerateClick,
  isGenerating,
  onToolsModalOpen,
}) => {
  // Suggestion prompts for quick start
  const suggestionPrompts = [
    {
      title: 'Make my own custom mini figure',
      layout: 'col-span-4 row-span-2',
      icon: (
        <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      ),
    },
    {
      title: 'Turn me into a superhero',
      layout: 'col-span-4 row-span-2',
      gradient: 'from-red-500 via-orange-500 to-yellow-500',
      centerIcon: (
        <div className="w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center">
          <span className="text-red-600 font-bold text-lg">S</span>
        </div>
      ),
    },
    {
      title: 'Give me an 80s style makeover',
      layout: 'col-span-4 row-span-1',
      gradient: 'from-purple-500 via-pink-500 to-cyan-400',
      smallIcon: <div className="w-6 h-6 bg-pink-400 rounded-full"></div>,
    },
    {
      title: 'Create a professional headshot',
      layout: 'col-span-4 row-span-1',
      gradient: 'from-blue-500 via-indigo-500 to-purple-500',
      smallIcon: (
        <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
          <svg className="w-3 h-3 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
        </div>
      ),
    },
  ];

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    // Auto-resize with max height limit
    const textarea = e.target;
    textarea.style.height = 'auto';
    const newHeight = Math.min(150, Math.max(20, textarea.scrollHeight));
    textarea.style.height = newHeight + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && prompt.trim()) {
      e.preventDefault();
      onGenerateClick();
    }
  };

  return (
    <>
      {/* Custom CSS for textarea and animations */}
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

        /* Hide scrollbar for Chrome, Safari and Opera */
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        
        /* Hide scrollbar for IE, Edge and Firefox */
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      {/* Main content area */}
      <div className="flex-1 flex flex-col px-8 py-16 overflow-y-auto">
        {!isGenerating ? (
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

              {/* Suggestion Cards - Gemini Layout with Mixed Grid */}
              <div className="max-w-4xl w-full mb-16">
                <div className="grid grid-cols-12 grid-rows-2 gap-3 h-48">
                  {suggestionPrompts.map((suggestion, index) => (
                    <div
                      key={index}
                      className={`${suggestion.layout} group cursor-pointer`}
                      onClick={() => setPrompt(suggestion.title)}
                    >
                      <div className="bg-gray-800 hover:bg-gray-750 rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-lg border border-gray-700 hover:border-gray-600 h-full">
                        {suggestion.gradient ? (
                          // Image-based card layout
                          suggestion.layout.includes('row-span-2') ? (
                            <div className="relative w-full h-full">
                              <div className={`w-full h-full bg-gradient-to-br ${suggestion.gradient} rounded-2xl`}>
                                <div className="absolute inset-0 bg-black bg-opacity-20 rounded-2xl"></div>
                                <div className="absolute bottom-0 left-0 right-0 p-3">
                                  <h3 className="text-white text-sm font-medium">{suggestion.title}</h3>
                                </div>
                                {suggestion.centerIcon && (
                                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                                    {suggestion.centerIcon}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            // Small horizontal card
                            <div className="flex items-center p-3 h-full">
                              <div className="flex-1">
                                <h3 className="text-white text-sm font-medium">{suggestion.title}</h3>
                              </div>
                              <div className="w-12 h-12 rounded-xl overflow-hidden ml-3 flex-shrink-0">
                                <div className={`w-full h-full bg-gradient-to-br ${suggestion.gradient} flex items-center justify-center`}>
                                  {suggestion.smallIcon}
                                </div>
                              </div>
                            </div>
                          )
                        ) : (
                          // Text-based card layout
                          <div className="flex flex-col justify-between p-4 h-full">
                            <div>
                              <h3 className="text-white text-sm font-medium mb-2">{suggestion.title}</h3>
                            </div>
                            <div className="w-full h-20 rounded-xl overflow-hidden">
                              <div className="w-full h-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center">
                                {suggestion.icon}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
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
                    maxHeight: '200px',
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
                      onChange={handleTextareaChange}
                      onKeyDown={handleKeyDown}
                      className="bg-transparent text-gray-700 dark:text-gray-300 placeholder-gray-400 text-base focus:outline-none focus:ring-0 focus:border-none min-h-[20px] max-h-[150px] py-1 resize-none overflow-y-auto w-full scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent"
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
                        outlineOffset: '0',
                        outlineWidth: '0',
                        borderRadius: '0',
                        borderColor: 'transparent !important',
                        WebkitTapHighlightColor: 'transparent',
                        scrollbarWidth: 'thin',
                        scrollbarColor: '#4B5563 transparent'
                      } as React.CSSProperties}
                    />
                  </div>
                  
                  {/* Tools button */}
                  <button
                    onClick={onToolsModalOpen}
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
                    onClick={onGenerateClick}
                    disabled={isGenerating}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-6 py-2 rounded-full font-medium transition-colors duration-200 flex items-center gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Generate Video</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          // Loading state
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
      </div>
    </>
  );
};
