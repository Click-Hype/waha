'use strict';

// Run only against the installed candidate. All key/session material is generated
// in memory and never rendered or written. The output contains fixed case IDs.
const { randomBytes } = require('node:crypto');
const signal = require('libsignal');
const { keyhelper, curve, SessionBuilder, SessionCipher, SessionRecord, ProtocolAddress } = signal;
const results = [];
const logs = { log: console.log, info: console.info, warn: console.warn, error: console.error };
let vendorLogCount = 0;
for (const name of Object.keys(logs)) console[name] = () => { vendorLogCount++; };

function requireFact(value) {
  if (!value) throw new Error('vector-failed');
}
function same(left, right) {
  requireFact(Buffer.isBuffer(left) && Buffer.isBuffer(right) && left.equals(right));
}
async function refuses(operation) {
  let denied = false;
  try { await operation(); } catch { denied = true; }
  requireFact(denied);
}
async function check(id, operation) {
  try {
    await operation();
    results.push({ case: id, passed: true });
  } catch {
    results.push({ case: id, passed: false });
    throw new Error('vector-failed');
  }
}

function participant(name) {
  const identity = keyhelper.generateIdentityKeyPair();
  const registration = keyhelper.generateRegistrationId();
  const signed = keyhelper.generateSignedPreKey(identity, 17);
  const pre = keyhelper.generatePreKey(23);
  let remoteName;
  let remoteIdentity;
  const sessions = new Map();
  const prekeys = new Map([[pre.keyId, pre.keyPair]]);
  const store = {
    isTrustedIdentity: async (id, key) =>
      (id === remoteName || id === `${remoteName}.1`) && remoteIdentity.equals(key),
    getOurIdentity: async () => identity,
    getOurRegistrationId: async () => registration,
    loadSession: async (id) => sessions.has(id)
      ? SessionRecord.deserialize(structuredClone(sessions.get(id))) : undefined,
    storeSession: async (id, value) => sessions.set(id, structuredClone(value.serialize())),
    loadPreKey: async (id) => prekeys.get(id),
    loadSignedPreKey: async (id) => id === signed.keyId ? signed.keyPair : undefined,
    removePreKey: async (id) => prekeys.delete(id),
  };
  return {
    name, identity, signed, pre, store, sessions, prekeys,
    trust(other) { remoteName = other.name; remoteIdentity = other.identity.pubKey; },
    bundle() { return {
      identityKey: identity.pubKey, registrationId: registration,
      signedPreKey: { keyId: signed.keyId, publicKey: signed.keyPair.pubKey, signature: signed.signature },
      preKey: { keyId: pre.keyId, publicKey: pre.keyPair.pubKey },
    }; },
  };
}

async function main() {
  const alice = participant('synthetic-a');
  const bob = participant('synthetic-b');
  alice.trust(bob); bob.trust(alice);
  const addressBob = new ProtocolAddress(bob.name, 1);
  const addressAlice = new ProtocolAddress(alice.name, 1);
  const sender = new SessionCipher(alice.store, addressBob);
  const receiver = new SessionCipher(bob.store, addressAlice);
  await check('curve-signature-verification', async () => {
    requireFact(curve.verifySignature(bob.identity.pubKey, bob.signed.keyPair.pubKey, bob.signed.signature, false));
    const invalid = Buffer.from(bob.signed.signature); invalid[0] ^= 1;
    requireFact(!curve.verifySignature(bob.identity.pubKey, bob.signed.keyPair.pubKey, invalid, false));
  });
  await check('outgoing-prekey-and-one-time-key-consumption', async () => {
    await new SessionBuilder(alice.store, addressBob).initOutgoing(bob.bundle());
    const data = randomBytes(32);
    const sent = await sender.encrypt(data);
    requireFact(sent.type === 3 && Buffer.isBuffer(sent.body));
    same(await receiver.decryptPreKeyWhisperMessage(sent.body), data);
    requireFact(!bob.prekeys.has(bob.pre.keyId));
  });
  await check('bidirectional-ratchet-acknowledgement', async () => {
    const data = randomBytes(41);
    const sent = await receiver.encrypt(data);
    requireFact(sent.type === 1);
    same(await sender.decryptWhisperMessage(sent.body), data);
  });
  let consumed;
  await check('out-of-order-skipped-message-keys', async () => {
    const first = randomBytes(21); const second = randomBytes(22);
    const firstSent = await sender.encrypt(first);
    const secondSent = await sender.encrypt(second);
    requireFact(firstSent.type === 1 && secondSent.type === 1);
    same(await receiver.decryptWhisperMessage(secondSent.body), second);
    same(await receiver.decryptWhisperMessage(firstSent.body), first);
    consumed = firstSent.body;
  });
  await check('replay-is-refused', async () => {
    await refuses(() => receiver.decryptWhisperMessage(consumed));
  });
  await check('tampered-mac-is-refused-without-consuming-valid-message', async () => {
    const data = randomBytes(25);
    const sent = await sender.encrypt(data);
    const changed = Buffer.from(sent.body); changed[changed.length - 1] ^= 1;
    await refuses(() => receiver.decryptWhisperMessage(changed));
    same(await receiver.decryptWhisperMessage(sent.body), data);
  });
  await check('serialized-session-reopen-continues-ratchet', async () => {
    const reopened = new SessionCipher(bob.store, addressAlice);
    const data = randomBytes(37);
    const sent = await sender.encrypt(data);
    same(await reopened.decryptWhisperMessage(sent.body), data);
    const reply = randomBytes(38);
    const returned = await reopened.encrypt(reply);
    same(await sender.decryptWhisperMessage(returned.body), reply);
  });
  await check('untrusted-identity-does-not-create-session', async () => {
    const outsider = participant('synthetic-c'); outsider.trust(bob);
    const other = keyhelper.generateIdentityKeyPair();
    const bundle = { ...bob.bundle(), identityKey: other.pubKey };
    await refuses(() => new SessionBuilder(outsider.store, addressBob).initOutgoing(bundle));
    requireFact(outsider.sessions.size === 0);
  });
  // A separate source finding: both the legacy Git package and npm 6 return true
  // for isInit signatures. These vectors do not attest that init authentication.
  const invalid = Buffer.from(bob.signed.signature); invalid[0] ^= 1;
  const knownInitBypass = curve.verifySignature(bob.identity.pubKey, bob.signed.keyPair.pubKey, invalid, true) === true;
  requireFact(knownInitBypass);
  return { known_upstream_init_signature_bypass: knownInitBypass };
}

main().then((limits) => {
  for (const [name, value] of Object.entries(logs)) console[name] = value;
  process.stdout.write(JSON.stringify({
    format: 'noovicrew-private-libsignal-offline-vectors-v1', cases: results,
    vendor_log_events_redacted: vendorLogCount,
    ...limits, init_signature_authentication_approved: false,
    provider_connected: false, production_approved: false,
  }) + '\n');
}).catch(() => {
  for (const [name, value] of Object.entries(logs)) console[name] = value;
  process.stdout.write(JSON.stringify({
    format: 'noovicrew-private-libsignal-offline-vectors-v1', cases: results,
    failed: true, vendor_log_events_redacted: vendorLogCount,
    init_signature_authentication_approved: false, provider_connected: false, production_approved: false,
  }) + '\n');
  process.exitCode = 1;
});
