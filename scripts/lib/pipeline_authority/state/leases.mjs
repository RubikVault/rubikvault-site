import { openAuthorityDb, withImmediateTransaction } from './db.mjs';

function nowIso() {
  return new Date().toISOString();
}

export function acquireLease(resource, owner, ttlSeconds = 300) {
  const { db } = openAuthorityDb();
  const acquiredAt = nowIso();
  const expiresAt = new Date(Date.now() + (ttlSeconds * 1000)).toISOString();
  return withImmediateTransaction(db, () => {
    const existing = db.prepare('SELECT resource, owner, fencing_token, expires_at FROM leases WHERE resource = ?').get(resource);
    if (existing && new Date(existing.expires_at).getTime() > Date.now()) {
      return { acquired: false, lease: existing };
    }
    const nextToken = Number(existing?.fencing_token || 0) + 1;
    db.prepare(`
      INSERT INTO leases (resource, owner, fencing_token, acquired_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(resource) DO UPDATE SET
        owner = excluded.owner,
        fencing_token = excluded.fencing_token,
        acquired_at = excluded.acquired_at,
        expires_at = excluded.expires_at
    `).run(resource, owner, nextToken, acquiredAt, expiresAt);
    return {
      acquired: true,
      lease: { resource, owner, fencing_token: nextToken, acquired_at: acquiredAt, expires_at: expiresAt },
    };
  });
}

export function releaseLease(resource, owner) {
  const { db } = openAuthorityDb();
  withImmediateTransaction(db, () => {
    db.prepare('DELETE FROM leases WHERE resource = ? AND owner = ?').run(resource, owner);
  });
}
