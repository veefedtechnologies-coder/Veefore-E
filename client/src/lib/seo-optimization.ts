/**
 * P7.1-P7.3: SEO Optimization System
 * 
 * Comprehensive SEO implementation with meta tags, OpenGraph, 
 * and JSON-LD structured data for ≥90 Lighthouse scores
 */

interface SEOConfig {
  title: string;
  description: string;
  keywords?: string[];
  ogImage?: string;
  ogType?: string;
  canonical?: string;
  twitterCard?: string;
  structuredData?: any;
}

interface PageSEOData {
  [key: string]: SEOConfig;
}

/**
 * P7.1: Dynamic Meta Tag Management
 */
export class SEOManager {
  private static defaultConfig: SEOConfig = {
    title: 'VeeFore - AI-Powered Social Media Management Platform',
    description: 'Transform your social media presence with VeeFore\'s AI-powered content creation, automated scheduling, and comprehensive analytics. Grow your audience with intelligent automation.',
    keywords: [
      'social media management', 'AI content creation', 'social media automation',
      'Instagram management', 'social media scheduler', 'content analytics',
      'social media growth', 'digital marketing', 'social media tools'
    ],
    ogType: 'website',
    twitterCard: 'summary_large_image',
    ogImage: '/images/og-default.png'
  };

  private static pageSEOData: PageSEOData = {
    '/': {
      title: 'VeeFore - AI-Powered Social Media Management',
      description: 'Revolutionary social media management platform with AI-powered content creation, smart scheduling, and advanced analytics. Join thousands of creators growing their audience.',
      keywords: ['social media management', 'AI content creation', 'social media automation'],
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        'name': 'VeeFore',
        'description': 'AI-powered social media management platform',
        'applicationCategory': 'BusinessApplication',
        'operatingSystem': 'Web',
        'offers': {
          '@type': 'Offer',
          'price': '0',
          'priceCurrency': 'USD'
        }
      }
    },
    '/dashboard': {
      title: 'Dashboard - VeeFore',
      description: 'Manage all your social media accounts from one powerful dashboard. View analytics, schedule posts, and track performance across platforms.',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        'name': 'VeeFore Dashboard',
        'description': 'Social media management dashboard'
      }
    },
    '/create': {
      title: 'Create Content - VeeFore',
      description: 'Create engaging social media content with AI assistance. Generate posts, images, and videos optimized for each platform.',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        'name': 'Content Creator',
        'description': 'AI-powered content creation tool'
      }
    },
    '/analytics': {
      title: 'Analytics - VeeFore',
      description: 'Comprehensive social media analytics and insights. Track engagement, follower growth, and content performance across all platforms.',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'AnalysisNewsArticle',
        'name': 'Social Media Analytics',
        'description': 'Advanced social media performance analytics'
      }
    },
    '/integration': {
      title: 'Integrations - VeeFore',
      description: 'Connect your social media accounts including Instagram, Twitter, LinkedIn, and more. Centralized management for all platforms.',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'Service',
        'name': 'Social Media Integration',
        'description': 'Connect and manage multiple social media platforms'
      }
    }
  };

  /**
   * P7.2: OpenGraph and Twitter Card Implementation
   */
  static updatePageSEO(path: string, customConfig?: Partial<SEOConfig>): void {
    const pageConfig = { 
      ...this.defaultConfig, 
      ...this.pageSEOData[path], 
      ...customConfig 
    };

    // Update document title
    document.title = pageConfig.title;

    // Update meta tags
    this.updateMetaTag('description', pageConfig.description);
    this.updateMetaTag('keywords', pageConfig.keywords?.join(', ') || '');

    // Update OpenGraph tags
    this.updateMetaTag('og:title', pageConfig.title, 'property');
    this.updateMetaTag('og:description', pageConfig.description, 'property');
    this.updateMetaTag('og:type', pageConfig.ogType || 'website', 'property');
    this.updateMetaTag('og:image', pageConfig.ogImage || this.defaultConfig.ogImage!, 'property');
    this.updateMetaTag('og:url', window.location.href, 'property');
    this.updateMetaTag('og:site_name', 'VeeFore', 'property');

    // Update Twitter Card tags
    this.updateMetaTag('twitter:card', pageConfig.twitterCard || 'summary_large_image');
    this.updateMetaTag('twitter:title', pageConfig.title);
    this.updateMetaTag('twitter:description', pageConfig.description);
    this.updateMetaTag('twitter:image', pageConfig.ogImage || this.defaultConfig.ogImage!);
    this.updateMetaTag('twitter:site', '@VeeFore');

    // Update canonical URL
    this.updateLinkTag('canonical', pageConfig.canonical || window.location.href);

    // Update structured data
    if (pageConfig.structuredData) {
      this.updateStructuredData(pageConfig.structuredData);
    }

    console.log(`🔍 P7.2: Updated SEO for ${path}:`, pageConfig);
  }

  /**
   * P7.3: JSON-LD Structured Data Implementation
   */
  private static updateStructuredData(structuredData: any): void {
    // Remove existing structured data
    const existingScript = document.querySelector('script[type="application/ld+json"]');
    if (existingScript) {
      existingScript.remove();
    }

    // Add new structured data
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(structuredData);
    document.head.appendChild(script);

    console.log('🏷️ P7.3: Updated JSON-LD structured data:', structuredData);
  }

  static updateMetaTag(name: string, content: string, attribute: string = 'name'): void {
    let meta = document.querySelector(`meta[${attribute}="${name}"]`) as HTMLMetaElement;
    
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute(attribute, name);
      document.head.appendChild(meta);
    }
    
    meta.content = content;
  }

  static updateLinkTag(rel: string, href: string): void {
    let link = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement;
    
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      document.head.appendChild(link);
    }
    
    link.href = href;
  }
}

