import { isDifficulty, type Difficulty } from '../shared/difficulty';

export interface Session {
  answerId: number;
  guessedIds: number[];
  catalogVersion: string;
  expiresAt: number;
  gaveUp?: boolean;
  // Missing in pre-difficulty sessions, which used the full advanced pool.
  difficulty?: Difficulty;
}

const encoder = new TextEncoder();
function encode(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function decode(value: string) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
}

export class SessionCodec {
  private key: Promise<CryptoKey>;
  constructor(secret: string) {
    if (secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
    this.key = crypto.subtle.digest('SHA-256', encoder.encode(secret)).then(hash => crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']));
  }
  async seal(session: Session) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('guess-vocaloid:v1') }, await this.key, encoder.encode(JSON.stringify(session)));
    return `v1.${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
  }
  async open(token: string): Promise<Session> {
    if (token.length > 2048) throw new Error('INVALID_SESSION');
    const [version, iv, value, extra] = token.split('.');
    if (version !== 'v1' || !iv || !value || extra) throw new Error('INVALID_SESSION');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv), additionalData: encoder.encode('guess-vocaloid:v1') }, await this.key, decode(value));
    const session: Session = JSON.parse(new TextDecoder().decode(plain));
    if (!Number.isSafeInteger(session.answerId) || !Array.isArray(session.guessedIds) || session.guessedIds.length > 8 ||
        !session.guessedIds.every(Number.isSafeInteger) || new Set(session.guessedIds).size !== session.guessedIds.length ||
        (session.gaveUp !== undefined && typeof session.gaveUp !== 'boolean') ||
        (session.difficulty !== undefined && !isDifficulty(session.difficulty)) ||
        typeof session.catalogVersion !== 'string' || !Number.isFinite(session.expiresAt) || session.expiresAt < Date.now()) throw new Error('INVALID_SESSION');
    return session;
  }
}
