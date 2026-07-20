const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford's Base32 alphabet
const ENCODING_LEN = ENCODING.length;

/**
 * Generates a standard Crockford Base32 encoded ULID (Universally Unique Lexicographically Sortable Identifier).
 * 10 characters of timestamp + 16 characters of random noise.
 */
export function generateUlid(): string {
  let now = Date.now();
  const timeChars = new Array(10);
  for (let i = 9; i >= 0; i--) {
    const mod = now % ENCODING_LEN;
    timeChars[i] = ENCODING.charAt(mod);
    now = Math.floor(now / ENCODING_LEN);
  }

  const randChars = new Array(16);
  for (let i = 0; i < 16; i++) {
    const rand = Math.floor(Math.random() * ENCODING_LEN);
    randChars[i] = ENCODING.charAt(rand);
  }

  return timeChars.join('') + randChars.join('');
}
