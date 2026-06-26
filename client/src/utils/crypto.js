// Client-side E2E encryption utilities using Web Crypto API

const ALGO = { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
const AES_ALGO = { name: 'AES-GCM', length: 256 };

export async function generateKeyPair() {
  const keyPair = await crypto.subtle.generateKey(ALGO, true, ['encrypt', 'decrypt']);
  const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  return {
    publicKey: btoa(String.fromCharCode(...new Uint8Array(publicKey))),
    privateKey: btoa(String.fromCharCode(...new Uint8Array(privateKey)))
  };
}

export async function importPublicKey(spkiBase64) {
  const binary = Uint8Array.from(atob(spkiBase64), c => c.charCodeAt(0));
  return crypto.subtle.importKey('spki', binary, ALGO, true, ['encrypt']);
}

export async function importPrivateKey(pkcs8Base64) {
  const binary = Uint8Array.from(atob(pkcs8Base64), c => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', binary, ALGO, true, ['decrypt']);
}

export async function encryptMessage(plainText, recipientPublicKeyBase64) {
  const publicKey = await importPublicKey(recipientPublicKeyBase64);
  const aesKey = await crypto.subtle.generateKey(AES_ALGO, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plainText);
  const cipherText = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoded);
  const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);
  const encryptedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, rawAesKey);
  return JSON.stringify({
    ek: btoa(String.fromCharCode(...new Uint8Array(encryptedKey))),
    iv: btoa(String.fromCharCode(...new Uint8Array(iv))),
    ct: btoa(String.fromCharCode(...new Uint8Array(cipherText)))
  });
}

export async function decryptMessage(cipherJSON, privateKeyBase64) {
  const { ek, iv, ct } = JSON.parse(cipherJSON);
  const privateKey = await importPrivateKey(privateKeyBase64);
  const encryptedKey = Uint8Array.from(atob(ek), c => c.charCodeAt(0));
  const rawAesKey = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, encryptedKey);
  const aesKey = await crypto.subtle.importKey('raw', rawAesKey, AES_ALGO, false, ['decrypt']);
  const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
  const cipherBytes = Uint8Array.from(atob(ct), c => c.charCodeAt(0));
  const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, aesKey, cipherBytes);
  return new TextDecoder().decode(plainBuffer);
}

export function getStoredPrivateKey() {
  return localStorage.getItem('chatwave_private_key');
}

export function storePrivateKey(key) {
  localStorage.setItem('chatwave_private_key', key);
}

export function hasKeys() {
  return !!localStorage.getItem('chatwave_private_key');
}
