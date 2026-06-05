/**
 * ImageDesignPanel — Image generation via Right Code draw API
 */

import { useState, useRef } from 'react';
import { Image, Sparkles, Loader2, Download, ChevronDown } from 'lucide-react';

interface ImageDesignPanelProps {
  /** Pre-filled prompt from requirement document */
  defaultPrompt?: string;
}

const IMAGE_MODELS = [
  { id: 'gpt-image-2', name: 'GPT Image 2', desc: '特价版 · 1K' },
  { id: 'gpt-image-2-vip', name: 'GPT Image 2 VIP', desc: '官方直连 · 1K/2K/4K' },
  { id: 'nano-banana-2', name: 'Nano Banana 2', desc: '第二代 · 1K/2K/4K' },
  { id: 'nano-banana-pro', name: 'Nano Banana Pro', desc: '专业版 · 1K/2K/4K' },
  { id: 'nano-banana', name: 'Nano Banana', desc: 'Gemini Flash · 1K' },
];

export function ImageDesignPanel({ defaultPrompt = '' }: ImageDesignPanelProps) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [model, setModel] = useState('nano-banana-2');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  const selectedModel = IMAGE_MODELS.find(m => m.id === model) || IMAGE_MODELS[0];

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setLoading(true);
    setProgress('');
    setError(null);
    setImageUrl(null);

    try {
      const res = await fetch('/api/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), model }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || `HTTP ${res.status}`);
        return;
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      if (!reader) {
        setError('No response body');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'progress') {
                setProgress(parsed.progress);
              } else if (parsed.type === 'complete') {
                setImageUrl(parsed.imageUrl);
                setProgress('100%');
              } else if (parsed.type === 'error') {
                setError(parsed.error);
              }
            } catch {
              // skip parse errors
            }
          }
        }
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Image className="w-5 h-5 text-purple-400" />
        <h3 className="text-base font-semibold text-white">AI 画图</h3>
      </div>

      {/* Model selector */}
      <div className="relative" ref={modelRef}>
        <button
          onClick={() => setShowModelPicker(!showModelPicker)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg
            bg-white/5 border border-white/10 text-sm text-white hover:bg-white/10 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-purple-400 text-xs font-medium px-1.5 py-0.5 rounded bg-purple-400/10">
              模型
            </span>
            <span>{selectedModel.name}</span>
            <span className="text-gray-500 text-xs">{selectedModel.desc}</span>
          </div>
          <ChevronDown size={14} className={`text-gray-400 transition-transform ${showModelPicker ? 'rotate-180' : ''}`} />
        </button>

        {showModelPicker && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50
            bg-gray-800 border border-white/10 rounded-lg shadow-xl overflow-hidden">
            {IMAGE_MODELS.map(m => (
              <button
                key={m.id}
                onClick={() => {
                  setModel(m.id);
                  setShowModelPicker(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors
                  ${m.id === model ? 'bg-purple-500/20 text-purple-300' : 'text-gray-300 hover:bg-white/5'}`}
              >
                <span className="flex-1">{m.name}</span>
                <span className="text-xs text-gray-500">{m.desc}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Prompt input */}
      <div className="flex-1 flex flex-col gap-2">
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="描述你想生成的图片，例如：一个现代化的电商网站首页设计，深色主题..."
          className="flex-1 min-h-[120px] px-3 py-2 rounded-lg bg-white/5 border border-white/10
            text-sm text-white placeholder:text-gray-500 resize-none
            focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25"
        />

        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || loading}
          className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl
            bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium
            hover:from-purple-700 hover:to-pink-700
            disabled:opacity-40 disabled:cursor-not-allowed transition-all
            shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {progress ? `生成中 ${progress}` : '生成中...'}
            </>
          ) : (
            <>
              <Sparkles size={16} />
              生成图片
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Result */}
      {imageUrl && (
        <div className="flex-1 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">生成结果</span>
            <a
              href={imageUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-purple-400
                hover:bg-purple-400/10 transition-colors"
            >
              <Download size={12} />
              下载
            </a>
          </div>
          <div className="flex-1 rounded-lg overflow-hidden bg-white/5 border border-white/10">
            <img
              src={imageUrl}
              alt="Generated"
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      )}

      {/* Placeholder when no image */}
      {!imageUrl && !loading && !error && (
        <div className="flex-1 flex items-center justify-center rounded-lg
          bg-white/[0.02] border border-dashed border-white/10">
          <p className="text-sm text-gray-600">图片将显示在这里</p>
        </div>
      )}
    </div>
  );
}
