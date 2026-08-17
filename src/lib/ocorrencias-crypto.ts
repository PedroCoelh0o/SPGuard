/** Criptografia local da área Ocorrências e Apurações.
 * A senha nunca é gravada: somente um verificador e dados cifrados AES-256-GCM.
 */
const ITERATIONS = 600_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type CipherEnvelope = { version: 1; iv: string; ciphertext: string };
export type OcorrenciasProtection = {
  id: "principal";
  salt: string;
  verifier_iv: string;
  verifier_ciphertext: string;
  iterations: number;
  created_at?: string;
  updated_at?: string;
};

function bytesToBase64(bytes: Uint8Array) {
  let out = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) out += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(out);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function keyFor(password: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptBytes(bytes: Uint8Array, key: CryptoKey): Promise<CipherEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
  return { version: 1, iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) };
}

export async function decryptBytes(envelope: CipherEnvelope, key: CryptoKey) {
  if (envelope.version !== 1) throw new Error("Formato protegido não suportado");
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(envelope.iv) }, key, base64ToBytes(envelope.ciphertext)));
}

export async function encryptJson(value: unknown, key: CryptoKey) {
  return JSON.stringify(await encryptBytes(encoder.encode(JSON.stringify(value)), key));
}

export async function decryptJson<T>(payload: string, key: CryptoKey): Promise<T> {
  const encrypted = JSON.parse(payload) as CipherEnvelope;
  return JSON.parse(decoder.decode(await decryptBytes(encrypted, key))) as T;
}

export async function createProtection(password: string): Promise<{ protection: OcorrenciasProtection; key: CryptoKey }> {
  if (password.length < 12) throw new Error("Use uma senha de pelo menos 12 caracteres");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await keyFor(password, salt);
  const verifier = await encryptBytes(encoder.encode("SPGUARD-OCORRENCIAS-v1"), key);
  const now = new Date().toISOString();
  return { protection: { id: "principal", salt: bytesToBase64(salt), verifier_iv: verifier.iv, verifier_ciphertext: verifier.ciphertext, iterations: ITERATIONS, created_at: now, updated_at: now }, key };
}

export async function unlockProtection(protection: OcorrenciasProtection, password: string) {
  if (protection.iterations !== ITERATIONS) throw new Error("Formato de proteção não suportado");
  try {
    const key = await keyFor(password, base64ToBytes(protection.salt));
    const result = decoder.decode(await decryptBytes({ version: 1, iv: protection.verifier_iv, ciphertext: protection.verifier_ciphertext }, key));
    if (result !== "SPGUARD-OCORRENCIAS-v1") throw new Error();
    return key;
  } catch { throw new Error("Senha incorreta"); }
}

export async function encryptFile(file: File, key: CryptoKey) {
  return new Blob([JSON.stringify(await encryptBytes(new Uint8Array(await file.arrayBuffer()), key))], { type: "application/octet-stream" });
}

export async function decryptFile(blob: Blob, key: CryptoKey, type = "application/octet-stream") {
  const envelope = JSON.parse(decoder.decode(await blob.arrayBuffer())) as CipherEnvelope;
  return new Blob([await decryptBytes(envelope, key)], { type });
}
