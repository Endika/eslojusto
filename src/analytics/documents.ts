import type { DocumentEvents } from '../documents/ports';
import { fieldsBucket, type Track } from './events';

// The document and pass events as catalogue events: kinds, codes and buckets only.
export function documentsAnalytics(track: Track): DocumentEvents {
  return {
    startChosen(path) {
      track('start_chosen', { path });
    },
    uploadStarted(files, pdfs) {
      track('upload_started', { files_bucket: files, pdfs });
    },
    extractionCompleted({
      kinds,
      fields,
      lowConfidence,
      failedChecks,
      conflicts,
      escalated,
      skippedReasons,
    }) {
      track('extraction_completed', {
        doc_types: kinds,
        fields_bucket: fieldsBucket(fields),
        low_confidence: lowConfidence,
        failed_checks: failedChecks,
        conflicts,
        escalated: escalated === null ? 'unknown' : escalated ? 'yes' : 'no',
        skipped_reasons: [...skippedReasons],
      });
    },
    extractionFailed(code) {
      track('extraction_failed', { code });
    },
    nothingRead(reasons, files, pdfs) {
      track('nothing_read', { reasons: [...reasons], files_bucket: files, pdfs });
    },
    qualityWarned(problem) {
      track('quality_warned', { kind: problem });
    },
    qualityOverridden() {
      track('quality_overridden', {});
    },
    checkoutStarted() {
      track('checkout_started', {});
    },
    passIssued(via) {
      track('pass_issued', { via });
    },
    passFailed(code) {
      track('pass_failed', { code });
    },
    passVerified(result) {
      track('pass_verified', { result });
    },
    downloaded(document, letterPrefilled, letterKind) {
      track('report_downloaded', {
        document,
        letter_prefilled: letterPrefilled ?? 'not_applicable',
        letter_kind: letterKind ?? 'not_applicable',
      });
    },
  };
}
