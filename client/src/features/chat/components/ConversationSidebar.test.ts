/**
 * ConversationSidebar Component Tests
 * 
 * Tests conversation list filtering and data processing logic
 */

import { describe, it, expect } from 'vitest'
import { ChatConversation } from '../types/chat.types'

// Test data
const mockConversations: ChatConversation[] = [
  {
    id: 1,
    userId: 'user1',
    workspaceId: 'workspace1',
    title: 'First conversation',
    messageCount: 5,
    lastMessageAt: new Date('2024-01-01'),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  },
  {
    id: 2,
    userId: 'user1',
    workspaceId: 'workspace1',
    title: 'Second conversation',
    messageCount: 3,
    lastMessageAt: new Date('2024-01-02'),
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02')
  },
  {
    id: 3,
    userId: 'user1',
    workspaceId: 'workspace1',
    title: 'Marketing ideas',
    messageCount: 10,
    lastMessageAt: new Date('2024-01-03'),
    createdAt: new Date('2024-01-03'),
    updatedAt: new Date('2024-01-03')
  }
]

/**
 * Filter conversations by search query (extracted logic from ConversationSidebar)
 */
function filterConversations(conversations: ChatConversation[], searchQuery: string): ChatConversation[] {
  return conversations.filter(conv => 
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  )
}

/**
 * Get user display name (extracted logic from ConversationSidebar)
 */
function getUserDisplayName(userData: { displayName?: string; email?: string } | null): string {
  if (!userData) return 'User'
  return userData.displayName || userData.email?.split('@')[0] || 'User'
}

/**
 * Get user initials (extracted logic from ConversationSidebar)
 */
function getUserInitials(userData: { displayName?: string; email?: string } | null): string {
  if (!userData) return 'U'
  if (userData.displayName) return userData.displayName.charAt(0).toUpperCase()
  if (userData.email) return userData.email.charAt(0).toUpperCase()
  return 'U'
}

describe('ConversationSidebar - Search and Filter Logic', () => {
  describe('filterConversations', () => {
    it('should return all conversations when search query is empty', () => {
      const result = filterConversations(mockConversations, '')
      expect(result).toEqual(mockConversations)
      expect(result.length).toBe(3)
    })

    it('should filter conversations by title (case insensitive)', () => {
      const result = filterConversations(mockConversations, 'marketing')
      expect(result.length).toBe(1)
      expect(result[0].title).toBe('Marketing ideas')
    })

    it('should filter conversations with partial match', () => {
      const result = filterConversations(mockConversations, 'conversation')
      expect(result.length).toBe(2)
      expect(result[0].title).toBe('First conversation')
      expect(result[1].title).toBe('Second conversation')
    })

    it('should be case insensitive', () => {
      const result1 = filterConversations(mockConversations, 'MARKETING')
      const result2 = filterConversations(mockConversations, 'marketing')
      const result3 = filterConversations(mockConversations, 'MaRkEtInG')
      
      expect(result1).toEqual(result2)
      expect(result2).toEqual(result3)
      expect(result1.length).toBe(1)
    })

    it('should return empty array when no matches found', () => {
      const result = filterConversations(mockConversations, 'nonexistent')
      expect(result).toEqual([])
      expect(result.length).toBe(0)
    })

    it('should handle empty conversations array', () => {
      const result = filterConversations([], 'test')
      expect(result).toEqual([])
    })

    it('should filter by first word', () => {
      const result = filterConversations(mockConversations, 'first')
      expect(result.length).toBe(1)
      expect(result[0].title).toBe('First conversation')
    })

    it('should filter by last word', () => {
      const result = filterConversations(mockConversations, 'ideas')
      expect(result.length).toBe(1)
      expect(result[0].title).toBe('Marketing ideas')
    })
  })

  describe('getUserDisplayName', () => {
    it('should return displayName when available', () => {
      const userData = { displayName: 'John Doe', email: 'john@example.com' }
      expect(getUserDisplayName(userData)).toBe('John Doe')
    })

    it('should return email username when displayName is not available', () => {
      const userData = { email: 'john@example.com' }
      expect(getUserDisplayName(userData)).toBe('john')
    })

    it('should return "User" when userData is null', () => {
      expect(getUserDisplayName(null)).toBe('User')
    })

    it('should return "User" when both displayName and email are undefined', () => {
      const userData = {}
      expect(getUserDisplayName(userData)).toBe('User')
    })

    it('should extract username from email correctly', () => {
      const userData = { email: 'test.user@company.com' }
      expect(getUserDisplayName(userData)).toBe('test.user')
    })
  })

  describe('getUserInitials', () => {
    it('should return first letter of displayName when available', () => {
      const userData = { displayName: 'John Doe', email: 'john@example.com' }
      expect(getUserInitials(userData)).toBe('J')
    })

    it('should return first letter of email when displayName is not available', () => {
      const userData = { email: 'test@example.com' }
      expect(getUserInitials(userData)).toBe('T')
    })

    it('should return "U" when userData is null', () => {
      expect(getUserInitials(null)).toBe('U')
    })

    it('should return "U" when both displayName and email are undefined', () => {
      const userData = {}
      expect(getUserInitials(userData)).toBe('U')
    })

    it('should capitalize the initial', () => {
      const userData = { displayName: 'alice' }
      expect(getUserInitials(userData)).toBe('A')
    })
  })
})

