export type AttestationErrorCode = 'not_verified' | 'nonce_mismatch' | 'no_key' | 'model_mismatch';

export class AttestationError extends Error {
  readonly code: AttestationErrorCode;
  constructor(code: AttestationErrorCode) {
    super(`attestation check failed: ${code}`);
    this.name = 'AttestationError';
    this.code = code;
  }
}

export type AttestationSummary = {
  verified: boolean;
  nonceOk: boolean;
  provider: string;
  hardware: string | null;
  model: string;
  signingAddress: string | null;
  modelPublicKey: string;
  checkedAt: string;
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

export function checkAttestation(raw: unknown, nonce: string, model: string): AttestationSummary {
  const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (a.verified !== true) throw new AttestationError('not_verified');
  if (a.nonce !== nonce) throw new AttestationError('nonce_mismatch');
  if (a.model !== model) throw new AttestationError('model_mismatch');
  const key = str(a.signing_key) ?? str(a.signing_public_key);
  if (!key) throw new AttestationError('no_key');
  return {
    verified: true,
    nonceOk: true,
    provider: str(a.tee_provider) ?? 'unknown',
    hardware: str(a.tee_hardware),
    model,
    signingAddress: str(a.signing_address),
    modelPublicKey: key,
    checkedAt: new Date().toISOString(),
  };
}
