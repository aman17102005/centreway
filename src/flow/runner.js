// Runs the whole automatic flow for one file and reports progress.
import { browserEnv } from '../ingest/browserEnv.js';
import { readAdmitCard } from '../ingest/readAdmitCard.js';
import { loadPlaceIndex } from '../logic/places.js';
import { buildDraft } from './autoPlan.js';
import { currentLocation } from './location.js';
import { saveDraft } from './draft.js';
import { getSettings } from '../store.js';

export const MAX_BYTES = 25 * 1024 * 1024;

export class ScanError extends Error {
  constructor(code, message) { super(message || code); this.code = code; } // 'type' | 'big' | 'nothing-found' | 'other'
}

/** onStage('reading' | 'centre' | 'location' | 'route' | 'nearby'), onProgress(0..1, text). Returns the saved draft. */
export async function runScan(file, { onStage = () => {}, onProgress = () => {} } = {}) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  const isImage = /^image\//.test(file.type) || /\.(jpe?g|png|webp|gif|bmp|heic)$/i.test(file.name || '');
  if (!isPdf && !isImage) throw new ScanError('type');
  if (file.size > MAX_BYTES) throw new ScanError('big');

  onStage('reading');
  browserEnv.onOcrProgress((status, fraction) => onProgress(fraction, status));
  await browserEnv.prepareQr();
  const placeIndex = await loadPlaceIndex();
  let read;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    read = await readAdmitCard({ bytes, type: isPdf ? 'application/pdf' : file.type }, browserEnv, {
      placeIndex, now: new Date(), keepAiText: Boolean(getSettings().geminiKey), onProgress: ({ fraction, text }) => onProgress(fraction, text),
    });
  } catch (e) {
    throw e.code === 'nothing-found' ? new ScanError('nothing-found') : new ScanError('other', e.message);
  }

  onStage('location');
  const location = await currentLocation(8000);
  const draft = await buildDraft(read, { location, stage: onStage });
  saveDraft(draft);
  return draft;
}
