import {
  QuoteParseError, addressFromPublicKey, checkQuoteBinding, enclaveKeyOf, parseTdxQuote, quoteBytesFrom, TDX_TEE_TYPE,
  type CheckedIn, type QuoteBinding, type QuoteSignatureResult, type SignatureReasonCode, type SignatureSource,
} from './tdxQuote';

export type AttestationErrorCode = 'not_verified' | 'nonce_mismatch' | 'no_key' | 'model_mismatch' | 'quote_binding_failed';
/** Which part of the quote binding failed (only for quote_binding_failed). */
export type BindingFailure = 'quote' | 'tee_type' | 'debug' | 'address' | 'nonce' | 'padding';

export class AttestationError extends Error {
  readonly code: AttestationErrorCode;
  readonly detail?: BindingFailure;
  constructor(code: AttestationErrorCode, detail?: BindingFailure) {
    super(`attestation check failed: ${code}${detail ? ` (${detail})` : ''}`);
    this.name = 'AttestationError';
    this.code = code;
    this.detail = detail;
  }
}

export type QuoteSummary = {
  /** Enclave software measurement (not pinned: see HONEST_LIMITS). */
  mrtd: string;
  mrtdShort: string;
  tdAttributes: string;
  /** Intel signature chain. enclaveChat only ever encrypts after 'verified'; 'pending' = binding checked, signature not yet. */
  signature: 'pending' | 'verified' | 'unverified';
  /** Where the signature check ran: 'browser' = this tab; 'node' = a server/eval process, NOT the user's browser. */
  signatureCheckedIn?: CheckedIn;
  signatureCheckedAt?: string;
  /** 'live' (PCCS now) or 'snapshot' (bundled fallback, weaker: no fresh revocation data; see snapshotCapturedAt). */
  signatureSource?: SignatureSource;
  snapshotCapturedAt?: string;
  /** Any TCB status is accepted once the chain verifies, but it is always recorded and shown. */
  tcbStatus?: string;
  advisoryIds?: string[];
  reasonCode?: SignatureReasonCode;
  reason?: string;
};