/**
 * P7.1: React Hook for SEO Management
 */
export function useSEO(path: string, config?: Partial<SEOConfig>) {
  useEffect(() => {
    SEOManager.updatePageSEO(path, config);
  }, [path, config]);
}

/**
 * P7.2: Organization and Website Schema
 */
export const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  'name': 'VeeFore',
  'description': 'AI-powered social media management platform helping creators and businesses grow their online presence',
  'url': 'https://veefore.com',
  'logo': {
    '@type': 'ImageObject',
    'url': 'https://veefore.com/logo.png'
  },
  'foundingDate': '2024',
  'sameAs': [
    'https://twitter.com/veefore',
    'https://linkedin.com/company/veefore'
  ],
  'contactPoint': {
    '@type': 'ContactPoint',
    'contactType': 'Customer Service',
    'email': 'support@veefore.com'
  }
};

/**
 * P7.3: Initialize Global SEO
 */
export function initializeSEO(): void {
  // Add organization schema
  const orgScript = document.createElement('script');
  orgScript.type = 'application/ld+json';
  orgScript.textContent = JSON.stringify(organizationSchema);
  document.head.appendChild(orgScript);

  // Add global meta tags
  SEOManager.updateMetaTag('application-name', 'VeeFore');
  SEOManager.updateMetaTag('theme-color', '#3b82f6');
  SEOManager.updateMetaTag('msapplication-TileColor', '#3b82f6');
  SEOManager.updateMetaTag('apple-mobile-web-app-capable', 'yes');
  SEOManager.updateMetaTag('apple-mobile-web-app-status-bar-style', 'default');

  console.log('🚀 P7.1-7.3: SEO Optimization System initialized');
}

// Import React for the hook and component
import { useEffect } from 'react';

/**
 * SEO Component for rendering meta tags
 */
export function SEO({ title, description, keywords, ogImage, ogType, canonical, twitterCard, structuredData }: SEOConfig) {
  useEffect(() => {
    SEOManager.updatePageSEO(window.location.pathname, {
      title,
      description,
      keywords,
      ogImage,
      ogType,
      canonical,
      twitterCard,
      structuredData
    });
  }, [title, description, keywords, ogImage, ogType, canonical, twitterCard, structuredData]);

  return null; // This component doesn't render anything
}

