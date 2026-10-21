import { ProcessingStatus } from '../../models/Item';
import {
  SttProvider,
  KeyframeSampler,
  OcrProvider,
  OcrExtractor,
  getDefaultSttProvider,
  getDefaultOcrProvider,
  MockOcrProvider,
  UnavailableOcrProvider,
  MultimodalAnalysisInput,
  MultimodalAnalysisResult,
  MultimodalDiagnostics,
  TranscriptSegment,
  OcrObservation,
} from './index';
import { groundEvidence, GroundingInput, GroundingOutput } from './evidenceGrounding';

/**
 * Orchestrates multimodal analysis: speech-to-text, keyframe sampling, OCR extraction,
 * combined text structuring, and timestamped evidence grounding.
 */
export class MultimodalService {
  private sttProvider: SttProvider;
  private keyframeSampler: KeyframeSampler;
  private ocrProvider: OcrProvider;
  private ocrExtractor: OcrExtractor;

  constructor(dependencies?: {
    sttProvider?: SttProvider;
    keyframeSampler?: KeyframeSampler;
    ocrProvider?: OcrProvider;
  }) {
    this.sttProvider = dependencies?.sttProvider || getDefaultSttProvider();
    this.keyframeSampler = dependencies?.keyframeSampler || new KeyframeSampler();
    this.ocrProvider =
      dependencies?.ocrProvider ||
      (process.env.NODE_ENV === 'test' ? new MockOcrProvider() : new UnavailableOcrProvider());
    this.ocrExtractor = new OcrExtractor(this.ocrProvider);

    // If no explicit provider was injected in production, resolve host capabilities
    if (!dependencies?.ocrProvider && process.env.NODE_ENV !== 'test') {
      getDefaultOcrProvider()
        .then((provider) => {
          this.ocrProvider = provider;
          this.ocrExtractor = new OcrExtractor(provider);
        })
        .catch(() => {});
    }
  }

  setSttProvider(provider: SttProvider): void {
    this.sttProvider = provider;
  }

  setOcrProvider(provider: OcrProvider): void {
    this.ocrProvider = provider;
    this.ocrExtractor = new OcrExtractor(provider);
  }

  setKeyframeSampler(sampler: KeyframeSampler): void {
    this.keyframeSampler = sampler;
  }

  getSttProviderName(): string {
    return this.sttProvider.name;
  }

  getOcrProviderName(): string {
    return this.ocrProvider.name;
  }

