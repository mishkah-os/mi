import crypto from 'crypto';
import { deleteRecaptchaChallenge, loadRecaptchaChallenge, persistRecaptchaChallenge, pruneRecaptchaChallengeStore } from './database/sqlite-ops.js';
import { createId } from './utils.js';
import config from './config/index.js';

const { RECAPTCHA_LENGTH, RECAPTCHA_TTL_MS } = config;

export function pruneRecaptchaChallenges(now) {
    pruneRecaptchaChallengeStore(RECAPTCHA_TTL_MS, now);
}

function createRecaptchaCode(length) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    if (!Number.isFinite(length) || length <= 0) return '';
    const bytes = crypto.randomBytes(length);
    let code = '';
    for (let i = 0; i < length; i += 1) {
        const idx = bytes[i] % chars.length;
        code += chars.charAt(idx);
    }
    return code;
}

function renderRecaptchaSvg(code) {
    const safeCode = (code || '').trim().slice(0, 12) || '------';
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="160" height="60" role="img" aria-label="captcha">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#f8fafc" />
      <stop offset="100%" stop-color="#e2e8f0" />
    </linearGradient>
  </defs>
  <rect width="160" height="60" fill="url(#bg)" rx="8" />
  <g transform="translate(80 36) rotate(-4)">
    <text x="0" y="0" font-family="monospace" font-weight="bold" font-size="28" fill="#0f172a" text-anchor="middle" dominant-baseline="middle">${safeCode}</text>
  </g>
  <g stroke="#818cf8" stroke-opacity="0.45">
    <line x1="10" y1="20" x2="150" y2="12" />
    <line x1="14" y1="50" x2="140" y2="42" />
    <line x1="18" y1="8" x2="120" y2="28" />
    <line x1="30" y1="32" x2="128" y2="18" />
  </g>
</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export function issueRecaptchaChallenge() {
    const now = Date.now();
    pruneRecaptchaChallenges(now);
    const code = createRecaptchaCode(RECAPTCHA_LENGTH);
    const token = createId('rcp');
    const image = renderRecaptchaSvg(code);
    persistRecaptchaChallenge(token, code, now);
    return { token, image, expiresIn: RECAPTCHA_TTL_MS };
}

export function verifyRecaptchaChallenge(token, input) {
    if (!token || !input) return false;
    const now = Date.now();
    const meta = loadRecaptchaChallenge(token);
    const valid =
        !!meta &&
        typeof meta.code === 'string' &&
        meta.createdAt &&
        meta.createdAt + RECAPTCHA_TTL_MS >= now &&
        meta.code.toLowerCase() === String(input || '').trim().toLowerCase();
    deleteRecaptchaChallenge(token);
    pruneRecaptchaChallenges(now);
    return valid;
}
