
import React, { useState, useRef, useCallback } from 'react';
import { Upload, Download, RefreshCw, Settings, Trash2, Eye, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { RGBColor, ProcessingOptions, ImageDataState } from './types';
import { detectBackgroundColor, makeTransparent } from './utils/imageProcessing';

const App: React.FC = () => {
  const [image, setImage] = useState<ImageDataState | null>(null);
  const [options, setOptions] = useState<ProcessingOptions>({
    tolerance: 20,
    smoothness: 30,
    targetColor: { r: 255, g: 255, b: 255 },
    autoDetect: true,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAiUpscaling, setIsAiUpscaling] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 初始化 AI
  const runAiUpscale = async () => {
    if (!image?.originalUrl) return;
    setIsAiUpscaling(true);

    try {
      // 获取图片的 base64
      const response = await fetch(image.originalUrl);
      const blob = await response.blob();
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(blob);
      });
      const base64Data = await base64Promise;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const aiResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: blob.type,
              },
            },
            {
              text: "Please redraw this icon in high resolution. Enhance the clarity, sharpen the edges, and remove noise. Keep the style identical. Output the enhanced icon on a solid pure background matching the original's primary background color.",
            },
          ],
        },
      });

      let newImageUrl = '';
      for (const part of aiResponse.candidates[0].content.parts) {
        if (part.inlineData) {
          newImageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (newImageUrl) {
        setImage({
          originalUrl: newImageUrl,
          processedUrl: null,
          width: 0,
          height: 0
        });
        // 自动触发一次去底处理
        processImage(newImageUrl, { ...options, autoDetect: true });
      }
    } catch (error) {
      console.error("AI Upscale failed:", error);
      alert("AI 增强失败，请稍后重试。");
    } finally {
      setIsAiUpscaling(false);
    }
  };

  const processImage = useCallback(async (imgUrl: string, currentOptions: ProcessingOptions) => {
    setIsProcessing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imgUrl;

    img.onload = () => {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      let target = currentOptions.targetColor;
      if (currentOptions.autoDetect) {
        target = detectBackgroundColor(ctx, img.width, img.height);
        setOptions(prev => ({ ...prev, targetColor: target }));
      }

      const processedUrl = makeTransparent(
        ctx, 
        img.width, 
        img.height, 
        target, 
        currentOptions.tolerance, 
        currentOptions.smoothness
      );
      
      setImage(prev => prev ? {
        ...prev,
        processedUrl,
        width: img.width,
        height: img.height
      } : null);
      
      setIsProcessing(false);
    };
  }, [options]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImage({
        originalUrl: url,
        processedUrl: null,
        width: 0,
        height: 0
      });
      processImage(url, { ...options, autoDetect: true });
    }
  };

  const handleApplySettings = () => {
    if (image?.originalUrl) {
      processImage(image.originalUrl, { ...options, autoDetect: false });
    }
  };

  const rgbToHex = (c: RGBColor) => {
    const componentToHex = (x: number) => {
      const hex = x.toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    };
    return "#" + componentToHex(c.r) + componentToHex(c.g) + componentToHex(c.b);
  };

  const hexToRgb = (hex: string): RGBColor => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center">
      <header className="w-full max-w-5xl mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            PureVision <ShieldCheck className="text-indigo-500" />
          </h1>
          <p className="text-slate-500 font-medium">图标自动处理工作台</p>
        </div>
        {image && (
          <button 
            onClick={() => setImage(null)}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-semibold"
          >
            <Trash2 size={18} /> 清除画布
          </button>
        )}
      </header>

      <main className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section className="lg:col-span-1 space-y-6">
          {/* AI 实验室板块 */}
          <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-6 rounded-2xl shadow-xl text-white relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:rotate-12 transition-transform">
              <Sparkles size={80} />
            </div>
            <h2 className="flex items-center gap-2 text-lg font-bold mb-4">
              <Zap size={20} className="text-yellow-400 fill-yellow-400" /> 
              AI 高清增强
            </h2>
            <p className="text-sm text-indigo-100 mb-6 leading-relaxed">
              觉得原图太模糊？使用 AI 重新绘制线条。AI 会基于现有图标生成更高清晰度的版本。
            </p>
            <button 
              onClick={runAiUpscale}
              disabled={!image || isAiUpscaling}
              className="w-full py-3 bg-white text-indigo-700 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-50 transition-all active:scale-95 disabled:opacity-50 shadow-lg"
            >
              {isAiUpscaling ? <RefreshCw className="animate-spin" size={20} /> : <Sparkles size={20} />}
              {isAiUpscaling ? "AI 正在重绘..." : "AI 高清修复"}
            </button>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-700 mb-6">
              <Settings size={20} className="text-indigo-500" /> 
              去底参数控制
            </h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-2">
                  容差区域 ({options.tolerance})
                </label>
                <input 
                  type="range" min="0" max="150" value={options.tolerance}
                  onChange={(e) => setOptions({ ...options, tolerance: parseInt(e.target.value) })}
                  className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-2">
                  边缘平滑度 ({options.smoothness})
                </label>
                <input 
                  type="range" min="0" max="100" value={options.smoothness}
                  onChange={(e) => setOptions({ ...options, smoothness: parseInt(e.target.value) })}
                  className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-2">背景取色</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="color" value={rgbToHex(options.targetColor)}
                    onChange={(e) => setOptions({ ...options, targetColor: hexToRgb(e.target.value), autoDetect: false })}
                    className="w-12 h-12 rounded-lg cursor-pointer border-none p-0 overflow-hidden"
                  />
                  <div className="flex-1 text-sm font-mono bg-slate-50 px-3 py-1.5 rounded-md border border-slate-100 text-slate-600">
                    RGB: {options.targetColor.r}, {options.targetColor.g}, {options.targetColor.b}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <button 
                  onClick={handleApplySettings}
                  disabled={!image || isProcessing}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 shadow-lg"
                >
                  {isProcessing ? <RefreshCw className="animate-spin" size={20} /> : <Eye size={20} />}
                  重新处理预览
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="lg:col-span-2">
          {!image ? (
            <label className="flex flex-col items-center justify-center w-full h-[400px] border-2 border-dashed border-slate-300 rounded-3xl cursor-pointer bg-white hover:bg-slate-50 transition-all group">
              <Upload size={32} className="text-indigo-500 mb-4 group-hover:scale-110 transition-transform" />
              <p className="mb-2 text-lg font-bold text-slate-700">点击或拖拽上传低清图标</p>
              <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
            </label>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-400 uppercase">当前原图 (AI 修复后会更新)</p>
                  <div className="bg-slate-200 rounded-2xl p-4 flex items-center justify-center min-h-[300px]">
                    <img src={image.originalUrl} alt="原图" className="max-w-full max-h-full object-contain" />
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold text-indigo-400 uppercase">去底预览 (透明边缘过渡)</p>
                  <div 
                    className="rounded-2xl p-4 flex items-center justify-center min-h-[300px] border-2 border-indigo-100 shadow-inner"
                    style={{ 
                      backgroundImage: 'linear-gradient(45deg, #eee 25%, transparent 25%), linear-gradient(-45deg, #eee 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #eee 75%), linear-gradient(-45deg, transparent 75%, #eee 75%)',
                      backgroundSize: '16px 16px',
                      backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px'
                    }}
                  >
                    {image.processedUrl && (
                      <img src={image.processedUrl} alt="结果" className="max-w-full max-h-full object-contain" />
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <div className="text-sm">
                  <p className="text-slate-400">当前分辨率: <span className="text-slate-700 font-bold">{image.width} × {image.height}</span></p>
                  {isAiUpscaling && <p className="text-indigo-500 animate-pulse font-medium">AI 正在魔法生成中...</p>}
                </div>
                <a 
                  href={image.processedUrl || '#'} 
                  download={`refined-icon.png`}
                  className="flex items-center gap-2 px-10 py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-black transition-all shadow-xl active:scale-95"
                >
                  <Download size={20} /> 下载高清透明 PNG
                </a>
              </div>
            </div>
          )}
        </section>
      </main>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default App;
