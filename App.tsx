
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Download, RefreshCw, Settings, Trash2, Eye, ShieldCheck, Sparkles, Zap, Eraser, RotateCcw } from 'lucide-react';
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
    brushSize: 20,
  });
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAiUpscaling, setIsAiUpscaling] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100, visible: false });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalImgRef = useRef<HTMLImageElement | null>(null);
  const displayImgRef = useRef<HTMLImageElement | null>(null); // 用于获取显示的图片尺寸

  const initMaskCanvas = (width: number, height: number) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, width, height);
  };

  const processImage = useCallback(async (imgUrl?: string, currentOptions?: ProcessingOptions) => {
    const opts = currentOptions || options;
    const url = imgUrl || image?.originalUrl;
    if (!url) return;

    setIsProcessing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;

    img.onload = () => {
      originalImgRef.current = img;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      let target = opts.targetColor;
      if (opts.autoDetect && !imgUrl) {
        target = detectBackgroundColor(ctx, img.width, img.height);
        setOptions(prev => ({ ...prev, targetColor: target }));
      }

      if (maskCanvasRef.current) {
        ctx.drawImage(maskCanvasRef.current, 0, 0);
      }

      const processedUrl = makeTransparent(
        ctx, 
        img.width, 
        img.height, 
        target, 
        opts.tolerance, 
        opts.smoothness
      );
      
      setImage(prev => ({
        originalUrl: url,
        processedUrl,
        width: img.width,
        height: img.height
      }));
      
      setIsProcessing(false);
    };
  }, [options, image?.originalUrl]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      img.onload = () => {
        initMaskCanvas(img.width, img.height);
        processImage(url, { ...options, autoDetect: true });
      };
    }
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isEditMode || !maskCanvasRef.current || !originalImgRef.current) return;
    setIsDrawing(true);
    handleMouseMove(e);
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isEditMode || !image || !displayImgRef.current) return;

    // 获取外层容器
    const container = (e.currentTarget as HTMLElement);
    const containerRect = container.getBoundingClientRect();
    
    // 获取图片实际显示的矩形区域
    const imgRect = displayImgRef.current.getBoundingClientRect();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    // UI 指示器位置（相对于容器）
    const uiX = clientX - containerRect.left;
    const uiY = clientY - containerRect.top;
    setCursorPos({ x: uiX, y: uiY, visible: true });

    if (isDrawing) {
      const canvas = maskCanvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      // 计算相对于图片左上角的坐标
      const relX = clientX - imgRect.left;
      const relY = clientY - imgRect.top;

      // 只有在图片范围内才进行绘制
      if (relX >= 0 && relX <= imgRect.width && relY >= 0 && relY <= imgRect.height) {
        // 计算缩放比例：图片自然宽度 / 图片显示宽度
        const scaleX = canvas.width / imgRect.width;
        const scaleY = canvas.height / imgRect.height;

        const x = relX * scaleX;
        const y = relY * scaleY;

        ctx.fillStyle = `rgb(${options.targetColor.r},${options.targetColor.g},${options.targetColor.b})`;
        ctx.beginPath();
        // 笔触大小也需要根据缩放比例调整
        ctx.arc(x, y, (options.brushSize * scaleX) / 2, 0, Math.PI * 2);
        ctx.fill();

        processImage();
      }
    }
  };

  const stopDrawing = () => setIsDrawing(false);

  const handleApplySettings = useCallback(() => {
    processImage();
  }, [processImage]);

  const runAiUpscale = async () => {
    if (!image?.originalUrl) return;
    setIsAiUpscaling(true);
    try {
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
            { inlineData: { data: base64Data, mimeType: blob.type } },
            { text: "Enhance this icon. High resolution. Solid background." },
          ],
        },
      });

      let newImageUrl = '';
      if (aiResponse.candidates?.[0]?.content?.parts) {
        for (const part of aiResponse.candidates[0].content.parts) {
          if (part.inlineData) {
            newImageUrl = `data:image/png;base64,${part.inlineData.data}`;
            break;
          }
        }
      }

      if (newImageUrl) {
        const tempImg = new Image();
        tempImg.src = newImageUrl;
        tempImg.onload = () => {
          initMaskCanvas(tempImg.width, tempImg.height);
          processImage(newImageUrl, { ...options, autoDetect: true });
        };
      }
    } catch (error) {
      alert("AI 增强失败");
    } finally {
      setIsAiUpscaling(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center">
      <header className="w-full max-w-6xl mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            PureVision <ShieldCheck className="text-indigo-500" />
          </h1>
          <p className="text-slate-500 font-medium">图标自动处理与手动修复工具</p>
        </div>
        {image && (
          <button onClick={() => setImage(null)} className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-semibold">
            <Trash2 size={18} /> 清除画布
          </button>
        )}
      </header>

      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-4 gap-8">
        <section className="lg:col-span-1 space-y-6">
          <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-5 rounded-2xl shadow-xl text-white">
            <h2 className="flex items-center gap-2 text-md font-bold mb-3"><Zap size={18} className="text-yellow-400" /> AI 高清增强</h2>
            <button onClick={runAiUpscale} disabled={!image || isAiUpscaling} className="w-full py-2.5 bg-white text-indigo-700 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-50 transition-all disabled:opacity-50">
              {isAiUpscaling ? <RefreshCw className="animate-spin" size={18} /> : <Sparkles size={18} />}
              AI 修复模糊
            </button>
          </div>

          <div className={`p-5 rounded-2xl border transition-all ${isEditMode ? 'bg-indigo-50 border-indigo-200 ring-2 ring-indigo-200' : 'bg-white border-slate-200'}`}>
            <h2 className="flex items-center gap-2 text-md font-bold text-slate-700 mb-4">
              <Eraser size={18} className={isEditMode ? 'text-indigo-600' : 'text-slate-400'} /> 
              手动修复 (擦除)
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-600">编辑模式</span>
                <button 
                  onClick={() => setIsEditMode(!isEditMode)}
                  className={`w-12 h-6 rounded-full transition-all relative ${isEditMode ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isEditMode ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
              
              {isEditMode && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">画笔大小: {options.brushSize}px</label>
                    <input 
                      type="range" min="5" max="100" value={options.brushSize}
                      onChange={(e) => setOptions({ ...options, brushSize: parseInt(e.target.value) })}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                  <button 
                    onClick={() => {
                      if (image) initMaskCanvas(image.width, image.height);
                      processImage();
                    }}
                    className="w-full py-2 border border-indigo-200 text-indigo-600 rounded-lg text-xs font-bold flex items-center justify-center gap-2 hover:bg-white"
                  >
                    <RotateCcw size={14} /> 重置所有涂抹
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-5">
            <h2 className="text-md font-bold text-slate-700">去底参数</h2>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">容差: {options.tolerance}</label>
              <input type="range" min="0" max="150" value={options.tolerance} onChange={(e) => setOptions({ ...options, tolerance: parseInt(e.target.value) })} className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none accent-slate-700" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">平滑: {options.smoothness}</label>
              <input type="range" min="0" max="100" value={options.smoothness} onChange={(e) => setOptions({ ...options, smoothness: parseInt(e.target.value) })} className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none accent-slate-700" />
            </div>
            <div className="pt-2">
              <button onClick={handleApplySettings} disabled={!image || isProcessing} className="w-full py-2.5 bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-black transition-all">
                {isProcessing ? <RefreshCw className="animate-spin" size={18} /> : <Eye size={18} />} 刷新预览
              </button>
            </div>
          </div>
        </section>

        <section className="lg:col-span-3 space-y-6">
          {!image ? (
            <label className="flex flex-col items-center justify-center w-full h-[450px] border-2 border-dashed border-slate-300 rounded-3xl cursor-pointer bg-white hover:bg-slate-50 transition-all group">
              <Upload size={40} className="text-indigo-500 mb-4 group-hover:scale-110 transition-transform" />
              <p className="text-xl font-bold text-slate-700">点击上传图标开始处理</p>
              <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
            </label>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">
                  {isEditMode ? '🎨 正在涂抹 (自动替换为背景色)...' : '原图预览'}
                </p>
                <div 
                  className={`relative bg-slate-200 rounded-3xl p-6 flex items-center justify-center min-h-[400px] overflow-hidden transition-all ${isEditMode ? 'cursor-none ring-4 ring-indigo-400 ring-inset' : ''}`}
                  onMouseDown={startDrawing}
                  onMouseMove={handleMouseMove}
                  onMouseUp={stopDrawing}
                  onMouseLeave={() => { stopDrawing(); setCursorPos(p => ({ ...p, visible: false })); }}
                  onMouseEnter={() => isEditMode && setCursorPos(p => ({ ...p, visible: true }))}
                >
                  <img 
                    ref={displayImgRef}
                    src={image.originalUrl} 
                    alt="原图" 
                    className="max-w-full max-h-full object-contain pointer-events-none select-none shadow-sm" 
                  />
                  {isEditMode && cursorPos.visible && (
                    <div 
                      className="absolute border border-white bg-indigo-500/20 rounded-full pointer-events-none mix-blend-difference z-10"
                      style={{
                        width: options.brushSize,
                        height: options.brushSize,
                        left: cursorPos.x,
                        top: cursorPos.y,
                        transform: 'translate(-50%, -50%)',
                      }}
                    />
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest px-1">处理结果 (实时透明)</p>
                <div 
                  className="rounded-3xl p-6 flex items-center justify-center min-h-[400px] border-2 border-indigo-100 shadow-inner"
                  style={{ 
                    backgroundImage: 'linear-gradient(45deg, #eee 25%, transparent 25%), linear-gradient(-45deg, #eee 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #eee 75%), linear-gradient(-45deg, transparent 75%, #eee 75%)',
                    backgroundSize: '20px 20px',
                    backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                  }}
                >
                  {image.processedUrl && (
                    <img src={image.processedUrl} alt="结果" className="max-w-full max-h-full object-contain drop-shadow-2xl" />
                  )}
                </div>
                <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200">
                  <span className="text-xs font-bold text-slate-400">{image.width} × {image.height} PX</span>
                  <a href={image.processedUrl || '#'} download={`refined-icon.png`} className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-black transition-all shadow-lg flex items-center gap-2">
                    <Download size={18} /> 下载 PNG
                  </a>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={maskCanvasRef} className="hidden" />
    </div>
  );
};

export default App;
