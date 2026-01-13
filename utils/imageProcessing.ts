
import { RGBColor } from '../types';

export const getColorDistance = (c1: RGBColor, c2: RGBColor): number => {
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
};

export const detectBackgroundColor = (ctx: CanvasRenderingContext2D, width: number, height: number): RGBColor => {
  const samples = [
    ctx.getImageData(0, 0, 1, 1).data,
    ctx.getImageData(width - 1, 0, 1, 1).data,
    ctx.getImageData(0, height - 1, 1, 1).data,
    ctx.getImageData(width - 1, height - 1, 1, 1).data,
    ctx.getImageData(Math.floor(width / 2), 0, 1, 1).data,
  ];

  let r = 0, g = 0, b = 0;
  samples.forEach(s => {
    r += s[0];
    g += s[1];
    b += s[2];
  });

  return {
    r: Math.round(r / samples.length),
    g: Math.round(g / samples.length),
    b: Math.round(b / samples.length),
  };
};

export const makeTransparent = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  targetColor: RGBColor,
  tolerance: number,
  smoothness: number = 20 // 默认平滑度
): string => {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // 避免除以 0
  const smoothRange = Math.max(smoothness, 1);

  for (let i = 0; i < data.length; i += 4) {
    const currentPixel: RGBColor = {
      r: data[i],
      g: data[i + 1],
      b: data[i + 2],
    };

    const distance = getColorDistance(currentPixel, targetColor);

    if (distance <= tolerance) {
      // 在容差范围内，完全透明
      data[i + 3] = 0;
    } else if (distance <= tolerance + smoothRange) {
      // 在平滑过渡范围内，计算线性透明度
      // 距离 tolerance 越近越透明，距离 tolerance + smoothRange 越近越不透明
      const alpha = ((distance - tolerance) / smoothRange) * 255;
      data[i + 3] = Math.min(255, Math.max(0, alpha));
      
      // 可选：为了防止背景色残留导致的色偏，可以在半透明区域尝试恢复像素颜色
      // 这里保持简单，只调整 Alpha 即可显著改善锯齿
    } else {
      // 范围之外，完全不透明
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return ctx.canvas.toDataURL('image/png');
};
