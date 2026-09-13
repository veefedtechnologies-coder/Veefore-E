/**
 * Generative video provider adapters — public surface (task 17.5, Req 7.6–7.8).
 *
 * The provider-neutral `VideoAIProvider` interface plus the concrete Gemini Omni
 * and Veo adapters. Every adapter calls its provider SERVER-SIDE through the
 * Gemini-backed transport (`AIServiceManager`/Gemini SDK) so provider API keys
 * never reach the browser (Req 7.8), and is classified "integrated" only after a
 * real successful call (Req 7.7).
 */

// Provider-neutral interface, request/response types, cost estimation shape,
// integration status, transport contract, and the No-Mock base adapter (Req 7.6, 7.7).
export * from './video-ai-provider';

// Default server-side transport backed by AIServiceManager/Gemini SDK (Req 7.8).
export * from './gemini-video-transport';

// Concrete adapters.
export * from './gemini-omni-adapter';
export * from './veo-adapter';
