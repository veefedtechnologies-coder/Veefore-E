import React, { useRef, useEffect } from 'react'
import { 
  Mic,
  Send,
  Paperclip,
  Square
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { SkeletonChatMessage } from '@/components/ui/skeleton'

// Types
type ChatMessage = {
  id: number
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  tokensUsed: number
  createdAt: Date | string
}

interface ChatInterfaceProps {
  messages: ChatMessage[]
  messagesLoading: boolean
  isGenerating: boolean
  aiStatus: string | null
  inputText: string
  streamingContent: { [key: number]: string }
  onInputChange: (text: string) => void
  onSendMessage: () => void
  onStopGeneration: () => void
  onKeyPress: (e: React.KeyboardEvent) => void
}

// Function to convert text patterns to proper markdown headings
const convertToMarkdown = (text: string): string => {
  let result = text;
  
  // Convert "**Title: Something**" or "Title: Something" to "# Something" 
  result = result.replace(/^\*\*Title:\s*(.+)\*\*$/gm, '# $1');
  result = result.replace(/^Title:\s*(.+)$/gm, '# $1');
  // Convert "**Job Title: Something**" or "Job Title: Something" to "# Something" (MAIN TITLE)
  result = result.replace(/^\*\*Job Title:\s*(.+)\*\*$/gm, '# $1');
  result = result.replace(/^Job Title:\s*(.+)$/gm, '# $1');
  
  // Convert section headers ending with colon to ## headers (H2 - large) 
  result = result.replace(/^(About Us):\s*$/gm, '## $1');
  result = result.replace(/^(Key Responsibilities):\s*$/gm, '## $1');
  result = result.replace(/^(Position Overview):\s*$/gm, '## $1');
  result = result.replace(/^(Requirements):\s*$/gm, '## $1');
  result = result.replace(/^(Qualifications):\s*$/gm, '## $1');
  result = result.replace(/^(Responsibilities):\s*$/gm, '## $1');
  result = result.replace(/^(Overview):\s*$/gm, '## $1');
  result = result.replace(/^(Summary):\s*$/gm, '## $1');
  result = result.replace(/^(Introduction):\s*$/gm, '## $1');
  result = result.replace(/^(Conclusion):\s*$/gm, '## $1');
  // General pattern for any heading ending with colon
  result = result.replace(/^([A-Z][A-Za-z\s]{2,}):\s*$/gm, '## $1');
  result = result.replace(/^(The Evolution of Communication.*)$/gm, '## $1');
  result = result.replace(/^(Community Building and Networking.*)$/gm, '## $1');
  result = result.replace(/^(Content Creation and.*)$/gm, '## $1');
  result = result.replace(/^(Raising Awareness and.*)$/gm, '## $1');
  result = result.replace(/^(Introduction.*)$/gm, '## $1');
  result = result.replace(/^(Conclusion.*)$/gm, '## $1');
  result = result.replace(/^(Overview.*)$/gm, '## $1');
  result = result.replace(/^(Summary.*)$/gm, '## $1');
  
  // Convert sub-headings with colons to ### headers (H3 - medium)
  result = result.replace(/^(\d+\.\s*)?([A-Z][A-Za-z\s&]+):\s*$/gm, '### $2');
  // Convert patterns like "Position: Something" to ### headers (but NOT Job Title - that's handled above)
  result = result.replace(/^\*\*(?!Job Title)([A-Z][A-Za-z\s]+):\*\*\s*(.+)$/gm, '### $1\n$2');
  result = result.replace(/^(?!Job Title)([A-Z][A-Za-z\s]+):\s*(.+)$/gm, '### $1\n$2');
  
  // Convert "Effects of Something" and "Causes of Something" patterns
  result = result.replace(/^(Effects? of [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Causes? of [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Benefits? of [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Types? of [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Role of [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Impact of [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Importance of [A-Za-z\s]+)$/gm, '## $1');
  
  // Convert common action-based headings
  result = result.replace(/^(Raising [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Building [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Creating [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Developing [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Promoting [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Understanding [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Addressing [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Educating [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Mobilizing [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Influencing [A-Za-z\s]+)$/gm, '## $1');
  
  return result;
};

// Messages skeleton component
const MessagesSkeleton = () => (
  <div className="space-y-6 px-4">
    <SkeletonChatMessage isUser={true} />
    <SkeletonChatMessage isUser={false} />
    <SkeletonChatMessage isUser={true} />
  </div>
)

/**
 * ChatInterface Component
 * 
 * Main chat UI component extracted from VeeGPT.tsx
 * Handles message display, input, and real-time streaming
 * 
 * Features:
 * - Message list with markdown rendering
 * - Real-time streaming content display
 * - Typing indicators and AI status
 * - Message input with send/stop controls
 * - Connection status indicators
 */
export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  messagesLoading,
  isGenerating,
  aiStatus,
  inputText,
  streamingContent,
  onInputChange,
  onSendMessage,
  onStopGeneration,
  onKeyPress
}) => {
  const inputRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 relative">
      {/* Messages */}
      <div 
        className="flex-1 overflow-y-auto overflow-x-hidden p-6 bg-gradient-to-b from-gray-50/30 to-white dark:from-gray-800/30 dark:to-gray-900" 
        style={{ paddingBottom: '140px' }}
      >
        <div className="max-w-4xl mx-auto space-y-8 overflow-x-hidden">
          {messagesLoading && messages.length === 0 ? (
            <MessagesSkeleton />
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex flex-col space-y-2 ${
                  message.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div 
                  className={`${
                    message.role === 'user' 
                      ? 'max-w-sm w-fit' 
                      : 'max-w-4xl w-full'
                  }`} 
                  style={{
                    minWidth: 0,
                    overflow: 'hidden'
                  }}
                >
                  {/* Message Header */}
                  {message.role === 'user' && (
                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center">
                      <span>You</span>
                    </div>
                  )}
                  {message.role === 'assistant' && (
                    <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-2 flex items-center">
                      <img src="/veefore-logo.png" alt="VeeFore" className="w-4 h-4" />
                      <span className="ml-0.25">
                        {isGenerating ? "eegpt • Analyzing..." : "eegpt • Response Ready"}
                      </span>
                    </div>
                  )}
                  
                  {/* Message Content */}
                  <div 
                    className={`px-4 py-3 rounded-2xl ${
                      message.role === 'user'
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 inline-block'
                        : 'bg-transparent text-gray-900 dark:text-gray-100'
                    }`} 
                    style={{
                      wordWrap: 'break-word',
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      maxWidth: '100%'
                    }}
                  >
                    {message.role === 'assistant' ? (
                      <div 
                        className="leading-relaxed"
                        style={{
                          wordWrap: 'break-word',
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word',
                          whiteSpace: 'pre-wrap',
                          maxWidth: '100%',
                          width: '100%'
                        }}
                      >
                        {streamingContent[message.id] !== undefined ? (
                          <div className="markdown-content">
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]}
                              components={{
                                h1: ({children}) => <h1 className="font-black mb-6 text-gray-900 dark:text-gray-100 leading-tight" style={{fontSize: '2.5rem'}}>{children}</h1>,
                                h2: ({children}) => <h2 className="font-black mb-1 text-gray-900 dark:text-gray-100 leading-tight" style={{fontSize: '2rem'}}>{children}</h2>,
                                h3: ({children}) => <h3 className="font-black mb-1 text-gray-900 dark:text-gray-100 leading-tight" style={{fontSize: '1.5rem'}}>{children}</h3>,
                                h4: ({children}) => <h4 className="font-black mb-1 text-gray-900 dark:text-gray-100 leading-tight" style={{fontSize: '1.25rem'}}>{children}</h4>,
                                p: ({children}) => <p className="mb-1 leading-relaxed font-semibold text-gray-900 dark:text-gray-100" style={{fontSize: '1rem'}}>{children}</p>,
                                strong: ({children}) => <strong className="font-black text-gray-900 dark:text-gray-100">{children}</strong>,
                                ul: ({children}) => <ul>{children}</ul>,
                                ol: ({children}) => <ol>{children}</ol>,
                                li: ({children}) => <li>{children}</li>,
                                code: ({children}) => <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono font-semibold text-gray-900 dark:text-gray-100" style={{fontSize: '0.875rem'}}>{children}</code>,
                                pre: ({children}) => <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto mb-3 font-semibold text-gray-900 dark:text-gray-100">{children}</pre>
                              }}
                            >
                              {convertToMarkdown(streamingContent[message.id] || '')}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div className="markdown-content">
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]}
                              components={{
                                h1: ({children}) => <h1 className="font-black mb-6 text-gray-900 dark:text-gray-100 leading-tight" style={{fontSize: '2.5rem'}}>{children}</h1>,
                                h2: ({children}) => <h2 className="font-black mb-1 text-gray-900 dark:text-gray-100 leading-tight" style={{fontSize: '2rem'}}>{children}</h2>,
                                h3: ({children}) => <h3 className="font-black mb-1 text-gray-900 dark:text-gray-100 leading-tight" style={{fontSize: '1.5rem'}}>{children}</h3>,
                                h4: ({children}) => <h4 className="font-black mb-1 text-gray-900 dark:text-gray-100 leading-tight" style={{fontSize: '1.25rem'}}>{children}</h4>,
                                p: ({children}) => <p className="mb-1 leading-relaxed font-semibold text-gray-900 dark:text-gray-100" style={{fontSize: '1rem'}}>{children}</p>,
                                strong: ({children}) => <strong className="font-black text-gray-900 dark:text-gray-100">{children}</strong>,
                                ul: ({children}) => <ul>{children}</ul>,
                                ol: ({children}) => <ol>{children}</ol>,
                                li: ({children}) => <li>{children}</li>,
                                code: ({children}) => <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono font-semibold text-gray-900 dark:text-gray-100" style={{fontSize: '0.875rem'}}>{children}</code>,
                                pre: ({children}) => <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto mb-3 font-semibold text-gray-900 dark:text-gray-100">{children}</pre>
                              }}
                            >
                              {convertToMarkdown(message.content)}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div 
                        className="leading-relaxed"
                        style={{
                          wordWrap: 'break-word',
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word',
                          whiteSpace: 'pre-wrap',
                          maxWidth: '100%',
                          width: '100%'
                        }}
                      >
                        <div className="font-semibold text-gray-900 dark:text-gray-100">{message.content}</div>
                      </div>
                    )}
                  </div>
                  
                  {/* Message Timestamp */}
                  <div className={`mt-2 text-xs text-gray-500 dark:text-gray-400 ${
                    message.role === 'user' ? 'text-right' : 'text-left'
                  }`}>
                    {message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    }) : new Date().toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
          
          {/* AI Status Indicator - shows when AI is processing before streaming */}
          {aiStatus && (
            <div className="flex flex-col space-y-2 items-start">
              <div className="max-w-4xl w-full">
                <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-2 flex items-center">
                  <img src="/veefore-logo.png" alt="VeeFore" className="w-4 h-4" />
                  <span className="ml-0.25">
                    {isGenerating ? "eegpt • Analyzing..." : "eegpt • Response Ready"}
                  </span>
                </div>
                <div className="bg-transparent px-4 py-3 rounded-2xl">
                  <div className="flex items-center text-gray-600 dark:text-gray-400">
                    <span 
                      className="text-sm font-medium text-gray-500 dark:text-gray-400"
                      style={{
                        background: 'linear-gradient(90deg, #9CA3AF 25%, #D1D5DB 50%, #9CA3AF 75%)',
                        backgroundSize: '200% 100%',
                        backgroundClip: 'text',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        animation: 'shimmer 2s infinite'
                      }}
                    >
                      {aiStatus}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Truly floating transparent input - absolute position within chat area */}
      <div style={{ 
        position: 'absolute',
        bottom: '40px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: '48rem',
        padding: '0 24px',
        pointerEvents: 'none',
        zIndex: 1000
      }}>
        {/* Pill-shaped transparent container */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          padding: '12px 16px',
          border: '1px solid rgba(209, 213, 219, 0.2)',
          borderRadius: '25px',
          background: 'rgba(255, 255, 255, 0.05)',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)',
          transition: 'all 0.2s ease',
          pointerEvents: 'auto',
          minHeight: '44px'
        }}>
          <button style={{
            background: 'transparent',
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            padding: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: '2px'
          }}>
            <Paperclip style={{ 
              width: '20px', 
              height: '20px',
              color: '#6b7280'
            }} />
          </button>
          
          <div style={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            alignItems: 'flex-start',
            minHeight: '20px'
          }}>
            <div
              ref={inputRef}
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => {
                const text = e.currentTarget.innerText
                onInputChange(text)
              }}
              onKeyDown={onKeyPress}
              style={{
                width: '100%',
                minHeight: '20px',
                maxHeight: '120px',
                overflowY: 'auto',
                overflowX: 'hidden',
                outline: 'none',
                border: 'none',
                background: 'transparent',
                backgroundColor: 'transparent',
                color: '#374151',
                fontSize: '16px',
                lineHeight: '24px',
                padding: '0',
                margin: '0',
                boxShadow: 'none',
                borderRadius: 0,
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                appearance: 'none',
                position: 'relative',
                wordWrap: 'break-word',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'break-word'
              }}
              data-placeholder={inputText.length === 0 ? "Message VeeGPT" : ""}
            />
          </div>
          
          {isGenerating ? (
            <button
              onClick={onStopGeneration}
              style={{
                background: 'transparent',
                backgroundColor: 'transparent',
                border: 'none',
                outline: 'none',
                padding: '4px',
                cursor: 'pointer',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: '2px'
              }}
              title="Stop generation"
            >
              <Square style={{ width: '18px', height: '18px' }} />
            </button>
          ) : (
            <button
              onClick={onSendMessage}
              disabled={!inputText.trim()}
              style={{
                background: 'transparent',
                backgroundColor: 'transparent',
                border: 'none',
                outline: 'none',
                padding: '4px',
                cursor: inputText.trim() ? 'pointer' : 'not-allowed',
                color: inputText.trim() ? '#1f2937' : '#9ca3af',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: '2px'
              }}
            >
              <Send style={{ width: '20px', height: '20px' }} />
            </button>
          )}

          <button style={{
            background: 'transparent',
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            padding: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Mic style={{ 
              width: '20px', 
              height: '20px',
              color: '#6b7280'
            }} />
          </button>
        </div>
      </div>
      
      {/* Footer text positioned below the floating input */}
      <div style={{ 
        position: 'absolute',
        bottom: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        textAlign: 'center',
        pointerEvents: 'none',
        zIndex: 999
      }}>
        <div className="text-xs text-gray-500 dark:text-gray-400 px-3 py-1">
          VeeGPT can make mistakes. Check important info.
        </div>
      </div>
    </div>
  )
}
