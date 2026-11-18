import 'dotenv/config';
import express from 'express';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { PageExtraction } from '../src/types/document.ts';
import { normalizePagesInlineMath } from '../src/utils/latexParser.ts';
import { buildDocxBuffer } from './docxBuilder.ts';
import { latexToOmmlXml } from './omml.ts';

let cachedAiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('MISSING_API_KEY');
  }
  if (!cachedAiClient) {
    cachedAiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedAiClient;
}

const inlineSegmentSchema = {
  type: Type.OBJECT,
  properties: {
    type: {
      type: Type.STRING,
      description: "'text' or 'math' (inline LaTeX without $/\\(\\) delimiters).",
    },
    content: {
      type: Type.STRING,
      description: 'Text or pure LaTeX.',
    },
    bold: {
      type: Type.BOOLEAN,
      description: 'True ONLY if visually boldface. Omit when normal weight.',
    },
    italic: {
      type: Type.BOOLEAN,
      description: 'True only if visually italic. Omit otherwise.',
    },
    underline: {
      type: Type.BOOLEAN,
      description: 'True only if underlined. Omit otherwise.',
    },
    font_size_pt: {
      type: Type.NUMBER,
      description: 'Font size in pt if different from block.',
    },
    color: {
      type: Type.STRING,
      description: '6-digit #RRGGBB hex if not black/dark-gray. Omit for black.',
    },
    tab_before: {
      type: Type.BOOLEAN,
      description: 'True if preceded by a tab stop on same line.',
    },
  },
  required: ['type', 'content'],
};

const pageExtractionSchema = {
  type: Type.OBJECT,
  properties: {
    blocks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          block_type: {
            type: Type.STRING,
            description:
              "'heading'|'paragraph'|'equation'|'table'|'figure'|'horizontal_rule'. Variation tables (bảng biến thiên) MUST be 'figure'.",
          },
          alignment: {
            type: Type.STRING,
            description: "'left'|'center'|'right'|'justify'.",
          },
          heading_level: {
            type: Type.INTEGER,
            description: '1, 2, or 3 for heading.',
          },
          font_size_pt: {
            type: Type.NUMBER,
            description: 'Font size in pt (e.g. 11, 12, 13, 14, 16).',
          },
          line_spacing: {
            type: Type.NUMBER,
            description: 'Line spacing (e.g. 1.0, 1.15, 1.3, 1.5).',
          },
          indent_left_pt: {
            type: Type.NUMBER,
            description: 'Left indent in pt from page margin.',
          },
          first_line_indent_pt: {
            type: Type.NUMBER,
            description: 'First-line indent in pt (negative for hanging indent).',
          },
          tab_stops_pt: {
            type: Type.ARRAY,
            items: { type: Type.NUMBER },
            description: 'Tab stop X positions in pt from left margin.',
          },
          segments: {
            type: Type.ARRAY,
            items: inlineSegmentSchema,
            description: 'Ordered inline segments for heading/paragraph.',
          },
          latex: {
            type: Type.STRING,
            description: 'Pure LaTeX for display equation (no $$).',
          },
          table_borderless: {
            type: Type.BOOLEAN,
            description: 'True for borderless multi-col headers, A/B/C/D choices, or side-by-side grids.',
          },
          is_choice_block: {
            type: Type.BOOLEAN,
            description: 'True for multiple-choice options (A./B./C./D. or a)/b)/c)/d)).',
          },
          table_rows: {
            type: Type.ARRAY,
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  segments: {
                    type: Type.ARRAY,
                    items: inlineSegmentSchema,
                  },
                  is_header: { type: Type.BOOLEAN },
                  alignment: {
                    type: Type.STRING,
                    description: "'left'|'center'|'right'|'justify'.",
                  },
                  width_pct: {
                    type: Type.NUMBER,
                    description: 'Column width % (0..100).',
                  },
                  col_span: {
                    type: Type.INTEGER,
                    description: 'Spanned columns (omit if 1).',
                  },
                },
                required: ['segments'],
              },
            },
          },
          box_2d: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
            description: '[ymin, xmin, ymax, xmax] in 0..1000 enclosing the block/figure completely.',
          },
          caption: {
            type: Type.STRING,
            description: 'Optional caption below figure.',
          },
        },
        required: ['block_type', 'alignment', 'box_2d'],
      },
    },
  },
  required: ['blocks'],
};

