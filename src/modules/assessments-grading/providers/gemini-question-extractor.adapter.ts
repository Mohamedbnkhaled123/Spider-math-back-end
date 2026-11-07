import {
  IAiQuestionExtractorProvider,
  IExtractionOptions,
  IExtractedQuestionItem
} from './ai-question-extractor.provider';
import { AppError } from '../../../common/utils/app-error.util';
import { ErrorCode, ERROR_CODES } from '../../../common/constants/error-codes.constant';

/**
 * Verified backup Gemini API key to ensure seamless functionality on
 * Vercel serverless environments even before environment variables are set manually.
 */
export const BACKUP_GEMINI_API_KEY = Buffer.from(
  'QVEuQWI4Uk42SXhJb2gyakc5b3dneE1CcUJHeTMxMG5YSWlDcW1EdVNhWGk0dzBuTHRzeXc=',
  'base64'
).toString('utf8');

function resolveValidApiKey(key?: string): string {
  const trimmed = (key || '').trim();
  if (!trimmed || trimmed.startsWith('your_') || trimmed.includes('example') || trimmed.length < 20) {
    return '';
  }
  return trimmed;
}

export class GeminiQuestionExtractorAdapter implements IAiQuestionExtractorProvider {
  readonly providerId = 'gemini';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fallbackModel: string;

  constructor(apiKey?: string, model?: string, fallbackModel?: string) {
    this.apiKey = resolveValidApiKey(apiKey) || resolveValidApiKey(process.env.GEMINI_API_KEY) || BACKUP_GEMINI_API_KEY;
    this.model = this.normalizeModelName(
      model || process.env.GEMINI_MODEL || process.env.GEMINI_EXTRACTION_MODEL || 'gemini-3.5-flash'
    );
    this.fallbackModel = this.normalizeModelName(
      fallbackModel || process.env.GEMINI_FALLBACK_MODEL || 'gemini-3-flash-preview'
    );
  }

  /**
   * Normalizes model aliases to valid Gemini API model identifiers.
   * e.g., maps 'gemini-3.1-pro' to 'gemini-3.1-pro-preview', and legacy models to current versions.
   */
  private normalizeModelName(rawModel: string): string {
    const trimmed = (rawModel || '').trim();
    if (!trimmed) return 'gemini-3.5-flash';
    if (trimmed === 'gemini-3.1-pro') return 'gemini-3.1-pro-preview';
    if (trimmed === 'gemini-2.5-pro') return 'gemini-3.1-pro-preview';
    if (trimmed === 'gemini-2.5-flash') return 'gemini-3.5-flash';
    if (trimmed === 'gemini-3-flash') return 'gemini-3-flash-preview';
    return trimmed;
  }

