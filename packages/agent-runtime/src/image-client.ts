/**
 * Image Generation Client
 * Uses Right Code draw API (OpenAI-compatible)
 * https://www.right.codes/draw/v1/chat/completions
 */

export interface ImageGenerationOptions {
  prompt: string;
  model?: string;
  onProgress?: (progress: string) => void;
}

export interface ImageGenerationResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
  progress?: string;
}

const DRAW_API_URL = 'https://www.right.codes/draw/v1/chat/completions';
const DRAW_API_KEY = 'sk-8c5fa327081c4cc8ba3aafd05c67a3e2';

export const IMAGE_MODELS = [
  { id: 'gpt-image-2', name: 'GPT Image 2 (特价版)', description: '支持 1K 分辨率' },
  { id: 'gpt-image-2-vip', name: 'GPT Image 2 VIP', description: '支持 1K/2K/4K 分辨率' },
  { id: 'nano-banana', name: 'Nano Banana', description: 'Gemini 2.5 Flash 图像模型' },
  { id: 'nano-banana-2', name: 'Nano Banana 2', description: '第二代，支持 1K/2K/4K' },
  { id: 'nano-banana-pro', name: 'Nano Banana Pro', description: '专业版，支持 1K/2K/4K' },
] as const;

function extractImageUrl(content: string): string | null {
  // Extract from markdown format: ![image](url)
  const mdMatch = content.match(/!\[image\]\((https?:\/\/[^\)]+)\)/);
  if (mdMatch) return mdMatch[1];

  // Extract from plain URL
  const urlMatch = content.match(/(https?:\/\/[^\s]+\.(png|jpg|jpeg|webp))/i);
  if (urlMatch) return urlMatch[1];

  return null;
}

export async function generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
  const { prompt, model = 'gpt-image-2', onProgress } = options;

  console.log(`[ImageClient] Generating with model=${model}`);

  const response = await fetch(DRAW_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DRAW_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { success: false, error: `API error ${response.status}: ${errorText}` };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return { success: false, error: 'No response body' };
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let lastProgress = '';

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
          const content = parsed.choices?.[0]?.delta?.content || '';
          fullContent += content;

          // Extract progress info
          const progressMatch = fullContent.match(/Progressing\.\.\.\n?([\d%\s]+)/);
          if (progressMatch) {
            const percentages = progressMatch[1].match(/\d+%/g);
            if (percentages && percentages.length > 0) {
              lastProgress = percentages[percentages.length - 1];
              onProgress?.(lastProgress);
            }
          }
        } catch {
          // Skip parse errors
        }
      }
    }
  }

  // Extract image URL from full content
  const imageUrl = extractImageUrl(fullContent);
  if (imageUrl) {
    return { success: true, imageUrl, progress: '100%' };
  }

  return { success: false, error: 'No image URL found in response', progress: lastProgress };
}
