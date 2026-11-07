import { z } from 'zod';
import {
  IAiQuestionExtractorProvider,
  IExtractionOptions,
  IExtractedQuestionItem
} from '../providers/ai-question-extractor.provider';
import { GeminiQuestionExtractorAdapter } from '../providers/gemini-question-extractor.adapter';
import { AiExtractQuestionsDto, aiExtractQuestionsDtoSchema } from '../dto/ai-extract-questions.dto';
import { AppError } from '../../../common/utils/app-error.util';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';

const extractedQuestionSchema = z.object({
  question_text: z.string().default(''),
  options: z.array(z.string()).default([]),
  correct_option_index: z.number().int().min(0).default(0),
  has_geometry_diagram: z.boolean().default(false),
  box_2d: z
    .tuple([z.number(), z.number(), z.number(), z.number()])
    .optional(),
  points: z.number().int().positive().default(1)
});

export class AiQuestionExtractionService {
  private readonly providers: Map<string, IAiQuestionExtractorProvider> = new Map();
  private readonly defaultProviderId: string;

  constructor(customProviders?: IAiQuestionExtractorProvider[]) {
    // Register built-in default provider (Gemini 2.5 Flash)
    const geminiAdapter = new GeminiQuestionExtractorAdapter();
    this.registerProvider(geminiAdapter);

    if (customProviders && customProviders.length > 0) {
      for (const p of customProviders) {
        this.registerProvider(p);
      }
    }

    this.defaultProviderId = (
      process.env.AI_EXTRACTION_PROVIDER || 'gemini'
    ).trim().toLowerCase();
  }

  registerProvider(provider: IAiQuestionExtractorProvider): void {
    this.providers.set(provider.providerId.toLowerCase(), provider);
  }

  getProvider(providerId?: string): IAiQuestionExtractorProvider {
    const id = (providerId || this.defaultProviderId).toLowerCase();
    const provider = this.providers.get(id);

    if (!provider) {
      throw new AppError(
        `AI extraction provider "${id}" is not registered or supported. Available providers: ${Array.from(
          this.providers.keys()
        ).join(', ')}`,
        400,
        ERROR_CODES.BAD_REQUEST_400
      );
    }

    return provider;
  }

  async extractQuestions(
    rawDto: AiExtractQuestionsDto,
    overrideProviderId?: string
  ): Promise<IExtractedQuestionItem[]> {
    const validatedDto = aiExtractQuestionsDtoSchema.parse(rawDto);
    const provider = this.getProvider(overrideProviderId || validatedDto.providerId);

    const options: IExtractionOptions = {
      imageBase64: validatedDto.imageBase64,
      mimeType: validatedDto.mimeType,
      mode: validatedDto.mode,
      curriculum: validatedDto.curriculum,
      gradeLevel: validatedDto.gradeLevel
    };

    const rawQuestions = await provider.extractQuestions(options);

    // Validate and sanitize each extracted question
    const sanitizedQuestions: IExtractedQuestionItem[] = [];

    for (const rawQ of rawQuestions) {
      const parsed = extractedQuestionSchema.safeParse(rawQ);
      if (parsed.success) {
        // In FULL_IMAGE_CROP mode or when box_2d is present, provide fallback text if text was blank
        const trimmedText = parsed.data.question_text.trim();
        const fallbackText =
          validatedDto.mode === 'FULL_IMAGE_CROP' || parsed.data.box_2d
            ? 'سؤال مصور (قص كامل)'
            : '';
        const finalText = trimmedText || fallbackText;

        if (finalText.length > 0) {
          sanitizedQuestions.push({
            ...(parsed.data as IExtractedQuestionItem),
            question_text: finalText
          });
        }
      } else {
        console.warn('AI question extraction validation warning:', parsed.error.issues);
      }
    }

    return sanitizedQuestions;
  }
}
