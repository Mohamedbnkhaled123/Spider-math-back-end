import {
  IAiQuestionExtractorProvider,
  IExtractionOptions,
  IExtractedQuestionItem
} from './ai-question-extractor.provider';
import { AppError } from '../../../common/utils/app-error.util';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';

export class GeminiQuestionExtractorAdapter implements IAiQuestionExtractorProvider {
  readonly providerId = 'gemini';
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
    this.model = model || process.env.GEMINI_EXTRACTION_MODEL || 'gemini-2.5-flash';
  }

  async extractQuestions(options: IExtractionOptions): Promise<IExtractedQuestionItem[]> {
    if (!this.apiKey) {
      throw new AppError(
        'GEMINI_API_KEY is not configured on the server. Please provide a valid Gemini API key.',
        500,
        ERROR_CODES.INTERNAL_SERVER_ERROR_500
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

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.model
    )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
    } catch (networkError: any) {
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
      const message =
        parsedError?.error?.message ||
        `Gemini API returned HTTP ${response.status}: ${errorText.substring(0, 300)}`;
      throw new AppError(
        `AI extraction service error: ${message}`,
        response.status >= 500 ? 502 : 400,
        ERROR_CODES.INTERNAL_SERVER_ERROR_500
      );
    }

    const data: any = await response.json();
    const rawCandidate = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawCandidate) {
      return [];
    }

    return this.parseAndSanitizeGeminiOutput(rawCandidate);
  }

  /**
   * Robust JSON parser and sanitizer for LLM responses.
   */
  private parseAndSanitizeGeminiOutput(rawText: string): IExtractedQuestionItem[] {
    let cleanJson = rawText.trim();

    // Strip markdown code fences if present (e.g., ```json ... ```)
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
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
