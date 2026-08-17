/** Proteção local da área Ocorrências e Apurações.
 * A chave que cifra os dados é separada da senha de acesso: senha e palavra
 * de recuperação apenas protegem essa chave. Assim, redefinir a senha não
 * exige enviar ou apagar registros, fotos ou evidências. */
const ITERATIONS = 600_000;
const TOKEN = "SPGUARD-OCORRENCIAS-v2";
const LEGACY_TOKEN = "SPGUARD-OCORRENCIAS-v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type CipherEnvelope = { version: 1; iv: string; ciphertext: string };
export type OcorrenciasProtection = {
  id: "principal";
  salt: string;
  verifier_iv: string;
  verifier_ciphertext: string;
  iterations: number;
  recovery_salt?: string | null;
  recovery_verifier_iv?: string | null;
  recovery_verifier_ciphertext?: string | null;
  secret_password_iv?: string | null;
  secret_password_ciphertext?: string | null;
  secret_recovery_iv?: string | null;
  secret_recovery_ciphertext?: string | null;
  data_mode?: "vault" | "password-derived" | null;
  data_salt?: string | null;
  created_at?: string;
  updated_at?: string;
};

function bytesToBase64(bytes: Uint8Array) { let out = ""; for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(out); }
function base64ToBytes(value: string) { const binary = atob(value); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return bytes; }
async function keyFor(value: string, salt: Uint8Array) { const material = await crypto.subtle.importKey("raw", encoder.encode(value), "PBKDF2", false, ["deriveKey"]); return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); }
function assertPassword(password: string) { if (password.length < 12) throw new Error("Use uma senha com pelo menos 12 caracteres"); }
function assertRecovery(value: string) { if (value.length < 7 || value.length > 16) throw new Error("A palavra de recuperação deve ter entre 7 e 16 caracteres"); }

export async function encryptBytes(bytes: Uint8Array, key: CryptoKey): Promise<CipherEnvelope> { const iv = crypto.getRandomValues(new Uint8Array(12)); const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes)); return { version: 1, iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) }; }
export async function decryptBytes(envelope: CipherEnvelope, key: CryptoKey) { if (envelope.version !== 1) throw new Error("Formato protegido não suportado"); return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(envelope.iv) }, key, base64ToBytes(envelope.ciphertext))); }
export async function encryptJson(value: unknown, key: CryptoKey) { return JSON.stringify(await encryptBytes(encoder.encode(JSON.stringify(value)), key)); }
export async function decryptJson<T>(payload: string, key: CryptoKey): Promise<T> { return JSON.parse(decoder.decode(await decryptBytes(JSON.parse(payload) as CipherEnvelope, key))) as T; }
export async function encryptFile(file: File, key: CryptoKey) { return new Blob([JSON.stringify(await encryptBytes(new Uint8Array(await file.arrayBuffer()), key))], { type: "application/octet-stream" }); }
export async function decryptFile(blob: Blob, key: CryptoKey, type = "application/octet-stream") { return new Blob([await decryptBytes(JSON.parse(decoder.decode(await blob.arrayBuffer())) as CipherEnvelope, key)], { type }); }

export function hasRecovery(protection: OcorrenciasProtection | null | undefined) { return !!(protection?.recovery_salt && protection.recovery_verifier_iv && protection.recovery_verifier_ciphertext && protection.secret_password_iv && protection.secret_password_ciphertext && protection.secret_recovery_iv && protection.secret_recovery_ciphertext && protection.data_mode); }
async function verify(key: CryptoKey, iv: string, ciphertext: string, expected = TOKEN) { return decoder.decode(await decryptBytes({ version: 1, iv, ciphertext }, key)) === expected; }
async function dataKey(mode: "vault" | "password-derived", secret: Uint8Array, dataSalt?: string | null) { if (mode === "vault") return crypto.subtle.importKey("raw", secret, "AES-GCM", false, ["encrypt", "decrypt"]); if (!dataSalt) throw new Error("Dados de proteção incompletos"); return keyFor(decoder.decode(secret), base64ToBytes(dataSalt)); }