export type AttestationSummary = {
  /** Venice's own server-side verification flag (required, but not our check). */
  verified: boolean;
  /** Venice echoed our nonce. */
  nonceOk: boolean;
  provider: string;
  hardware: string | null;
  model: string;
  /** 0x address derived by us from modelPublicKey; equal to the one sealed in REPORTDATA. */
  signingAddress: string | null;
  modelPublicKey: string;
  checkedAt: string;
  /** true when this call reused a cached, already verified attestation (browser, <= 10 min); ageMs = now - checkedAt. */
  reused: boolean;
  ageMs: number;
  /** Our own check of the quote: key address + our nonce in REPORTDATA, non-debug TDX. Always all-true in a summary. */
  binding: QuoteBinding;
  quote: QuoteSummary;
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/** First 16 hex chars of a measurement, for display. */
export const shortMrtd = (mrtd: string) => `${mrtd.slice(0, 16)}…`;

/**
 * Synchronous first gate. Throws unless Venice says verified, echoes our nonce and model, and the TDX quote
 * itself binds the key we will encrypt to plus OUR nonce, from a non-debug TD. Binding alone is not enough
 * to encrypt: enclaveClient also requires Intel's signature on the quote (verifyQuoteSignature).
 */
export function checkAttestation(raw: unknown, nonce: string, model: string): AttestationSummary {
  const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (a.verified !== true) throw new AttestationError('not_verified');
  if (a.nonce !== nonce) throw new AttestationError('nonce_mismatch');
  if (a.model !== model) throw new AttestationError('model_mismatch');
  const key = enclaveKeyOf(a);
  if (!key) throw new AttestationError('no_key');

  let binding: QuoteBinding;
  let tdAttributes: string;
  try {
    binding = checkQuoteBinding(a, nonce);
    tdAttributes = parseTdxQuote(quoteBytesFrom(a.intel_quote)).tdAttributes;
  } catch (e) {
    if (e instanceof QuoteParseError) throw new AttestationError('quote_binding_failed', 'quote');
    throw e;
  }
  if (binding.teeType !== TDX_TEE_TYPE) throw new AttestationError('quote_binding_failed', 'tee_type');
  if (binding.debug) throw new AttestationError('quote_binding_failed', 'debug');
  if (!binding.addressMatches) throw new AttestationError('quote_binding_failed', 'address');
  if (!binding.nonceMatches) throw new AttestationError('quote_binding_failed', 'nonce');
  if (!binding.paddingZero) throw new AttestationError('quote_binding_failed', 'padding');

  return {
    verified: true,
    nonceOk: true,
    provider: str(a.tee_provider) ?? 'unknown',
    hardware: str(a.tee_hardware),
    model,
    signingAddress: `0x${addressFromPublicKey(key)}`,
    modelPublicKey: key,
    checkedAt: new Date().toISOString(),
    reused: false,
    ageMs: 0,
    binding,
    quote: { mrtd: binding.mrtd, mrtdShort: shortMrtd(binding.mrtd), tdAttributes, signature: 'pending' },
  };
}

/** A copy of the summary carrying the finished Intel signature check. */
export function withSignature(s: AttestationSummary, r: QuoteSignatureResult): AttestationSummary {
  const quote: QuoteSummary = {
    mrtd: s.quote.mrtd,
    mrtdShort: s.quote.mrtdShort,
    tdAttributes: s.quote.tdAttributes,
    signature: r.status,
    signatureCheckedIn: r.checkedIn,
    signatureCheckedAt: new Date().toISOString(),
  };
  if (r.source) quote.signatureSource = r.source;
  if (r.snapshotCapturedAt) quote.snapshotCapturedAt = r.snapshotCapturedAt;
  if (r.status === 'verified') {
    quote.tcbStatus = r.tcbStatus;
    quote.advisoryIds = r.advisoryIds ?? [];
  } else {
    quote.reasonCode = r.reasonCode;
    quote.reason = r.reason;
  }
  return { ...s, quote };
}

// ---------------------------------------------------------------- user-facing wording (EN + ES)

/** What we do not check. Show it next to any enclave claim. */
export const HONEST_LIMITS =
  "We verify Intel's signature, non-debug mode and that the key and your one-time code are sealed in the report. We don't yet check the enclave's software measurement against a published list.";
export const HONEST_LIMITS_ES =
  'Verificamos la firma de Intel, que no está en modo de depuración y que la clave y su código de un solo uso están sellados en el informe. Todavía no comparamos la medición del software del enclave con una lista publicada.';

export type EnclaveCopy = {
  bindingOk: string;
  bindingFailed: string;
  freshness: (checkedAt: string) => string;
  signaturePending: string;
  signatureVerifiedInBrowser: (tcbStatus: string) => string;
  signatureVerifiedOnServer: (tcbStatus: string) => string;
  /** The weaker fallback: checked against the bundled snapshot because live Intel data was unreachable. */
  signatureVerifiedWithSnapshot: (date: string, tcbStatus: string) => string;
  signatureNotVerified: (reason: string) => string;
  /** Shown when enclaveChat throws EnclaveError('quote_unverified'). */
  unverifiedNothingSent: string;
  measurement: (mrtdShort: string) => string;
  pccsNote: string;
  limits: string;
  /** One-line claim for PRIVACY / CLAIMS docs. */
  claim: string;
};

export const ENCLAVE_COPY: EnclaveCopy = {
  bindingOk:
    "Your browser checked that this enclave's key and your one-time code are sealed in an Intel TDX report from a non-debug enclave.",
  bindingFailed:
    "Your browser could not match this enclave's key and your one-time code to an Intel TDX report from a non-debug enclave, so nothing was sent.",
  freshness: (checkedAt) =>
    `Checked at ${checkedAt}. The one-time code shows the report was fresh at that moment; requests in the next 10 minutes reuse the same checked key.`,
  signaturePending: "Checking Intel's signature on that report…",
  signatureVerifiedInBrowser: (tcb) =>
    `Intel's signature chain on that report was verified in your browser with live Intel data (platform status: ${tcb}).`,
  signatureVerifiedOnServer: (tcb) =>
    `Intel's signature chain on that report was verified on the server, not in your browser, with live Intel data (platform status: ${tcb}).`,
  signatureVerifiedWithSnapshot: (date, tcb) =>
    `Intel signature checked with saved Intel data from ${date} (live data was unreachable). Platform status: ${tcb}.`,
  signatureNotVerified: (reason) => `Intel's signature on that report could not be verified (${reason}), so nothing was sent.`,
  unverifiedNothingSent: "We couldn't verify the enclave right now — nothing was sent. Try again in a minute.",
  measurement: (short) => `Enclave software measurement (MRTD): ${short}. Shown for reference; not yet checked against a published list.`,
  pccsNote:
    "To check Intel's signature, your browser fetches public Intel data from Phala's PCCS server, which sees your IP address. No child data is sent to it.",
  limits: HONEST_LIMITS,
  claim:
    "Your browser checks that the enclave's key and your one-time nonce are sealed inside an Intel TDX quote from a non-debug enclave and verifies Intel's signature chain on that quote; nothing is sent unless both checks pass.",
};

export const ENCLAVE_COPY_ES: EnclaveCopy = {
  bindingOk:
    'Su navegador comprobó que la clave de este enclave y su código de un solo uso están sellados en un informe Intel TDX de un enclave sin modo de depuración.',
  bindingFailed:
    'Su navegador no pudo vincular la clave de este enclave y su código de un solo uso a un informe Intel TDX de un enclave sin modo de depuración, así que no se envió nada.',
  freshness: (checkedAt) =>
    `Comprobado a las ${checkedAt}. El código de un solo uso muestra que el informe era reciente en ese momento; las solicitudes de los próximos 10 minutos reutilizan la misma clave comprobada.`,
  signaturePending: 'Comprobando la firma de Intel en ese informe…',
  signatureVerifiedInBrowser: (tcb) =>
    `La cadena de firmas de Intel en ese informe se verificó en su navegador con datos de Intel en directo (estado de la plataforma: ${tcb}).`,
  signatureVerifiedOnServer: (tcb) =>
    `La cadena de firmas de Intel en ese informe se verificó en el servidor, no en su navegador, con datos de Intel en directo (estado de la plataforma: ${tcb}).`,
  signatureVerifiedWithSnapshot: (date, tcb) =>
    `La firma de Intel se comprobó con datos de Intel guardados del ${date} (no se pudo acceder a los datos en directo). Estado de la plataforma: ${tcb}.`,
  signatureNotVerified: (reason) => `No se pudo verificar la firma de Intel en ese informe (${reason}), así que no se envió nada.`,
  unverifiedNothingSent: 'No pudimos verificar el enclave en este momento; no se envió nada. Inténtelo de nuevo en un minuto.',
  measurement: (short) =>
    `Medición del software del enclave (MRTD): ${short}. Se muestra como referencia; todavía no se compara con una lista publicada.`,
  pccsNote:
    'Para comprobar la firma de Intel, su navegador descarga datos públicos de Intel del servidor PCCS de Phala, que ve su dirección IP. No se le envía ningún dato de los niños.',
  limits: HONEST_LIMITS_ES,
  claim:
    'Su navegador comprueba que la clave del enclave y su código de un solo uso están sellados en un informe Intel TDX de un enclave sin modo de depuración y verifica la cadena de firmas de Intel en ese informe; no se envía nada si alguna de las dos comprobaciones falla.',
};

/** The signature line for a summary, in the viewer's language. */
export function signatureText(s: AttestationSummary, lang: 'en' | 'es' = 'en'): string {
  const c = lang === 'es' ? ENCLAVE_COPY_ES : ENCLAVE_COPY;
  const q = s.quote;
  if (q.signature === 'pending') return c.signaturePending;
  if (q.signature === 'unverified') return c.signatureNotVerified(q.reason ?? q.reasonCode ?? 'unknown');
  const tcb = q.tcbStatus ?? 'unknown';
  if (q.signatureSource === 'snapshot') return c.signatureVerifiedWithSnapshot((q.snapshotCapturedAt ?? 'unknown date').slice(0, 10), tcb);
  return q.signatureCheckedIn === 'browser' ? c.signatureVerifiedInBrowser(tcb) : c.signatureVerifiedOnServer(tcb);
}
