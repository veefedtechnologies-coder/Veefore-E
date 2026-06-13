// Canvas fallback for when canvas package is not available
let canvasModule: any = null;

try {
  canvasModule = await import('canvas');
} catch (error) {
  console.warn('[CANVAS] Canvas package not available - thumbnail generation will be limited');
}

export const createCanvas = canvasModule?.createCanvas || (() => {
  throw new Error('Canvas package not installed - thumbnail generation requires canvas');
});

export const loadImage = canvasModule?.loadImage || (() => {
  throw new Error('Canvas package not installed');
});

export const registerFont = canvasModule?.registerFont || (() => {
  console.warn('[CANVAS] registerFont not available');
});

export const isCanvasAvailable = () => canvasModule !== null;
