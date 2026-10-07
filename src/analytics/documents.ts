import type { DocumentEvents } from '../documents/ports';
import { fieldsBucket, type Track } from './events';

// The document and pass events as catalogue events: kinds, codes and buckets only.
export function documentsAnalytics(track: Track): DocumentEvents {
  return {
    startChosen(path) {
      track('start_chosen', { path });
    },
    uploadStarted(kind, files, media) {
      track('upload_started', { doc_type: kind, files, media });
    },
    extractionCompleted(kind, fields, lowConfidence, failedChecks) {
      track('extraction_completed', {
        doc_type: kind,
        fields_bucket: fieldsBucket(fields),
        low_confidence: lowConfidence,
        failed_checks: failedChecks,
      });
    },
    extractionFailed(kind, code) {
      track('extraction_failed', { doc_type: kind, code });
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
    downloaded(document) {
      track('report_downloaded', { document });
    },
  };
}
