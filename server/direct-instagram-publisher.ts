import { FastVideoCompressor } from './fast-video-compressor';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

export class DirectInstagramPublisher {
  static async publishVideoWithIntelligentCompression(
    accessToken: string,
    videoUrl: string,
    caption: string
  ): Promise<{ id: string; permalink?: string; }> {
    
    let currentVideoUrl = videoUrl;
    let hasCompressed = false;
    
    // Check if large file needs immediate compression
    if (videoUrl.includes('/uploads/') && !videoUrl.startsWith('http')) {
      const localPath = path.join(process.cwd(), videoUrl.startsWith('/') ? videoUrl.slice(1) : videoUrl);
      
      if (fs.existsSync(localPath)) {
        const fileSizeMB = fs.statSync(localPath).size / 1024 / 1024;
        console.log(`[DIRECT PUBLISH] Video file size: ${fileSizeMB.toFixed(2)}MB`);
        
        if (fileSizeMB > 25) {
          console.log(`[DIRECT PUBLISH] Large file detected - compressing before upload`);
          
          try {
            const compressionResult = await FastVideoCompressor.compressVideoForInstagram(localPath);
            
            if (compressionResult.success && compressionResult.outputPath) {
              const compressedSizeMB = compressionResult.compressedSize! / 1024 / 1024;
              console.log(`[DIRECT PUBLISH] Video compressed: ${fileSizeMB.toFixed(2)}MB → ${compressedSizeMB.toFixed(2)}MB`);
              
              const compressedPath = compressionResult.outputPath.replace(process.cwd(), '').replace(/\\/g, '/');
              currentVideoUrl = compressedPath.startsWith('/') ? compressedPath : '/' + compressedPath;
              hasCompressed = true;
            }
          } catch (error) {
            console.error(`[DIRECT PUBLISH] Compression failed:`, error);
          }
        }
      }
    }
    
    // Ensure full URL for Instagram API - environment agnostic
    const getBaseUrl = () => {
      if (process.env.REPLIT_DEV_DOMAIN) {
        return `https://${process.env.REPLIT_DEV_DOMAIN}`;
      }
      if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
        return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
      }
      if (process.env.VITE_APP_URL) {
        return process.env.VITE_APP_URL;
      }
      // Local development fallback
      return process.env.NODE_ENV === 'production' ? 'https://your-domain.com' : 'http://localhost:5000';
    };
    
    const baseUrl = getBaseUrl();
    
    const fullVideoUrl = currentVideoUrl.startsWith('http') 
      ? currentVideoUrl 
      : `${baseUrl}${currentVideoUrl}`;
    
    console.log(`[DIRECT PUBLISH] Publishing video: ${fullVideoUrl}`);
    
    try {
      // Create media container
      const containerResponse = await axios.post(`https://graph.instagram.com/me/media`, {
        video_url: fullVideoUrl,
        caption: caption,
        media_type: 'REELS',
        access_token: accessToken
      });
      
      const containerId = containerResponse.data.id;
      console.log(`[DIRECT PUBLISH] Container created: ${containerId}`);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Publish the container
      const publishResponse = await axios.post(`https://graph.instagram.com/me/media_publish`, {
        creation_id: containerId,
        access_token: accessToken
      });
      
      console.log(`[DIRECT PUBLISH] Successfully published${hasCompressed ? ' (compressed)' : ''}: ${publishResponse.data.id}`);
      
      return {
        id: publishResponse.data.id,
        permalink: `https://www.instagram.com/p/${publishResponse.data.id}`
      };
      
    } catch (error: any) {
      console.error(`[DIRECT PUBLISH] Initial publish failed:`, error.response?.data || error.message);
      
      // If not already compressed and the error suggests file issues, try compression
      if (!hasCompressed && error.response?.data?.error?.message?.includes('processing')) {
        console.log(`[DIRECT PUBLISH] Retrying with compression after processing failure`);
        
        try {
          const originalPath = videoUrl.includes('/uploads/') && !videoUrl.startsWith('http')
            ? path.join(process.cwd(), videoUrl.startsWith('/') ? videoUrl.slice(1) : videoUrl)
            : null;
            
          if (originalPath && fs.existsSync(originalPath)) {
            const compressionResult = await FastVideoCompressor.compressVideoForInstagram(originalPath);
            
            if (compressionResult.success && compressionResult.outputPath) {
              const compressedPath = compressionResult.outputPath.replace(process.cwd(), '').replace(/\\/g, '/');
              const compressedUrl = compressedPath.startsWith('/') ? compressedPath : '/' + compressedPath;
              const fullCompressedUrl = `${baseUrl}${compressedUrl}`;
              
              console.log(`[DIRECT PUBLISH] Publishing compressed video: ${fullCompressedUrl}`);
              
              // Create container with compressed video
              const compressedContainerResponse = await axios.post(`https://graph.instagram.com/me/media`, {
                video_url: fullCompressedUrl,
                caption: caption,
                media_type: 'REELS',
                access_token: accessToken
              });
              
              const compressedContainerId = compressedContainerResponse.data.id;
              console.log(`[DIRECT PUBLISH] Compressed container created: ${compressedContainerId}`);
              
              // Wait for processing
              await new Promise(resolve => setTimeout(resolve, 15000));
              
              // Publish compressed container
              const compressedPublishResponse = await axios.post(`https://graph.instagram.com/me/media_publish`, {
                creation_id: compressedContainerId,
                access_token: accessToken
              });
              
              console.log(`[DIRECT PUBLISH] Successfully published compressed video: ${compressedPublishResponse.data.id}`);
              
              return {
                id: compressedPublishResponse.data.id,
                permalink: `https://www.instagram.com/p/${compressedPublishResponse.data.id}`
              };
            }
          }
        } catch (compressionError: any) {
          console.error(`[DIRECT PUBLISH] Compression retry failed:`, compressionError.response?.data || compressionError.message);
        }
      }
      
      throw new Error(`Instagram publish failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}