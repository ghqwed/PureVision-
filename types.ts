
export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export interface ProcessingOptions {
  tolerance: number;   // 容差：完全透明的范围
  smoothness: number;  // 平滑度：过渡区域的范围
  targetColor: RGBColor;
  autoDetect: boolean;
}

export interface ImageDataState {
  originalUrl: string;
  processedUrl: string | null;
  width: number;
  height: number;
}