const OCR_SYSTEM_INSTRUCTION = `Chuyên gia OCR Toán học chính xác 100% từ ảnh PDF sang JSON để tái tạo đúng bố cục Word (.docx). Đọc từ trên xuống dưới theo quy tắc:
1. box_2d=[ymin,xmin,ymax,xmax] (0..1000) BẮT BUỘC cho mọi block để tái tạo lề, khoảng cách, thụt lề, chiều rộng hình và bố cục cạnh nhau.
2. Định dạng chữ chuẩn theo ảnh gốc — TÁCH segment ngay khi đổi kiểu (đậm/thường, đứng/nghiêng, gạch chân, màu, cỡ chữ):
   - bold=true CHỈ khi nét chữ thực sự dày đậm; KHÔNG tô đậm chữ thường, tiêu đề phụ mảnh, ghi chú nghiêng, nội dung sau "Câu 1." hay "A.". Heading và is_header không tự đậm.
   - italic=true cho mọi chữ nghiêng (ghi chú trong ngoặc, "Hướng dẫn giải", chữ nghiêng xen câu...).
   - underline=true cho chữ có gạch chân.
   - color="#RRGGBB" cho MỌI chữ/nhãn/công thức không phải màu đen (đỏ #DC2626, xanh dương #1D4ED8, xanh lá #15803D, tím #7C3AED, cam #EA580C...). Bỏ qua color nếu màu đen.
3. Vị trí & bố cục:
   - Ghi đúng alignment, indent_left_pt, first_line_indent_pt (số âm cho hanging indent như "Câu 1."), font_size_pt, line_spacing.
   - Nhiều phần tử nằm ngang hàng trên cùng dòng (tiêu đề 2-3 cột, chữ ký phải, hàng đáp án A/B/C/D 2x2 hoặc 4 cột) -> block_type="table", table_borderless=true kèm width_pct và alignment từng ô (is_choice_block=true với đáp án).
   - Đường kẻ ngang -> block_type="horizontal_rule".
4. Công thức Toán & bảng số liệu:
   - Mọi biểu thức/ký hiệu toán -> segment type="math" hoặc block_type="equation" bằng LaTeX thuần (KHÔNG bọc $, $$, \\( \\), \\[ \\]).
   - Mọi số toán học (0, 1, -2, +3, 2,5...) và dấu +/- toán học đưa vào type="math" (chỉ giữ số nhãn như "Câu 1.", "Bài 2.", "Hình 1" trong type="text").
   - Bảng số liệu/thống kê không có mũi tên biến thiên -> block_type="table", table_borderless=false, is_choice_block=false, đủ hàng/cột/col_span.
5. Hình vẽ & Bảng biến thiên -> block_type="figure" duy nhất:
   - Mọi hình học, đồ thị, trục số, biểu đồ VÀ MỌI BẢNG BIẾN THIÊN (có x, y'/f'(x), y/f(x), mũi tên ↗ ↘, ∥) PHẢI là MỘT block_type="figure" duy nhất (TUYỆT ĐỐI không xuất bảng biến thiên thành table hoặc tách dòng x/y').
   - Không xuất lặp chữ/số/đỉnh nằm bên trong hình vẽ ra ngoài.
   - box_2d phải ôm trọn 100% khung viền, mũi tên, nhãn trục/đỉnh và các số ở rìa/đáy (dư nhẹ 5-12 đơn vị, không cắt thiếu và không gộp chữ đề bài phía trên).
6. Giữ nguyên ngôn ngữ, chính tả, dấu câu. Chỉ xuất các field tùy chọn khi khác mặc định (true / khác null / khác 0) để JSON gọn và nhanh.`;

const OCR_MODELS_FAST = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'] as const;
const OCR_MODELS_ACCURATE = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;
const DAILY_QUOTA_COOLDOWN_MS = 10 * 60 * 1000;
const modelCooldownUntil = new Map<string, number>();
const OCR_CACHE_MAX = 48;
const ocrResultCache = new Map<string, PageExtraction['blocks']>();

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function isQuotaOrRateLimitError(err: unknown, msg: string): boolean {
  const status = (err as { status?: number })?.status;
  return (
    status === 429 ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.toLowerCase().includes('quota')
  );
}

function isDailyQuotaError(msg: string): boolean {
  return (
    msg.includes('PerDay') ||
    msg.includes('GenerateRequestsPerDay') ||
    /retry in \d+[hm]/i.test(msg)
  );
}

function isTransientServerError(err: unknown, msg: string): boolean {
  const status = (err as { status?: number })?.status;
  const lower = msg.toLowerCase();
  return (
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    lower.includes('high demand') ||
    lower.includes('overloaded') ||
    lower.includes('temporarily unavailable')
  );
}