async function buildProtection(password: string, recovery: string, secret: Uint8Array, mode: "vault" | "password-derived", dataSalt?: string | null, createdAt?: string) {
  assertPassword(password); assertRecovery(recovery);
  const passwordSalt = crypto.getRandomValues(new Uint8Array(16)); const recoverySalt = crypto.getRandomValues(new Uint8Array(16));
  const passwordKey = await keyFor(password, passwordSalt); const recoveryKey = await keyFor(recovery, recoverySalt);
  const passwordVerifier = await encryptBytes(encoder.encode(TOKEN), passwordKey); const recoveryVerifier = await encryptBytes(encoder.encode(TOKEN), recoveryKey);
  const wrappedPassword = await encryptBytes(secret, passwordKey); const wrappedRecovery = await encryptBytes(secret, recoveryKey); const now = new Date().toISOString();
  return { protection: { id: "principal" as const, salt: bytesToBase64(passwordSalt), verifier_iv: passwordVerifier.iv, verifier_ciphertext: passwordVerifier.ciphertext, iterations: ITERATIONS, recovery_salt: bytesToBase64(recoverySalt), recovery_verifier_iv: recoveryVerifier.iv, recovery_verifier_ciphertext: recoveryVerifier.ciphertext, secret_password_iv: wrappedPassword.iv, secret_password_ciphertext: wrappedPassword.ciphertext, secret_recovery_iv: wrappedRecovery.iv, secret_recovery_ciphertext: wrappedRecovery.ciphertext, data_mode: mode, data_salt: dataSalt ?? null, created_at: createdAt ?? now, updated_at: now }, key: await dataKey(mode, secret, dataSalt) };
}

/** Nova área: os dados recebem uma chave aleatória, nunca derivada da senha. */
export async function createProtection(password: string, recovery: string) { return buildProtection(password, recovery, crypto.getRandomValues(new Uint8Array(32)), "vault"); }

/** Converte a proteção antiga sem tocar nos registros já cifrados. */
export async function addRecoveryToLegacy(protection: OcorrenciasProtection, currentPassword: string, recovery: string) {
  const legacyKey = await legacyUnlock(protection, currentPassword);
  const result = await buildProtection(currentPassword, recovery, encoder.encode(currentPassword), "password-derived", protection.salt, protection.created_at);
  return { ...result, key: legacyKey };
}

async function legacyUnlock(protection: OcorrenciasProtection, password: string) {
  if (protection.iterations !== ITERATIONS) throw new Error("Formato de proteção não suportado");
  const key = await keyFor(password, base64ToBytes(protection.salt));
  if (!(await verify(key, protection.verifier_iv, protection.verifier_ciphertext, LEGACY_TOKEN))) throw new Error("Senha incorreta");
  return key;
}

export async function unlockProtection(protection: OcorrenciasProtection, password: string): Promise<{ key: CryptoKey; legacy: boolean }> {
  try {
    if (!hasRecovery(protection)) return { key: await legacyUnlock(protection, password), legacy: true };
    const accessKey = await keyFor(password, base64ToBytes(protection.salt));
    if (!(await verify(accessKey, protection.verifier_iv, protection.verifier_ciphertext))) throw new Error();
    const secret = await decryptBytes({ version: 1, iv: protection.secret_password_iv!, ciphertext: protection.secret_password_ciphertext! }, accessKey);
    return { key: await dataKey(protection.data_mode!, secret, protection.data_salt), legacy: false };
  } catch { throw new Error("Senha incorreta"); }
}

/** Redefine somente a senha de acesso; os dados continuam cifrados pela mesma chave local. */
export async function resetPasswordWithRecovery(protection: OcorrenciasProtection, recovery: string, newPassword: string) {
  if (!hasRecovery(protection)) throw new Error("Crie a palavra de recuperação usando a senha atual antes de redefinir a senha");
  try {
    assertPassword(newPassword); assertRecovery(recovery);
    const recoveryKey = await keyFor(recovery, base64ToBytes(protection.recovery_salt!));
    if (!(await verify(recoveryKey, protection.recovery_verifier_iv!, protection.recovery_verifier_ciphertext!))) throw new Error();
    const secret = await decryptBytes({ version: 1, iv: protection.secret_recovery_iv!, ciphertext: protection.secret_recovery_ciphertext! }, recoveryKey);
    const passwordSalt = crypto.getRandomValues(new Uint8Array(16)); const passwordKey = await keyFor(newPassword, passwordSalt);
    const verifier = await encryptBytes(encoder.encode(TOKEN), passwordKey); const wrapped = await encryptBytes(secret, passwordKey);
    return { key: await dataKey(protection.data_mode!, secret, protection.data_salt), protection: { ...protection, salt: bytesToBase64(passwordSalt), verifier_iv: verifier.iv, verifier_ciphertext: verifier.ciphertext, secret_password_iv: wrapped.iv, secret_password_ciphertext: wrapped.ciphertext, updated_at: new Date().toISOString() } };
  } catch (error) { if ((error as Error).message.includes("pelo menos")) throw error; throw new Error("Palavra de recuperação incorreta"); }
}
