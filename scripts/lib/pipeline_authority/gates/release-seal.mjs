import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function materializePrivateKey(privateKeyPem) {
  return crypto.createPrivateKey(privateKeyPem);
}

function materializePublicKey(publicKeyPem) {
  return crypto.createPublicKey(publicKeyPem);
}

export function deriveSealKeyId(publicKeyPem) {
  if (!publicKeyPem) return null;
  const digest = crypto.createHash('sha256').update(publicKeyPem).digest('hex').slice(0, 16);
  return `ed25519-${digest}`;
}

function writePem(filePath, payload, mode = undefined) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, payload, { encoding: 'utf8', mode });
}

export function ensureSealKeyPair({ privateKeyPath, publicKeyPath } = {}) {
  if (!privateKeyPath || !publicKeyPath) {
    throw new Error('seal_key_paths_required');
  }
  if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
    const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
    const publicKeyPem = fs.readFileSync(publicKeyPath, 'utf8');
    return {
      privateKeyPem,
      publicKeyPem,
      keyId: deriveSealKeyId(publicKeyPem),
      created: false,
    };
  }

  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' });
  const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' });
  writePem(privateKeyPath, privateKeyPem, 0o600);
  writePem(publicKeyPath, publicKeyPem);
  return {
    privateKeyPem,
    publicKeyPem,
    keyId: deriveSealKeyId(publicKeyPem),
    created: true,
  };
}

export function signSealPayload(payload, { privateKeyPem, keyId } = {}) {
  if (!privateKeyPem || !keyId) return { signature: null, key_id: null, signature_algorithm: null };
  const body = canonicalize(payload);
  const signature = crypto.sign(null, Buffer.from(body), materializePrivateKey(privateKeyPem));
  return {
    signature: signature.toString('base64'),
    key_id: keyId,
    signature_algorithm: 'ed25519',
  };
}

export function verifySealPayload(payload, { signature, publicKeyPem } = {}) {
  if (!signature || !publicKeyPem) return false;
  const body = canonicalize(payload);
  const signatureBuffer = Buffer.from(signature, 'base64');
  return crypto.verify(null, Buffer.from(body), materializePublicKey(publicKeyPem), signatureBuffer);
}