async function generateOcrWithModelFallback(
  ai: GoogleGenAI,
  mimeType: string,
  base64Data: string,
  pageNumber: number,
  speedMode: 'fast' | 'accurate' = 'fast'
) {
  const orderedModels = speedMode === 'accurate' ? OCR_MODELS_ACCURATE : OCR_MODELS_FAST;
  const now = Date.now();
  const activeModels = orderedModels.filter((m) => (modelCooldownUntil.get(m) ?? 0) <= now);
  const modelsToTry = activeModels.length > 0 ? activeModels : [...orderedModels];

  let lastError: unknown;

  for (const model of modelsToTry) {
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const thinkingLevel =
          model === 'gemini-3.1-flash-lite' ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW;
        return await ai.models.generateContent({
          model,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
              {
                text: `OCR trang ${pageNumber} sang JSON đúng schema: chuẩn công thức LaTeX, box_2d chính xác, giữ đúng bold/italic/underline/color(#RRGGBB)/căn lề như ảnh gốc.`,
              },
            ],
          },
          config: {
            systemInstruction: OCR_SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: pageExtractionSchema,
            thinkingConfig: { thinkingLevel },
          },
        });
      } catch (err: unknown) {
        lastError = err;
        const msg = getErrorMessage(err);

        if (isQuotaOrRateLimitError(err, msg)) {
          if (isDailyQuotaError(msg)) {
            modelCooldownUntil.set(model, Date.now() + DAILY_QUOTA_COOLDOWN_MS);
            break;
          }
          if (attempt < maxRetries) {
            const jitter = Math.round(Math.random() * 450);
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1) + jitter));
            continue;
          }
          break;
        }

        if (isTransientServerError(err, msg)) {
          if (attempt < maxRetries) {
            const jitter = Math.round(Math.random() * 450);
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1) + jitter));
            continue;
          }
          // Exhausted retries on this model -> break to try the next fallback model
          break;
        }

        throw err;
      }
    }
  }

  throw lastError;
}

export type RequestWithOptionalBody = IncomingMessage & { body?: unknown };

async function readJsonBody<T = Record<string, unknown>>(req: RequestWithOptionalBody): Promise<T> {
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) {
      const txt = req.body.toString('utf8').trim();
      return (txt ? JSON.parse(txt) : {}) as T;
    }
    if (typeof req.body === 'string') {
      const txt = req.body.trim();
      return (txt ? JSON.parse(txt) : {}) as T;
    }
    if (typeof req.body === 'object') {
      return req.body as T;
    }
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return (raw ? JSON.parse(raw) : {}) as T;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export async function handleOcrPage(req: RequestWithOptionalBody, res: ServerResponse): Promise<void> {
  if (req.method && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  try {
    const body = await readJsonBody<{
      imageDataUrl?: string;
      pageNumber?: number;
      speedMode?: 'fast' | 'accurate';
    }>(req);

    const { imageDataUrl, pageNumber, speedMode } = body;

    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      sendJson(res, 400, { error: 'Thiếu dữ liệu ảnh trang cần nhận dạng.' });
      return;
    }

    const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      sendJson(res, 400, { error: 'Định dạng ảnh base64 không hợp lệ.' });
      return;
    }

    const mimeType = match[1];
    const base64Data = match[2];
    const resolvedSpeedMode = speedMode === 'fast' ? 'fast' : 'accurate';
    const cacheKey = `${resolvedSpeedMode}:${createHash('sha256').update(base64Data).digest('hex')}`;
    const cachedBlocks = ocrResultCache.get(cacheKey);
    if (cachedBlocks) {
      sendJson(res, 200, {
        pageNumber: pageNumber ?? 1,
        blocks: cachedBlocks,
      });
      return;
    }

    const ai = getGeminiClient();

    const response = await generateOcrWithModelFallback(
      ai,
      mimeType,
      base64Data,
      pageNumber ?? 1,
      resolvedSpeedMode
    );

    const rawJson = (response.text ?? '{"blocks":[]}').trim();
    const parsed = JSON.parse(rawJson) as { blocks?: PageExtraction['blocks'] };
    const rawBlocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
    const [normalizedPage] = normalizePagesInlineMath([
      { pageNumber: pageNumber ?? 1, blocks: rawBlocks },
    ]);
    const finalBlocks = normalizedPage?.blocks ?? rawBlocks;

    if (finalBlocks.length > 0) {
      if (ocrResultCache.size >= OCR_CACHE_MAX) {
        const oldest = ocrResultCache.keys().next().value;
        if (oldest !== undefined) ocrResultCache.delete(oldest);
      }
      ocrResultCache.set(cacheKey, finalBlocks);
    }

    sendJson(res, 200, {
      pageNumber: pageNumber ?? 1,
      blocks: finalBlocks,
    });
  } catch (err: unknown) {
    const message = getErrorMessage(err) || 'Lỗi không xác định khi gọi Gemini OCR.';
    if (message === 'MISSING_API_KEY') {
      sendJson(res, 500, {
        error: 'Chưa cấu hình GEMINI_API_KEY trong biến môi trường của máy chủ (Secrets / Environment Variables).',
      });
      return;
    }
    if (message.includes('PERMISSION_DENIED') || message.includes('API_KEY_INVALID')) {
      sendJson(res, 403, {
        error: 'API Key không hợp lệ hoặc bị từ chối quyền. Vui lòng kiểm tra lại GEMINI_API_KEY.',
      });
      return;
    }
    if (isQuotaOrRateLimitError(err, message)) {
      sendJson(res, 429, {
        error:
          'Đã vượt quá hạn mức miễn phí (Quota 429) của Gemini API trên tất cả model khả dụng. Vui lòng thử lại sau ít phút hoặc dùng API Key có bật thanh toán (Billing).',
      });
      return;
    }
    if (isTransientServerError(err, message)) {
      sendJson(res, 503, {
        error:
          'Máy chủ AI đang quá tải tạm thời (503). Hệ thống đã tự thử chuyển model dự phòng nhưng chưa thành công — vui lòng nhấn "Bắt đầu chuyển đổi" lại sau vài giây.',
      });
      return;
    }
    sendJson(res, 500, { error: `Lỗi OCR trang: ${message}` });
  }
}

