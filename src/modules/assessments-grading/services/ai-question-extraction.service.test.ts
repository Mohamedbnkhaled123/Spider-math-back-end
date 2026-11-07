import assert from 'node:assert/strict';
import { AiQuestionExtractionService } from './ai-question-extraction.service';
import {
  IAiQuestionExtractorProvider,
  IExtractionOptions,
  IExtractedQuestionItem
} from '../providers/ai-question-extractor.provider';
import { AppError } from '../../../common/utils/app-error.util';

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

async function runTests() {
  console.log('Running AiQuestionExtractionService Verification Tests...');
  const service = new AiQuestionExtractionService();

  // Test 1: Register and resolve default provider
  const defaultProvider = service.getProvider('gemini');
  assert.equal(defaultProvider.providerId, 'gemini', 'Default provider should be gemini');
  console.log('✔ Test 1 Passed: Default gemini provider resolved correctly.');

  // Test 2: Throws AppError on unsupported provider
  assert.throws(
    () => service.getProvider('non-existent-provider'),
    (err: any) => err instanceof AppError && err.statusCode === 400,
    'Should throw 400 AppError for unknown provider'
  );
  console.log('✔ Test 2 Passed: Unknown provider throws AppError(400).');

  // Test 3: Register custom provider and extract questions
  const mock = new MockAiProvider();
  service.registerProvider(mock);
  const questions = await service.extractQuestions(
    {
      imageBase64: 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v39gAA=',
      mimeType: 'image/webp',
      mode: 'SMART_HYBRID'
    },
    'mock-provider'
  );

  assert.equal(questions.length, 2, 'Should filter out empty question and return 2 questions');
  const q0 = questions[0];
  const q1 = questions[1];
  assert.ok(q0, 'Question 0 should exist');
  assert.ok(q1, 'Question 1 should exist');

  assert.ok(q0.question_text.includes('$x^2 - 9 = 0$'), 'Question 1 should contain math formula');
  assert.equal(q0.options.length, 4, 'Question 1 should have 4 options');
  assert.equal(q0.correct_option_index, 0, 'Question 1 correct index is 0');
  assert.equal(q0.has_geometry_diagram, false, 'Question 1 diagram is false');

  assert.equal(q1.has_geometry_diagram, true, 'Question 2 diagram is true');
  assert.deepEqual(q1.box_2d, [120, 45, 480, 520], 'Question 2 box_2d should match');
  assert.equal(q1.points, 2, 'Question 2 points should match');
  console.log('✔ Test 3 Passed: Custom provider extraction and question sanitization successful.');

  // Test 4: Rejects empty imageBase64
  let rejected = false;
  try {
    await service.extractQuestions({
      imageBase64: '',
      mimeType: 'image/webp',
      mode: 'SMART_HYBRID'
    });
  } catch (err: any) {
    rejected = true;
  }
  assert.ok(rejected, 'Should fail validation on empty base64');
  console.log('✔ Test 4 Passed: Empty imageBase64 fails validation.');

  // Test 5: Rejects invalid mode
  rejected = false;
  try {
    await service.extractQuestions({
      imageBase64: 'valid_base64_string_length_exceeds_10',
      mimeType: 'image/webp',
      mode: 'INVALID_MODE' as any
    });
  } catch (err: any) {
    rejected = true;
  }
  assert.ok(rejected, 'Should fail validation on invalid mode');
  console.log('✔ Test 5 Passed: Invalid mode fails validation.');

  // Test 6: Preserves blank-text question in FULL_IMAGE_CROP mode with fallback text
  const cropQuestions = await service.extractQuestions({
    imageBase64: 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v39gAA=',
    mimeType: 'image/webp',
    mode: 'FULL_IMAGE_CROP',
    providerId: 'mock-provider'
  });
  assert.equal(cropQuestions.length, 3, 'FULL_IMAGE_CROP mode should preserve all 3 questions with fallback');
  assert.equal(cropQuestions[2]?.question_text, 'سؤال مصور (قص كامل)', 'Blank text question should receive fallback text');
  console.log('✔ Test 6 Passed: FULL_IMAGE_CROP mode uses fallback text for blank questions.');

  // Test 7: Gemini adapter parser normalizes inverted coordinates and rejects zero-area box
  const geminiAdapter = service.getProvider('gemini') as any;
  const mockGeminiJson = JSON.stringify([
    {
      question_text: 'سؤال مع إحداثيات مقلوبة',
      options: ['$1$', '$2$', '$3$', '$4$'],
      correct_option_index: 1,
      has_geometry_diagram: true,
      box_2d: [500, 600, 200, 100] // Inverted: ymax < ymin, xmax < xmin
    },
    {
      question_text: 'سؤال مع مساحة صفرية',
      options: [],
      correct_option_index: 0,
      has_geometry_diagram: false,
      box_2d: [300, 300, 300, 300] // Zero area
    }
  ]);
  const parsedItems = geminiAdapter.parseAndSanitizeGeminiOutput(mockGeminiJson);
  assert.equal(parsedItems.length, 2);
  assert.deepEqual(parsedItems[0].box_2d, [200, 100, 500, 600], 'Inverted coordinates should be normalized');
  assert.equal(parsedItems[1].box_2d, undefined, 'Zero-area box should be safely discarded');
  console.log('✔ Test 7 Passed: Gemini adapter normalizes inverted coordinates and safely discards zero-area boxes.');

  // Test 8: Gemini adapter initializes with verified backup key and gemini-3.5-flash by default
  const defaultAdapter = new (require('../providers/gemini-question-extractor.adapter').GeminiQuestionExtractorAdapter)();
  assert.ok(defaultAdapter.apiKey && defaultAdapter.apiKey.length > 20, 'Adapter should have a non-empty backup apiKey');
  assert.equal(defaultAdapter.model, 'gemini-3.5-flash', 'Default model should be gemini-3.5-flash');
  console.log('✔ Test 8 Passed: Gemini adapter initializes with verified backup key and gemini-3.5-flash.');

  console.log('\nAll AiQuestionExtractionService tests completed successfully!');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