  /**
   * Processes available audio, video, and caption streams for an item.
   * Guarantees safe error handling: never throws unhandled exceptions.
   */
  async processMultimodal(input: MultimodalAnalysisInput): Promise<MultimodalAnalysisResult> {
    const diagnostics: MultimodalDiagnostics = {
      sttAttempted: false,
      sttSuccess: false,
      keyframesSampled: 0,
      ocrAttempted: false,
      ocrSuccess: false,
    };

    let transcriptText = input.existingTranscript?.trim() || undefined;
    let transcriptSegments: TranscriptSegment[] = input.existingSegments || [];
    let transcriptSource: 'timedtext' | 'whisper' | 'none' = transcriptText ? 'timedtext' : 'none';

    let ocrText: string | undefined;
    let ocrObservations: OcrObservation[] = [];

    // 1. Audio and Speech-to-Text Processing
    // Rule: Prefer native captions/transcripts when already present; invoke STT only when
    // legitimate audio bytes are supplied and native captions are absent or insufficient.
    if (!transcriptText && input.audioBuffer && input.audioBuffer.length > 0) {
      diagnostics.sttAttempted = true;
      diagnostics.sttProvider = this.sttProvider.name;
      try {
        const sttResult = await this.sttProvider.transcribe(input.audioBuffer, input.sttOptions);
        if (sttResult.text && sttResult.text.trim().length > 0) {
          transcriptText = sttResult.text.trim();
          transcriptSegments = sttResult.segments || [];
          transcriptSource = 'whisper';
          diagnostics.sttSuccess = true;
        } else {
          diagnostics.sttSuccess = false;
          diagnostics.sttError = 'STT engine returned empty transcription';
        }
      } catch (sttErr: any) {
        diagnostics.sttSuccess = false;
        diagnostics.sttError = sttErr.message || 'Speech-to-text transcription failed';
        console.warn(`[MultimodalService] STT transcription failed non-fatally: ${diagnostics.sttError}`);
      }
    }

    // 2. Video Frame Sampling and OCR Processing
    // Rule: Sample frames only from a verified, accessible local media file.
    if (input.mediaFilePath) {
      try {
        const frames = await this.keyframeSampler.sampleKeyframes(input.mediaFilePath, input.keyframeOptions);
        diagnostics.keyframesSampled = frames.length;

        if (frames.length > 0) {
          diagnostics.ocrAttempted = true;
          diagnostics.ocrProvider = this.ocrProvider.name;

          const isOcrAvailable = await this.ocrProvider.isAvailable();
          if (isOcrAvailable) {
            const ocrResult = await this.ocrExtractor.extractFromFrames(frames, input.ocrOptions);
            if (ocrResult.fullOcrText && ocrResult.fullOcrText.trim().length > 0) {
              ocrText = ocrResult.fullOcrText.trim();
              ocrObservations = ocrResult.observations;
              diagnostics.ocrSuccess = true;
            } else {
              diagnostics.ocrSuccess = true; // OCR ran successfully, no legible text in frames
              ocrObservations = ocrResult.observations;
            }
          } else {
            diagnostics.ocrSuccess = false;
            diagnostics.ocrError = `OCR provider '${this.ocrProvider.name}' is unavailable on host`;
          }
        }
      } catch (frameErr: any) {
        diagnostics.ocrSuccess = false;
        diagnostics.ocrError = frameErr.message || 'Keyframe sampling failed';
        console.warn(`[MultimodalService] Keyframe OCR failed non-fatally: ${diagnostics.ocrError}`);
      }
    }

    // 3. Assemble Combined Multimodal Text for Structuring
    const textSections: string[] = [];
    if (transcriptText) {
      textSections.push(`[Spoken Transcript]\n${transcriptText}`);
    }
    if (ocrText && ocrText.length > 0) {
      textSections.push(`[On-Screen Visual Text & Code]\n${ocrText}`);
    }
    const combinedText = textSections.join('\n\n').trim();

    // 4. Determine Honest Processing Status
    let status = ProcessingStatus.METADATA_ONLY;

    const hasAudioTranscript = Boolean(transcriptText && transcriptText.length > 0);
    const hasVisualOcr = Boolean(ocrText && ocrText.length > 0);

    if (hasAudioTranscript && hasVisualOcr) {
      status = ProcessingStatus.FULLY_ANALYZED;
    } else if (hasAudioTranscript || hasVisualOcr) {
      // If one modality succeeded and the other was either not provided or degraded
      if (input.mediaFilePath && !hasVisualOcr && diagnostics.ocrAttempted && !diagnostics.ocrSuccess) {
        status = ProcessingStatus.PARTIALLY_ANALYZED;
      } else if (input.audioBuffer && !hasAudioTranscript && diagnostics.sttAttempted && !diagnostics.sttSuccess) {
        status = ProcessingStatus.PARTIALLY_ANALYZED;
      } else {
        status = ProcessingStatus.FULLY_ANALYZED;
      }
    } else {
      if (diagnostics.sttError || diagnostics.ocrError) {
        status = ProcessingStatus.PARTIALLY_ANALYZED;
      } else {
        status = input.title ? ProcessingStatus.METADATA_ONLY : ProcessingStatus.UNSUPPORTED_INACCESSIBLE;
      }
    }

    return {
      status,
      transcriptText,
      transcriptSegments,
      transcriptSource,
      ocrText,
      ocrObservations,
      combinedText,
      evidenceAttributions: [],
      diagnostics,
    };
  }

  /**
   * Grounds structured knowledge takeaways and resources to verifiable transcript
   * segments and on-screen OCR observations with exact timestamps.
   */
  groundKnowledge(input: GroundingInput): GroundingOutput {
    return groundEvidence(input);
  }
}

export const defaultMultimodalService = new MultimodalService();