describe('ConversationSidebar - Data Structure Validation', () => {
  it('should validate ChatConversation structure', () => {
    const conversation: ChatConversation = mockConversations[0]
    
    expect(conversation).toHaveProperty('id')
    expect(conversation).toHaveProperty('userId')
    expect(conversation).toHaveProperty('workspaceId')
    expect(conversation).toHaveProperty('title')
    expect(conversation).toHaveProperty('messageCount')
    expect(conversation).toHaveProperty('lastMessageAt')
    expect(conversation).toHaveProperty('createdAt')
    expect(conversation).toHaveProperty('updatedAt')
    
    expect(typeof conversation.id).toBe('number')
    expect(typeof conversation.userId).toBe('string')
    expect(typeof conversation.title).toBe('string')
    expect(typeof conversation.messageCount).toBe('number')
  })

  it('should handle conversations with different message counts', () => {
    const conversations = mockConversations
    const messageCounts = conversations.map(c => c.messageCount)
    
    expect(messageCounts).toContain(5)
    expect(messageCounts).toContain(3)
    expect(messageCounts).toContain(10)
  })

  it('should preserve conversation order', () => {
    const filtered = filterConversations(mockConversations, '')
    
    expect(filtered[0].id).toBe(1)
    expect(filtered[1].id).toBe(2)
    expect(filtered[2].id).toBe(3)
  })
})

describe('ConversationSidebar - Edge Cases', () => {
  it('should handle special characters in search query', () => {
    const conversations: ChatConversation[] = [
      {
        id: 1,
        userId: 'user1',
        workspaceId: 'workspace1',
        title: 'Test & Development',
        messageCount: 1,
        lastMessageAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]
    
    const result = filterConversations(conversations, '&')
    expect(result.length).toBe(1)
  })

  it('should handle very long conversation titles', () => {
    const longTitle = 'A'.repeat(200)
    const conversations: ChatConversation[] = [
      {
        id: 1,
        userId: 'user1',
        workspaceId: 'workspace1',
        title: longTitle,
        messageCount: 1,
        lastMessageAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]
    
    const result = filterConversations(conversations, 'AAA')
    expect(result.length).toBe(1)
  })

  it('should handle whitespace in search query', () => {
    // Filter doesn't trim, so whitespace is included in the search
    const result = filterConversations(mockConversations, '  first  ')
    expect(result.length).toBe(0) // No match because of leading/trailing spaces
    
    // But it should work without extra whitespace
    const result2 = filterConversations(mockConversations, 'first')
    expect(result2.length).toBe(1)
  })

  it('should handle numeric characters in titles', () => {
    const conversations: ChatConversation[] = [
      {
        id: 1,
        userId: 'user1',
        workspaceId: 'workspace1',
        title: 'Meeting 2024',
        messageCount: 1,
        lastMessageAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]
    
    const result = filterConversations(conversations, '2024')
    expect(result.length).toBe(1)
  })
})

describe('ConversationSidebar - Performance Considerations', () => {
  it('should handle large conversation lists efficiently', () => {
    const largeList: ChatConversation[] = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      userId: 'user1',
      workspaceId: 'workspace1',
      title: `Conversation ${i}`,
      messageCount: i,
      lastMessageAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    }))
    
    const start = Date.now()
    const result = filterConversations(largeList, 'Conversation 999')
    const duration = Date.now() - start
    
    expect(result.length).toBe(1)
    expect(duration).toBeLessThan(100) // Should complete in less than 100ms
  })

  it('should handle multiple filter operations', () => {
    let result = filterConversations(mockConversations, '')
    result = filterConversations(result, 'conversation')
    result = filterConversations(result, 'first')
    
    expect(result.length).toBe(1)
    expect(result[0].title).toBe('First conversation')
  })
})
