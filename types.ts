
export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export interface ProcessingOptions {
  tolerance: number;
  smoothness: number;
  targetColor: RGBColor;
  autoDetect: boolean;
  brushSize: number; // 画笔大小
}

export interface ImageDataState {
  originalUrl: string;
  processedUrl: string | null;
  width: number;
  height: number;
}
