import type { GeneratorDefaults } from "./api";

const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.<>/?";

export const MIN_LENGTH = 6;
export const MAX_LENGTH = 64;

function secureRandomInt(maxExclusive: number): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % maxExclusive;
}

export function generatePassword(options: GeneratorDefaults): string {
  let charset = "";
  if (options.lowercase) charset += LOWERCASE;
  if (options.uppercase) charset += UPPERCASE;
  if (options.digits) charset += DIGITS;
  if (options.symbols) charset += SYMBOLS;

  if (charset.length === 0) {
    charset = LOWERCASE;
  }

  const length = Math.min(Math.max(options.length, MIN_LENGTH), MAX_LENGTH);
  const pools = [
    options.lowercase ? LOWERCASE : "",
    options.uppercase ? UPPERCASE : "",
    options.digits ? DIGITS : "",
    options.symbols ? SYMBOLS : "",
  ].filter(Boolean);

  const chars: string[] = [];
  // гарантируем хотя бы один символ из каждого выбранного набора
  for (const pool of pools) {
    chars.push(pool[secureRandomInt(pool.length)]);
  }
  while (chars.length < length) {
    chars.push(charset[secureRandomInt(charset.length)]);
  }

  // Fisher-Yates shuffle, чтобы гарантированные символы не были всегда в начале
  for (let i = chars.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.slice(0, length).join("");
}

export type StrengthLevel = "weak" | "fair" | "strong" | "very-strong";

export interface PasswordStrength {
  level: StrengthLevel;
  score: number; // 0..100
  entropyBits: number;
  label: string;
}

function charsetSizeOf(password: string): number {
  let size = 0;
  if (/[a-z]/.test(password)) size += 26;
  if (/[A-Z]/.test(password)) size += 26;
  if (/[0-9]/.test(password)) size += 10;
  if (/[^a-zA-Z0-9]/.test(password)) size += SYMBOLS.length;
  return size || 1;
}

export function estimateStrength(password: string): PasswordStrength {
  if (!password) {
    return { level: "weak", score: 0, entropyBits: 0, label: "Нет пароля" };
  }
  const entropyBits = password.length * Math.log2(charsetSizeOf(password));
  const score = Math.max(0, Math.min(100, Math.round((entropyBits / 100) * 100)));

  let level: StrengthLevel;
  let label: string;
  if (entropyBits < 40) {
    level = "weak";
    label = "Слабый";
  } else if (entropyBits < 60) {
    level = "fair";
    label = "Средний";
  } else if (entropyBits < 80) {
    level = "strong";
    label = "Надёжный";
  } else {
    level = "very-strong";
    label = "Очень надёжный";
  }

  return { level, score, entropyBits, label };
}
