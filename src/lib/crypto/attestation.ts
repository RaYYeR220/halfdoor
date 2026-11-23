import {
  QuoteParseError, addressFromPublicKey, checkQuoteBinding, enclaveKeyOf, parseTdxQuote, quoteBytesFrom, TDX_TEE_TYPE,
  type CheckedIn, type QuoteBinding, type QuoteSignatureResult, type SignatureReasonCode,
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
  mrtd: string;
  tdAttributes: string;
  /** Intel signature chain: 'pending' until verifyQuoteSignature finishes (encryption does not wait for it). */
  signature: 'pending' | 'verified' | 'unverified';
  /** Where the signature check ran: 'browser' = this tab; 'node' = a server/eval process, NOT the user's browser. */
  signatureCheckedIn?: CheckedIn;
  signatureCheckedAt?: string;
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
  /** Our own check of the quote: key address + our nonce in REPORTDATA, non-debug TDX. Always all-true in a summary. */
  binding: QuoteBinding;
  quote: QuoteSummary;
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * Synchronous gate before anything is encrypted. Throws unless Venice says verified, echoes our nonce and
 * model, and the TDX quote itself binds the key we will encrypt to plus OUR nonce, from a non-debug TD.
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
    binding,
    quote: { mrtd: binding.mrtd, tdAttributes, signature: 'pending' },
  };
}

/** A copy of the summary carrying the finished Intel signature check. */
export function withSignature(s: AttestationSummary, r: QuoteSignatureResult): AttestationSummary {
  const quote: QuoteSummary = {
    mrtd: s.quote.mrtd,
    tdAttributes: s.quote.tdAttributes,
    signature: r.status,
    signatureCheckedIn: r.checkedIn,
    signatureCheckedAt: new Date().toISOString(),
  };
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

export type EnclaveCopy = {
  bindingOk: string;
  bindingFailed: string;
  freshness: (checkedAt: string) => string;
  signaturePending: string;
  signatureVerifiedInBrowser: (tcbStatus: string) => string;
  signatureVerifiedOnServer: (tcbStatus: string) => string;
  signatureNotVerified: (reason: string) => string;
  /** One-line claim for PRIVACY / CLAIMS docs. */
  claim: string;
};

export const ENCLAVE_COPY: EnclaveCopy = {
  bindingOk:
    "Your browser checked that this enclave's key and your one-time code are sealed in an Intel TDX report from a non-debug enclave.",
  bindingFailed:
    "Your browser could not match this enclave's key and your one-time code to an Intel TDX report from a non-debug enclave, so nothing was sent.",
  freshness: (checkedAt) =>
    `Checked at ${checkedAt}. The one-time code proves the report was fresh at that moment; requests in the next 10 minutes reuse the same checked key.`,
  signaturePending: "Checking Intel's signature on that report…",
  signatureVerifiedInBrowser: (tcb) =>
    `Intel's signature chain on that report was verified in your browser (platform status: ${tcb}).`,
  signatureVerifiedOnServer: (tcb) =>
    `Intel's signature chain on that report was verified on the server, not in your browser (platform status: ${tcb}).`,
  signatureNotVerified: (reason) =>
    `Intel's signature on that report was not verified (${reason}). Your text was still encrypted to the key checked above.`,
  claim:
    "Your browser checks that the enclave's key and your one-time nonce are sealed inside an Intel TDX quote from a non-debug enclave; Intel signature chain verified in the browser (or shown as 'not verified' if the check could not run).",
};

export const ENCLAVE_COPY_ES: EnclaveCopy = {
  bindingOk:
    'Su navegador comprobó que la clave de este enclave y su código de un solo uso están sellados en un informe Intel TDX de un enclave sin modo de depuración.',
  bindingFailed:
    'Su navegador no pudo vincular la clave de este enclave y su código de un solo uso a un informe Intel TDX de un enclave sin modo de depuración, así que no se envió nada.',
  freshness: (checkedAt) =>
    `Comprobado a las ${checkedAt}. El código de un solo uso demuestra que el informe era reciente en ese momento; las solicitudes de los próximos 10 minutos reutilizan la misma clave comprobada.`,
  signaturePending: 'Comprobando la firma de Intel en ese informe…',
  signatureVerifiedInBrowser: (tcb) =>
    `La cadena de firmas de Intel en ese informe se verificó en su navegador (estado de la plataforma: ${tcb}).`,
  signatureVerifiedOnServer: (tcb) =>
    `La cadena de firmas de Intel en ese informe se verificó en el servidor, no en su navegador (estado de la plataforma: ${tcb}).`,
  signatureNotVerified: (reason) =>
    `La firma de Intel en ese informe no se verificó (${reason}). Su texto se cifró igualmente con la clave comprobada arriba.`,
  claim:
    "Su navegador comprueba que la clave del enclave y su código de un solo uso están sellados en un informe Intel TDX de un enclave sin modo de depuración; la cadena de firmas de Intel se verifica en el navegador (o se muestra como 'no verificada' si la comprobación no pudo ejecutarse).",
};

/** The signature line for a summary, in the viewer's language. */
export function signatureText(s: AttestationSummary, lang: 'en' | 'es' = 'en'): string {
  const c = lang === 'es' ? ENCLAVE_COPY_ES : ENCLAVE_COPY;
  const q = s.quote;
  if (q.signature === 'pending') return c.signaturePending;
  if (q.signature === 'unverified') return c.signatureNotVerified(q.reason ?? q.reasonCode ?? 'unknown');
  const tcb = q.tcbStatus ?? 'unknown';
  return q.signatureCheckedIn === 'browser' ? c.signatureVerifiedInBrowser(tcb) : c.signatureVerifiedOnServer(tcb);
}
