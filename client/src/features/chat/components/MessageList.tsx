import React, { memo, useRef, useEffect } from 'react'
import { VariableSizeList as List } from 'react-window'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { User, Copy, Edit, Trash2 } from 'lucide-react'

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

export type ChatMessage = {
  id: number
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  tokensUsed: number
  createdAt: Date | string
}

export interface MessageListProps {
  messages: ChatMessage[]
  streamingContent?: Record<number, string>
  isGenerating?: boolean
  onCopyMessage?: (content: string) => void
  onEditMessage?: (messageId: number) => void
  onDeleteMessage?: (messageId: number) => void
}

interface MessageItemProps {
  message: ChatMessage
  streamingContent?: string
  isGenerating?: boolean
  onCopyMessage?: (content: string) => void
  onEditMessage?: (messageId: number) => void
  onDeleteMessage?: (messageId: number) => void
}

// Memoized individual message component to prevent unnecessary re-renders
const MessageItem = memo<MessageItemProps>(({ 
  message, 
  streamingContent, 
  isGenerating,
  onCopyMessage,
  onEditMessage,
  onDeleteMessage 
}) => {
  const displayContent = streamingContent !== undefined ? streamingContent : message.content
  const formattedContent = message.role === 'assistant' ? convertToMarkdown(displayContent) : displayContent

  const handleCopy = () => {
    if (onCopyMessage && displayContent) {
      onCopyMessage(displayContent)
      // Could show a toast notification here
    }
  }

  const handleEdit = () => {
    if (onEditMessage) {
      onEditMessage(message.id)
    }
  }

  const handleDelete = () => {
    if (onDeleteMessage) {
      onDeleteMessage(message.id)
    }
  }

  return (
    <div
      className={`flex flex-col space-y-2 ${
        message.role === 'user' ? 'items-end' : 'items-start'
      }`}
    >
      <div className={`${
        message.role === 'user' 
          ? 'max-w-sm w-fit' 
          : 'max-w-4xl w-full'
      }`} style={{
        minWidth: 0,
        overflow: 'hidden'
      }}>
        {/* Message Header */}
        {message.role === 'user' && (
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center justify-between">
            <div className="flex items-center">
              <User className="w-3 h-3 mr-1" />
              You
            </div>
            {/* User message actions */}
            <div className="flex items-center space-x-2 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {onEditMessage && (
                <button
                  onClick={handleEdit}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                  title="Edit message"
                >
                  <Edit className="w-3 h-3" />
                </button>
              )}
              {onDeleteMessage && (
                <button
                  onClick={handleDelete}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                  title="Delete message"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}
        {message.role === 'assistant' && (
          <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-2 flex items-center justify-between">
            <div className="flex items-center">
              <img src="/veefore-logo.png" alt="VeeFore" className="w-4 h-4" />
              <span className="ml-0.25">
                {isGenerating ? "eegpt • Analyzing..." : "eegpt • Response Ready"}
              </span>
            </div>
            {/* Assistant message actions */}
            {displayContent && (
              <div className="flex items-center space-x-2 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {onCopyMessage && (
                  <button
                    onClick={handleCopy}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                    title="Copy message"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Message Content */}
        <div 
          className={`group px-4 py-3 rounded-2xl ${
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
              className="leading-relaxed markdown-content"
              style={{
                wordWrap: 'break-word',
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
                whiteSpace: 'pre-wrap',
                maxWidth: '100%',
                width: '100%'
              }}
            >
              {displayContent ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ node, inline, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '')
                      const codeString = String(children).replace(/\n$/, '')
                      
                      return !inline && match ? (
                        <div className="relative group">
                          <SyntaxHighlighter
                            style={vscDarkPlus}
                            language={match[1]}
                            PreTag="div"
                            {...props}
                          >
                            {codeString}
                          </SyntaxHighlighter>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(codeString)
                            }}
                            className="absolute top-2 right-2 p-2 bg-gray-700 hover:bg-gray-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Copy code"
                          >
                            <Copy className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      ) : (
                        <code className={`${className} bg-gray-200 dark:bg-gray-800 px-1 py-0.5 rounded text-sm`} {...props}>
                          {children}
                        </code>
                      )
                    },
                    h1: ({ children }) => (
                      <h1 className="text-3xl font-bold mb-4 mt-6 text-gray-900 dark:text-gray-100">{children}</h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-2xl font-bold mb-3 mt-5 text-gray-900 dark:text-gray-100">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-xl font-semibold mb-2 mt-4 text-gray-900 dark:text-gray-100">{children}</h3>
                    ),
                    p: ({ children }) => (
                      <p className="mb-4 leading-relaxed text-gray-800 dark:text-gray-200">{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc list-inside mb-4 space-y-2 text-gray-800 dark:text-gray-200">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal list-inside mb-4 space-y-2 text-gray-800 dark:text-gray-200">{children}</ol>
                    ),
                    li: ({ children }) => (
                      <li className="ml-4 text-gray-800 dark:text-gray-200">{children}</li>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-blue-500 pl-4 italic my-4 text-gray-700 dark:text-gray-300">{children}</blockquote>
                    ),
                    a: ({ href, children }) => (
                      <a href={href} className="text-blue-600 dark:text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>
                    ),
                    table: ({ children }) => (
                      <div className="overflow-x-auto mb-4">
                        <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">{children}</table>
                      </div>
                    ),
                    th: ({ children }) => (
                      <th className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">{children}</th>
                    ),
                    td: ({ children }) => (
                      <td className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-800 dark:text-gray-200">{children}</td>
                    ),
                  }}
                >
                  {formattedContent}
                </ReactMarkdown>
              ) : (
                <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
                  <div className="animate-pulse">●</div>
                  <div className="animate-pulse delay-100">●</div>
                  <div className="animate-pulse delay-200">●</div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm">{displayContent}</div>
          )}
        </div>
        
        {/* Timestamp */}
        <div className="text-xs text-gray-500 dark:text-gray-500 mt-1 px-2">
          {new Date(message.createdAt).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </div>
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  // Only re-render if these specific props change
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.streamingContent === nextProps.streamingContent &&
    prevProps.isGenerating === nextProps.isGenerating
  )
})

MessageItem.displayName = 'MessageItem'

/**
 * MessageList Component
 * 
 * A performant message list component with virtual scrolling for large conversations.
 * Features:
 * - Virtual scrolling using react-window for efficient rendering
 * - Markdown rendering with syntax highlighting
 * - Optimized with React.memo to prevent unnecessary re-renders
 * - Support for real-time streaming content
 * - Message actions (copy, edit, delete)
 * - Automatic scroll to bottom on new messages
 * 
 * @example
 * ```tsx
 * <MessageList
 *   messages={messages}
 *   streamingContent={streamingContent}
 *   isGenerating={isGenerating}
 *   onCopyMessage={(content) => navigator.clipboard.writeText(content)}
 * />
 * ```
 */
export const MessageList = memo<MessageListProps>(({ 
  messages, 
  streamingContent = {},
  isGenerating = false,
  onCopyMessage,
  onEditMessage,
  onDeleteMessage 
}) => {
  const listRef = useRef<List>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rowHeights = useRef<Record<number, number>>({})

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (listRef.current && messages.length > 0) {
      // Scroll to the last message
      listRef.current.scrollToItem(messages.length - 1, 'end')
    }
  }, [messages.length])

  // Calculate row height dynamically based on content
  const getRowHeight = (index: number) => {
    // Return cached height if available
    if (rowHeights.current[index]) {
      return rowHeights.current[index]
    }
    
    const message = messages[index]
    const isUser = message.role === 'user'
    
    // Estimate height based on content length
    // This is a rough estimate - actual height will be measured after render
    const contentLength = message.content.length
    const estimatedLines = Math.ceil(contentLength / (isUser ? 50 : 100))
    const baseHeight = isUser ? 80 : 120
    const lineHeight = 24
    
    return baseHeight + (estimatedLines * lineHeight)
  }

  // Set row height after measurement
  const setRowHeight = (index: number, size: number) => {
    if (rowHeights.current[index] !== size) {
      rowHeights.current[index] = size
      if (listRef.current) {
        listRef.current.resetAfterIndex(index)
      }
    }
  }

  // Row renderer for react-window
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const message = messages[index]
    const rowRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
      if (rowRef.current) {
        const height = rowRef.current.getBoundingClientRect().height
        setRowHeight(index, height)
      }
    }, [index, message.content])

    return (
      <div style={style}>
        <div ref={rowRef} className="px-4 py-4">
          <MessageItem
            message={message}
            streamingContent={streamingContent[message.id]}
            isGenerating={isGenerating}
            onCopyMessage={onCopyMessage}
            onEditMessage={onEditMessage}
            onDeleteMessage={onDeleteMessage}
          />
        </div>
      </div>
    )
  }

  // For small message lists (< 100 messages), render without virtualization
  if (messages.length < 100) {
    return (
      <div className="space-y-8 overflow-x-hidden">
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            streamingContent={streamingContent[message.id]}
            isGenerating={isGenerating}
            onCopyMessage={onCopyMessage}
            onEditMessage={onEditMessage}
            onDeleteMessage={onDeleteMessage}
          />
        ))}
      </div>
    )
  }

  // For large message lists (>= 100 messages), use virtual scrolling
  return (
    <div ref={containerRef} className="w-full h-full">
      <List
        ref={listRef}
        height={containerRef.current?.clientHeight || 600}
        itemCount={messages.length}
        itemSize={getRowHeight}
        width="100%"
        overscanCount={5}
      >
        {Row}
      </List>
    </div>
  )
}, (prevProps, nextProps) => {
  // Custom comparison for MessageList
  // Only re-render if messages array changes or streaming content changes
  return (
    prevProps.messages === nextProps.messages &&
    prevProps.streamingContent === nextProps.streamingContent &&
    prevProps.isGenerating === nextProps.isGenerating
  )
})

MessageList.displayName = 'MessageList'

export default MessageList