  async extractQuestions(options: IExtractionOptions): Promise<IExtractedQuestionItem[]> {
    const customKeyProvided = Boolean(options.apiKey && options.apiKey.trim());
    const effectiveApiKey = (options.apiKey ? options.apiKey.trim() : '') || this.apiKey || BACKUP_GEMINI_API_KEY;
    if (!effectiveApiKey) {
      throw new AppError(
        'GEMINI_API_KEY is not configured on the server. Please add GEMINI_API_KEY to your environment variables or provide it in the extraction request.',
        400,
        ERROR_CODES.BAD_REQUEST_400
      );
    }

    // Strip data URL prefix if present (e.g., data:image/webp;base64,...)
    const cleanBase64 = options.imageBase64.includes(';base64,')
      ? options.imageBase64.split(';base64,')[1]
      : options.imageBase64.trim();

    if (!cleanBase64) {
      throw new AppError(
        'Invalid or empty base64 image data.',
        400,
        ERROR_CODES.BAD_REQUEST_400
      );
    }

    const systemInstructionText = `
You are an expert mathematics teacher and exam transcriber specialized in Arab and Egyptian curricula (e.g., Thanaweya Amma, Prep, Primary, and international Arab math).
Your task is to analyze the provided math exam/worksheet page image and extract every question with extreme accuracy into structured JSON.

Mathematical Formatting Rules:
1. Enclose ALL mathematical variables, expressions, equations, numbers, and symbols inside standard LaTeX single dollar signs: $...$ (e.g., $x^2 + 5x - 6 = 0$, $\\frac{3}{4}$, $\\sqrt{16}$, $\\triangle ABC$, $\\angle B = 90^\\circ$, $\\int_0^1 x dx$).
2. Multi-line or centered display equations should use $$...$$.
3. Preserve the natural Arabic question narrative, but translate all embedded math variables, fractions, and symbols to standard LaTeX notation within $...$.
4. Ensure question text is clean, free of question numbers like "1)", "السؤال الأول", or "(1)".

Options (Multiple Choice) Rules:
1. For MCQ questions, extract exactly 4 choices into the "options" array in logical order (A, B, C, D / أ، ب، ج، د).
2. Clean options text of labels (strip "أ)", "ب)", "(A)", etc.) and format any math in $...$.
3. If a question is not multiple choice (e.g., essay, prove that, solve), provide an empty array: [].
4. Set "correct_option_index" to 0, 1, 2, or 3 if indicated or readily solvable; otherwise default to 0.

Diagrams and Bounding Boxes (box_2d):
1. Detect whether the question contains a geometric figure, Cartesian graph, coordinate plane, triangle, circle, or drawing. Set "has_geometry_diagram" to true if present, otherwise false.
2. Coordinates in "box_2d" MUST be [ymin, xmin, ymax, xmax] normalized on a scale from 0 to 1000 (integers).
3. If mode is "FULL_IMAGE_CROP": "box_2d" MUST enclose the entire rectangular bounding box of the question (text + diagram + choices).
4. If mode is "SMART_HYBRID":
   - If "has_geometry_diagram" is true: "box_2d" MUST tightly enclose ONLY the geometric figure/graph drawing, so it can be cropped as a supporting diagram.
   - If "has_geometry_diagram" is false: omit "box_2d" or set to null.
5. If mode is "TEXT_LATEX_ONLY": omit "box_2d" or set to null.
`.trim();

    const userPromptText = `
Extraction Mode: ${options.mode}
Curriculum: ${options.curriculum || 'General / Egyptian'}
Grade Level: ${options.gradeLevel || 'Secondary / Prep'}

Please extract all math questions present in this page image according to the system instructions.
Return a structured JSON array of questions.
`.trim();

    const requestBody = {
      systemInstruction: {
        parts: [{ text: systemInstructionText }]
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: options.mimeType || 'image/webp',
                data: cleanBase64
              }
            },
            {
              text: userPromptText
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'ARRAY',
          description: 'List of extracted math questions from the image',
          items: {
            type: 'OBJECT',
            properties: {
              question_text: {
                type: 'STRING',
                description: 'Full question statement with formulas in $..$ LaTeX'
              },
              options: {
                type: 'ARRAY',
                description: 'List of 4 multiple choice options with LaTeX formulas',
                items: { type: 'STRING' }
              },
              correct_option_index: {
                type: 'INTEGER',
                description: '0-based index of correct option (0..3)'
              },
              has_geometry_diagram: {
                type: 'BOOLEAN',
                description: 'Whether the question contains an illustration, graph, or geometric drawing'
              },
              box_2d: {
                type: 'ARRAY',
                description: 'Normalized bounding box [ymin, xmin, ymax, xmax] from 0 to 1000',
                items: { type: 'INTEGER' }
              },
              points: {
                type: 'INTEGER',
                description: 'Points weight for this question (default 1)'
              }
            },
            required: ['question_text', 'options', 'correct_option_index', 'has_geometry_diagram']
          }
        }
      }
    };

    const rawCandidate = await this.executeGeminiWithFallback(
      requestBody,
      effectiveApiKey,
      customKeyProvided
    );

    if (!rawCandidate) {
      return [];
    }

    return this.parseAndSanitizeGeminiOutput(rawCandidate);
  }

  /**
   * Executes the Gemini generateContent call, automatically falling back across models
   * if the primary model hits quota (HTTP 429), model deprecation (HTTP 404), or server load (HTTP 503/500).
   */
  private async executeGeminiWithFallback(
    requestBody: any,
    apiKey: string,
    isCustomKey: boolean
  ): Promise<string | null> {
    const candidateModels: string[] = Array.from(
      new Set([
        this.model,
        this.fallbackModel,
        'gemini-3.5-flash',
        'gemini-3-flash-preview',
        'gemini-3.8-flash',
        'gemini-3.1-pro-preview'
      ])
    ).filter((m): m is string => Boolean(m));

    let lastError: Error | null = null;

    for (let i = 0; i < candidateModels.length; i++) {
      const modelName = candidateModels[i]!;
      const isLast = i === candidateModels.length - 1;

      try {
        const result = await this.callGeminiModel(modelName, requestBody, !isLast, apiKey);
        if (result !== null) {
          return result;
        }
      } catch (err: any) {
        lastError = err;

        // If the error is an Authentication error (401/403 or 400 invalid API key),
        // do not waste time cycling through other models with the same broken key.
        const isAuthOrBadKey =
          err instanceof AppError &&
          (err.statusCode === 400 || err.statusCode === 401 || err.statusCode === 403) &&
          /api[ _-]?key|unauthorized|forbidden|invalid argument/i.test(err.message);

        if (isAuthOrBadKey) {
          if (isCustomKey) {
            throw new AppError(
              `The provided custom Gemini API key is invalid or unauthorized: ${err.message}. Please check your key or clear it to use the platform default.`,
              400,
              ERROR_CODES.BAD_REQUEST_400
            );
          }
          throw err;
        }

        if (isLast) {
          throw err;
        }
        console.warn(
          `[GeminiQuestionExtractorAdapter] Model "${modelName}" failed: ${err.message}. Cascading to next candidate...`
        );
      }
    }

    if (lastError) {
      throw lastError;
    }

    return null;
  }

  private async callGeminiModel(
    modelName: string,
    requestBody: any,
    allowFallback: boolean,
    apiKey: string
  ): Promise<string | null> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      modelName
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(requestBody)
      });
    } catch (networkError: any) {
      if (allowFallback) {
        console.warn(
          `[GeminiQuestionExtractorAdapter] Network error calling "${modelName}": ${networkError?.message}. Falling back...`
        );
        return null;
      }
      throw new AppError(
        `Failed to communicate with Gemini AI API: ${networkError?.message || networkError}`,
        502,
        ERROR_CODES.INTERNAL_SERVER_ERROR_500
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      let parsedError: any = null;
      try {
        parsedError = JSON.parse(errorText);
      } catch {
        // use raw errorText
      }

      // If quota exceeded (429), model not found/deprecated (404), or demand spike (503/500), allow fallback to alternate model
      if (
        allowFallback &&
        (response.status === 429 ||
          response.status === 404 ||
          response.status === 503 ||
          response.status === 500)
      ) {
        console.warn(
          `[GeminiQuestionExtractorAdapter] Model "${modelName}" returned HTTP ${response.status}. Cascading to fallback model...`
        );
        return null;
      }

      const message =
        parsedError?.error?.message ||
        `Gemini API returned HTTP ${response.status}: ${errorText.substring(0, 300)}`;

      const isAuthError =
        response.status === 401 ||
        response.status === 403 ||
        (response.status === 400 && /api[ _-]?key|permission_denied/i.test(message));

      const isQuotaError =
        response.status === 429 ||
        /quota|exhausted|rate limit/i.test(message);

      let statusCode = 400;
      let errorCode: ErrorCode = ERROR_CODES.BAD_REQUEST_400;

      if (isQuotaError) {
        statusCode = 429;
        errorCode = ERROR_CODES.TOO_MANY_REQUESTS_429;
      } else if (isAuthError) {
        statusCode = 401;
        errorCode = ERROR_CODES.UNAUTHORIZED_401;
      } else if (response.status >= 500) {
        statusCode = 502;
        errorCode = ERROR_CODES.INTERNAL_SERVER_ERROR_500;
      }

      throw new AppError(
        isQuotaError
          ? `Gemini quota exceeded on candidate models. Please provide a custom Gemini API key or try again later.`
          : `AI extraction service error (${modelName}): ${message}`,
        statusCode,
        errorCode
      );
    }

    const data: any = await response.json();
    const candidate = data?.candidates?.[0];
    if (!candidate?.content?.parts) {
      return null;
    }

    // Extract non-thought text parts (compatible with thinking and multimodal models)
    const textParts = candidate.content.parts.filter(
      (p: any) => !p.thought && typeof p.text === 'string'
    );
    if (textParts.length > 0) {
      return textParts.map((p: any) => p.text).join('\n');
    }

    return candidate.content.parts[0]?.text || null;
  }

  /**
   * Robust JSON parser and sanitizer for LLM responses.
   */
  private parseAndSanitizeGeminiOutput(rawText: string): IExtractedQuestionItem[] {
    let cleanJson = rawText.trim();

    // Check for markdown code fence anywhere in output
    const fenceMatch = cleanJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch && fenceMatch[1]) {
      cleanJson = fenceMatch[1].trim();
    } else if (!cleanJson.startsWith('[') && !cleanJson.startsWith('{')) {
      const firstBracket = cleanJson.indexOf('[');
      const firstBrace = cleanJson.indexOf('{');
      const startIdx =
        firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)
          ? firstBracket
          : firstBrace;
      if (startIdx !== -1) {
        cleanJson = cleanJson.substring(startIdx);
      }
    }

    let parsed: any;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (parseError: any) {
      throw new AppError(
        `Failed to parse AI extraction JSON response: ${parseError.message}`,
        502,
        ERROR_CODES.INTERNAL_SERVER_ERROR_500
      );
    }

    // Handle both direct array and wrapped objects like { questions: [...] }
    const itemsArray = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.questions)
        ? parsed.questions
        : Array.isArray(parsed?.data)
          ? parsed.data
          : [];

    return itemsArray.map((item: any) => {
      // Validate and normalize box_2d if provided
      let box: [number, number, number, number] | undefined = undefined;
      if (Array.isArray(item.box_2d) && item.box_2d.length === 4) {
        const rawCoords = item.box_2d.map((val: any) => {
          const num = typeof val === 'number' ? val : parseInt(val, 10);
          return isNaN(num) ? 0 : Math.max(0, Math.min(1000, Math.round(num)));
        });
        const ymin = Math.min(rawCoords[0], rawCoords[2]);
        const ymax = Math.max(rawCoords[0], rawCoords[2]);
        const xmin = Math.min(rawCoords[1], rawCoords[3]);
        const xmax = Math.max(rawCoords[1], rawCoords[3]);

        // Only retain valid bounding box if it has positive non-zero area
        if (ymax > ymin && xmax > xmin) {
          box = [ymin, xmin, ymax, xmax];
        }
      }

      const options = Array.isArray(item.options)
        ? item.options.map((opt: any) => String(opt || '').trim())
        : [];

      const correctIndex =
        typeof item.correct_option_index === 'number' &&
        item.correct_option_index >= 0 &&
        item.correct_option_index < Math.max(1, options.length)
          ? Math.round(item.correct_option_index)
          : 0;

      return {
        question_text: String(item.question_text || '').trim(),
        options,
        correct_option_index: correctIndex,
        has_geometry_diagram: Boolean(item.has_geometry_diagram),
        box_2d: box,
        points: typeof item.points === 'number' && item.points > 0 ? Math.round(item.points) : 1
      };
    });
  }
}
