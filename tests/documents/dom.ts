import type { DocumentEvents } from '../../src/documents/ports';

// The data attributes DocumentStart.astro and PassOffer.astro render, without their copy.
export const START = `
<div data-documents-start>
  <section data-start-panel="choose">
    <h2 class="question" tabindex="-1">Start</h2>
    <p data-start-status></p>
    <button data-start-upload>Upload</button>
    <button data-start-manual>Manual</button>
  </section>
  <form data-start-panel="upload" hidden>
    <h2 class="question" tabindex="-1">Upload</h2>
    <fieldset data-doc-field="kind">
      <input type="radio" name="documentKind" id="document-settlement" value="settlement" />
      <input type="radio" name="documentKind" id="document-payslip" value="payslip" />
      <p data-doc-error-for="kind" hidden></p>
    </fieldset>
    <div data-doc-field="files">
      <input type="file" id="document-files" multiple />
      <ul data-doc-files hidden></ul>
      <p data-doc-error-for="files" hidden></p>
    </div>
    <div data-doc-field="consent">
      <input type="checkbox" id="document-consent" value="yes" />
      <p data-doc-error-for="consent" hidden></p>
    </div>
    <div data-captcha></div>
    <p data-doc-status></p>
    <p data-doc-error hidden></p>
    <button type="button" data-start-back>Back</button>
    <button type="button" data-start-manual>Manual</button>
    <button type="submit" data-start-send>Send</button>
  </form>
  <section data-start-panel="done" hidden>
    <h2 class="question" tabindex="-1">Done</h2>
    <p data-done-summary></p>
    <ul data-done-notes hidden></ul>
    <button data-start-upload>Another</button>
    <button data-start-continue>Continue</button>
  </section>
</div>
<form id="calculator" hidden>
  <div class="options" data-field="cause">
    <input type="radio" name="cause" value="unfair_dismissal" />
    <input type="radio" name="cause" value="resignation" />
    <p class="errata" hidden></p>
  </div>
  <div data-field="startDate"><input name="startDate" aria-describedby="hint-startDate" /><p class="errata"></p></div>
  <div data-field="endDate"><input name="endDate" /><p class="errata"></p></div>
  <div data-field="figure_severance"><input name="figure_severance" /><p class="errata"></p></div>
</form>
<nav class="tabs" hidden></nav>`;

export const OFFER = `
<section data-pass-offer hidden>
  <div data-pass-buy>
    <input type="checkbox" id="pass-waiver" />
    <p data-pass-waiver-error hidden></p>
    <button data-pass-pay>Pay</button>
    <details data-pass-recover>
      <input id="pass-session" />
      <button data-pass-recover-button>Recover</button>
    </details>
  </div>
  <div data-pass-downloads hidden>
    <p data-pass-validity></p>
    <button data-download="report">Report</button>
    <button data-download="letter">Letter</button>
    <p data-letter-note></p>
  </div>
  <p data-pass-status></p>
  <p data-pass-error hidden></p>
</section>`;

export type Recorded = [keyof DocumentEvents, ...unknown[]];

export function recordingEvents(): DocumentEvents & { log: Recorded[] } {
  const log: Recorded[] = [];
  const record =
    (name: keyof DocumentEvents) =>
    (...args: unknown[]) =>
      void log.push([name, ...args]);
  return {
    log,
    startChosen: record('startChosen'),
    uploadStarted: record('uploadStarted'),
    extractionCompleted: record('extractionCompleted'),
    extractionFailed: record('extractionFailed'),
    checkoutStarted: record('checkoutStarted'),
    passIssued: record('passIssued'),
    passFailed: record('passFailed'),
    downloaded: record('downloaded'),
  };
}

export const flush = () => new Promise((r) => setTimeout(r, 0));
