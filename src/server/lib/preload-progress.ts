/** Shared in-memory map for TTS preload SSE progress */
export const preloadProgress = new Map<string, { done: number; total: number; finished: boolean }>();
