import { AiQuestionExtractionService } from './ai-question-extraction.service';
import {
  IAiQuestionExtractorProvider,
  IExtractionOptions,
  IExtractedQuestionItem
} from '../providers/ai-question-extractor.provider';
import { AppError } from '../../../common/utils/app-error.util';

describe('AiQuestionExtractionService', () => {
  let service: AiQuestionExtractionService;

  class MockAiProvider implements IAiQuestionExtractorProvider {
    readonly providerId = 'mock-provider';
    async extractQuestions(_options: IExtractionOptions): Promise<IExtractedQuestionItem[]> {
      return [
        {
          question_text: 'أوجد مجموعة حل المعادلة $x^2 - 9 = 0$',
          options: ['$\\{-3, 3\\}$', '$\\{3\\}$', '$\\{-3\\}$', '$\\{9\\}$'],
          correct_option_index: 0,
          has_geometry_diagram: false,
          points: 1
        },
        {
          question_text: 'في المثلث $ABC$ القائم الزاوية في $B$، احسب طول $AC$',
          options: ['$5\\text{ cm}$', '$10\\text{ cm}$', '$12\\text{ cm}$', '$13\\text{ cm}$'],
          correct_option_index: 3,
          has_geometry_diagram: true,
          box_2d: [120, 45, 480, 520],
          points: 2
        },
        {
          question_text: '   ', // Blank question text should be filtered out
          options: [],
          correct_option_index: 0,
          has_geometry_diagram: false,
          points: 1
        }
      ];
    }
  }

  beforeEach(() => {
    service = new AiQuestionExtractionService();
  });

  it('should register and resolve the default gemini provider', () => {
    const provider = service.getProvider('gemini');
    expect(provider).toBeDefined();
    expect(provider.providerId).toBe('gemini');
  });

  it('should throw an AppError when requesting an unsupported provider', () => {
    expect(() => service.getProvider('unsupported-ai')).toThrow(AppError);
  });

  it('should register a custom provider and extract questions through it', async () => {
    const mockProvider = new MockAiProvider();
    service.registerProvider(mockProvider);

    const questions = await service.extractQuestions(
      {
        imageBase64: 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v39gAA=',
        mimeType: 'image/webp',
        mode: 'SMART_HYBRID'
      },
      'mock-provider'
    );

    // Question 3 had blank text, so it must be filtered out
    expect(questions.length).toBe(2);

    // Verify first question
    expect(questions[0].question_text).toContain('$x^2 - 9 = 0$');
    expect(questions[0].options.length).toBe(4);
    expect(questions[0].correct_option_index).toBe(0);
    expect(questions[0].has_geometry_diagram).toBe(false);

    // Verify second question (with geometry diagram)
    expect(questions[1].has_geometry_diagram).toBe(true);
    expect(questions[1].box_2d).toEqual([120, 45, 480, 520]);
    expect(questions[1].points).toBe(2);
  });

  it('should fail fast with Zod error on empty imageBase64', async () => {
    await expect(
      service.extractQuestions({
        imageBase64: '',
        mimeType: 'image/webp',
        mode: 'SMART_HYBRID'
      })
    ).rejects.toThrow();
  });

  it('should fail fast on invalid extraction mode', async () => {
    await expect(
      service.extractQuestions({
        imageBase64: 'valid_base64_string_here_1234567890',
        mimeType: 'image/webp',
        mode: 'INVALID_MODE' as any
      })
    ).rejects.toThrow();
  });

  it('should preserve blank text questions with fallback in FULL_IMAGE_CROP mode', async () => {
    service.registerProvider(new MockAiProvider());
    const questions = await service.extractQuestions({
      imageBase64: 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v39gAA=',
      mimeType: 'image/webp',
      mode: 'FULL_IMAGE_CROP',
      providerId: 'mock-provider'
    });

    expect(questions.length).toBe(3);
    expect(questions[2].question_text).toBe('سؤال مصور (قص كامل)');
  });
});