/**
 * Page-specific SEO configurations
 */
export const seoConfig = {
  dashboard: {
    title: 'Dashboard - VeeFore',
    description: 'Manage all your social media accounts from one powerful dashboard. View analytics, schedule posts, and track performance across platforms.',
    keywords: ['social media dashboard', 'analytics', 'content management']
  },
  profile: {
    title: 'Profile - VeeFore',
    description: 'Manage your VeeFore profile settings, preferences, and account information. Customize your social media management experience.',
    keywords: ['profile settings', 'account management', 'user preferences']
  },
  integration: {
    title: 'Integrations - VeeFore',
    description: 'Connect your social media accounts including Instagram, Twitter, LinkedIn, and more. Centralized management for all platforms.',
    keywords: ['social media integration', 'account connection', 'platform management']
  },
  create: {
    title: 'Create Content - VeeFore',
    description: 'Create engaging social media content with AI assistance. Generate posts, images, and videos optimized for each platform.',
    keywords: ['content creation', 'AI content', 'social media posts']
  },
  analytics: {
    title: 'Analytics - VeeFore',
    description: 'Comprehensive social media analytics and insights. Track engagement, follower growth, and content performance across all platforms.',
    keywords: ['social media analytics', 'performance tracking', 'engagement metrics']
  },
  landing: {
    title: 'VeeFore - AI-Powered Social Media Management',
    description: 'Revolutionary social media management platform with AI-powered content creation, smart scheduling, and advanced analytics. Join thousands of creators growing their audience.',
    keywords: ['social media management', 'AI content creation', 'social media automation']
  },
  settings: {
    title: 'Settings - VeeFore',
    description: 'Customize your VeeFore experience with theme, notification, and privacy settings. Personalize your social media management workflow.',
    keywords: ['settings', 'preferences', 'configuration', 'customization']
  },
  videoGenerator: {
    title: 'AI Video Generator - VeeFore',
    description: 'Create professional videos with AI assistance. Generate scripts, scenes, and complete video content for your social media campaigns.',
    keywords: ['AI video generation', 'video creator', 'social media videos', 'automated video production']
  },
  veeGPT: {
    title: 'VeeGPT AI Assistant - VeeFore',
    description: 'Chat with VeeGPT, your AI-powered social media assistant. Get content ideas, strategy advice, and automation help.',
    keywords: ['AI assistant', 'social media AI', 'content creation AI', 'VeeGPT']
  },
  automation: {
    title: 'Social Media Automation - VeeFore',
    description: 'Set up intelligent automation for your social media accounts. Auto-reply, schedule posts, and engage with your audience automatically.',
    keywords: ['social media automation', 'auto-reply', 'scheduled posting', 'automated engagement']
  }
};

/**
 * Generate structured data for different content types
 */
export const generateStructuredData = {
  softwareApplication: () => ({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    'name': 'VeeFore',
    'description': 'AI-powered social media management platform',
    'applicationCategory': 'BusinessApplication',
    'operatingSystem': 'Web',
    'offers': {
      '@type': 'Offer',
      'price': '0',
      'priceCurrency': 'USD'
    }
  }),
  webApplication: () => ({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    'name': 'VeeFore Dashboard',
    'description': 'Social media management dashboard'
  }),
  service: () => ({
    '@context': 'https://schema.org',
    '@type': 'Service',
    'name': 'Social Media Integration',
    'description': 'Connect and manage multiple social media platforms'
  }),
  creativeWork: () => ({
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    'name': 'Content Creator',
    'description': 'AI-powered content creation tool'
  }),
  organization: () => ({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    'name': 'VeeFore',
    'description': 'AI-powered social media management platform',
    'url': 'https://veefore.com',
    'logo': {
      '@type': 'ImageObject',
      'url': 'https://veefore.com/logo.png'
    }
  })
};