/**
 * Data transformation utilities for automation feature
 * Handles conversion between API responses and UI-friendly formats
 */

import { SocialAccount, ContentPost } from '../types/automation.types'

/**
 * Transform raw social account data from API to UI format
 */
export const transformSocialAccounts = (accountsData: any[]): SocialAccount[] => {
  if (!Array.isArray(accountsData)) return []
  
  return accountsData.map((account: any) => ({
    id: account.id,
    name: `@${account.username}`,
    followers: `${(account.followersCount || 0).toLocaleString()} followers`,
    platform: account.platform,
    avatar: account.profilePictureUrl || `https://picsum.photos/40/40?random=${account.id}`,
    workspaceId: account.workspaceId
  }))
}

/**
 * Transform raw posts data from API to UI format
 */
export const transformPosts = (postsData: any[]): ContentPost[] => {
  if (!Array.isArray(postsData)) return []
  
  return postsData.map((post: any) => {
    const contentData = post.contentData || {}
    const metrics = post.metrics || {}

    // Map content type to automation-friendly labels
    const rawType = (post.type || contentData.mediaType || 'image').toLowerCase()
    let mappedType: 'post' | 'reel' | 'story' = 'post'
    if (rawType === 'video' || rawType === 'reel') mappedType = 'reel'
    else if (rawType === 'carousel_album' || rawType === 'carousel') mappedType = 'post'
    else if (rawType === 'story') mappedType = 'story'

    // Get thumbnail - prefer thumbnailUrl, then mediaUrl
    const image = contentData.thumbnailUrl || contentData.mediaUrl || ''
    
    // Get caption - prefer description (full), fall back to title
    const caption = post.description || post.title || ''
    const displayTitle = caption.length > 30 
      ? caption.substring(0, 30) + '...' 
      : (caption || 'Instagram Post')

    return {
      id: post._id?.toString() || post.id || contentData.externalId,
      externalId: contentData.externalId,
      title: displayTitle,
      type: mappedType,
      image,
      mediaUrl: contentData.mediaUrl || '',
      thumbnailUrl: contentData.thumbnailUrl || image,
      permalink: contentData.permalink || '',
      likes: metrics.likes || 0,
      comments: metrics.comments || 0,
      shares: metrics.shares || 0,
      saves: metrics.saves || 0,
      reach: metrics.reach || 0,
      caption: caption || 'Instagram post content',
      publishedAt: post.publishedAt || post.createdAt
    }
  })
}