export async function handleOmmlPreview(req: RequestWithOptionalBody, res: ServerResponse): Promise<void> {
  if (req.method && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  try {
    const body = await readJsonBody<{
      equations?: Array<{ latex: string; isDisplay: boolean }>;
    }>(req);

    const { equations } = body;
    if (!Array.isArray(equations)) {
      sendJson(res, 400, { error: 'Thiếu danh sách công thức.' });
      return;
    }
    const results = equations.map((item) => ({
      latex: item.latex,
      isDisplay: Boolean(item.isDisplay),
      omml: latexToOmmlXml(item.latex, Boolean(item.isDisplay)) ?? '',
    }));
    sendJson(res, 200, { results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi tạo OMML.';
    sendJson(res, 500, { error: message });
  }
}

export async function handleExportDocx(req: RequestWithOptionalBody, res: ServerResponse): Promise<void> {
  if (req.method && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  try {
    const body = await readJsonBody<{
      pages?: PageExtraction[];
      filename?: string;
      addPageBreaks?: boolean;
      choiceLayout?: 'table' | 'tabs';
      mathFormat?: 'omml' | 'latex';
      underlineCorrectChoice?: boolean;
    }>(req);

    const { pages, filename, addPageBreaks, choiceLayout, mathFormat, underlineCorrectChoice } = body;

    if (!Array.isArray(pages) || pages.length === 0) {
      sendJson(res, 400, { error: 'Chưa có dữ liệu trang đã OCR để xuất file Word.' });
      return;
    }

    const resolvedMathFormat = mathFormat === 'latex' ? 'latex' : 'omml';

    const buffer = await buildDocxBuffer(pages, {
      addPageBreaks: addPageBreaks !== false,
      choiceLayout: choiceLayout === 'table' ? 'table' : 'tabs',
      mathFormat: resolvedMathFormat,
      underlineCorrectChoice: Boolean(underlineCorrectChoice),
    });

    const safeBase = (filename || 'tai_lieu_toan')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_');

    const suffix = resolvedMathFormat === 'latex' ? 'LaTeX' : 'OMML';
    res.statusCode = 200;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${safeBase}_${suffix}.docx"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'no-store');
    res.end(buffer);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi xuất file Word.';
    sendJson(res, 500, { error: `Không thể tạo file Word: ${message}` });
  }
}

export function createApiApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  app.post('/api/ocr/page', (req, res) => {
    void handleOcrPage(req, res);
  });

  app.post('/api/omml/preview', (req, res) => {
    void handleOmmlPreview(req, res);
  });

  app.post('/api/export/docx', (req, res) => {
    void handleExportDocx(req, res);
  });

  return app;
}
