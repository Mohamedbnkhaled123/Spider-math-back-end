/**
 * Spider Math Educational Platform (v2.2)
 * AI Question Extraction Provider Interface
 *
 * Strategy pattern interface allowing pluggable multi-provider AI vision engines
 * (Gemini 2.5 Flash, Claude 3.5 Sonnet, GPT-4o) without touching domain business logic.
 */

export type ExtractionMode = 'TEXT_LATEX_ONLY' | 'FULL_IMAGE_CROP' | 'SMART_HYBRID';

export interface IExtractionOptions {
  /**
   * Base64 encoded image string (with or without data:image/...;base64, prefix).
   */
  imageBase64: string;
  mimeType: 'image/webp' | 'image/jpeg' | 'image/png';
  mode: ExtractionMode;
  curriculum?: string;
  gradeLevel?: string;
}

export interface IExtractedQuestionItem {
  question_text: string;
  options: string[];
  correct_option_index: number;
  has_geometry_diagram: boolean;
  box_2d?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0..1000
  points: number;
}

export interface IAiQuestionExtractorProvider {
  readonly providerId: string;
  extractQuestions(options: IExtractionOptions): Promise<IExtractedQuestionItem[]>;
}
