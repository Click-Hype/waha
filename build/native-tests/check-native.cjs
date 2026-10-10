'use strict';

// Candidate-only offline checks. Output is closed case IDs and booleans.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const results = [];
let vendorEvents = 0;
let mediaSubstep = null;
const original = Object.fromEntries(['log', 'info', 'warn', 'error'].map(k => [k, console[k]]));
for (const k of Object.keys(original)) console[k] = () => { vendorEvents++; };

function fact(value) { if (!value) throw new Error('native-check-failed'); }
async function check(id, operation) {
  try { await operation(); results.push({ case: id, passed: true }); }
  catch { results.push({ case: id, passed: false }); throw new Error('native-check-failed'); }
}
function denies(operation) {
  let denied = false;
  try { operation(); } catch { denied = true; }
  fact(denied);
}
function run(command, args, options = {}) {
  const r = spawnSync(command, args, { ...options, encoding: 'utf8' });
  fact(!r.error && r.status === 0);
  return r.stdout;
}

// The actual loader, not standalone musl ldd, resolves Node/N-API symbols.
// The pure parser is tested separately; raw maps are never printed or persisted.
function systemVipsMapped(maps) {
  if (typeof maps !== 'string' || maps.length > 8 * 1024 * 1024) return false;
  const paths = [];
  for (const line of maps.trim().split('\n')) {
    const match = /^[0-9a-f]+-[0-9a-f]+ [rwx-]{3}[ps] [0-9a-f]+ [0-9a-f]+:[0-9a-f]+ \d+(?: +(.+))?$/.exec(line.trim());
    if (!match) return false;
    if (match[1]) paths.push(match[1]);
  }
  const vips = paths.filter(name => /(?:^|\/)libvips(?:-cpp)?\.so(?:\.|$)/.test(name));
  return vips.some(name => /^\/usr\/lib\/libvips\.so(?:\.\d+)*$/.test(name))
    && vips.every(name => /^\/usr\/lib\/libvips(?:-cpp)?\.so(?:\.\d+)*$/.test(name))
    && paths.every(name => !name.includes('@img/'));
}

async function main() {
  fact(process.version === 'v24.21.0' && process.arch === 'x64' && process.platform === 'linux');
  process.env.WHATSAPP_DEFAULT_ENGINE = 'NOWEB';
  const profile = require('/app/dist/core/runtime-engine-profile');
  const config = require('/app/dist/config');
  await check('noweb-only-compiled-profile', async () => {
    fact(profile.RESTRICTED_ENGINE_PROFILE === true);
    fact(JSON.stringify(profile.SUPPORTED_ENGINES) === '["NOWEB"]');
    fact(profile.DEFAULT_ENGINE === 'NOWEB');
    delete process.env.WHATSAPP_DEFAULT_ENGINE;
    fact(config.getEngineName() === 'NOWEB');
    for (const engine of ['GOWS', 'WEBJS', 'WPP', 'invalid', 'noweb']) {
      process.env.WHATSAPP_DEFAULT_ENGINE = engine;
      denies(() => config.getEngineName());
      denies(() => profile.requireEngineAvailable(engine));
    }
    process.env.WHATSAPP_DEFAULT_ENGINE = 'NOWEB';
    const { VERSION } = require('/app/dist/version');
    fact(VERSION.engine === 'NOWEB');
    fact(JSON.stringify(VERSION.supportedEngines) === '["NOWEB"]');
    fact(VERSION.browser === null);
    // Canonical factory guards unsupported engines before selecting a session.
    const { SessionManagerCore } = require('/app/dist/core/manager.core');
    const { Socket } = require('node:net');
    const savedConnect = Socket.prototype.connect;
    let transportCalls = 0;
    Socket.prototype.connect = function () { transportCalls++; throw new Error('offline-transport-refused'); };
    try {
      for (const engine of ['GOWS', 'WEBJS', 'WPP', 'unknown']) {
        denies(() => SessionManagerCore.prototype.getEngine.call({}, engine));
      }
      fact(typeof SessionManagerCore.prototype.getEngine.call({}, 'NOWEB') === 'function');
      fact(transportCalls === 0);
    } finally { Socket.prototype.connect = savedConnect; }
    for (const engine of ['GOWS', 'WEBJS', 'WPP', 'unknown']) {
      const refused = spawnSync('/entrypoint.sh', [], { encoding: 'utf8',
        env: { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', WHATSAPP_DEFAULT_ENGINE: engine } });
      fact(refused.status === 64 && refused.stdout === '');
      fact(refused.stderr.trim() === 'Requested engine is not included in this artifact.');
    }
  });
  const sharp = require('/app/node_modules/sharp');
  await check('sharp-source-binding-and-system-vips', async () => {
    fact(sharp.versions.sharp === '0.35.5' && sharp.versions.vips === '8.18.7');
    const loaded = Object.keys(require.cache).find(name => /sharp\/src\/build\/Release\/sharp-linuxmusl-x64-0\.35\.5\.node$/.test(name));
    fact(loaded);
    run('vips', ['--version']);
  });
  await check('jpeg-png-webp-gif-roundtrips', async () => {
    const source = { create: { width: 24, height: 20, channels: 3, background: { r: 30, g: 70, b: 150 } } };
    for (const format of ['jpeg', 'png', 'webp', 'gif']) {
      const encoded = await sharp(source).toFormat(format).toBuffer();
      const info = await sharp(encoded).metadata();
      fact(info.width === 24 && info.height === 20);
      const thumbnail = await sharp(encoded).resize(12, 10).jpeg().toBuffer();
      const thumb = await sharp(thumbnail).metadata();
      fact(thumb.width === 12 && thumb.height === 10 && thumb.format === 'jpeg');
    }
    // After real decoding/resizing/encoding, verify the system library is loaded.
    fact(systemVipsMapped(await fs.readFile('/proc/self/maps', 'utf8')));
  });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'noovicrew-native-'));
  try {
    await check('sqlite3-and-better-sqlite3-bindings', async () => {
      const better = require('/app/node_modules/better-sqlite3');
      const db = new better(':memory:');
      try {
        db.exec('CREATE TABLE synthetic (value INTEGER)');
        db.prepare('INSERT INTO synthetic VALUES (?)').run(37);
        fact(db.prepare('SELECT value FROM synthetic').get().value === 37);
      } finally { db.close(); }
      const sqlite = require('/app/node_modules/sqlite3');
      const classic = await new Promise((resolve, reject) => {
        const connection = new sqlite.Database(':memory:', error => error ? reject(error) : resolve(connection));
      });
      try {
        const row = await new Promise((resolve, reject) => classic.get('SELECT 41 AS value', (error, value) => error ? reject(error) : resolve(value)));
        fact(row.value === 41);
      } finally { await new Promise((resolve, reject) => classic.close(error => error ? reject(error) : resolve())); }
    });
    await check('noweb-sqlite-migrations-reopen', async () => {
      const esm = require('/app/dist/vendor/esm');
      await esm.loadESMModules();
      const { Sqlite3Storage } = require('/app/dist/core/engines/noweb/store/sqlite3/Sqlite3Storage');
      const filename = path.join(directory, 'store.sqlite3');
      const first = new Sqlite3Storage(filename);
      try {
        await first.init();
        await first.getContactsRepository().save({ id: 'synthetic-local', name: 'Synthetic native fixture' });
      } finally { await first.close(); }
      const second = new Sqlite3Storage(filename);
      try {
        await second.init();
        const contact = await second.getContactsRepository().getById('synthetic-local');
        fact(contact && contact.name === 'Synthetic native fixture');
      } finally { await second.close(); }
    });
    await check('actual-waha-voice-and-video-converters', async () => {
      mediaSubstep = 'media-converter-load';
      const { Ffmpeg } = require('/app/dist/core/utils/ffmpeg');
      const logger = Object.fromEntries(['trace', 'debug', 'info', 'warn', 'error'].map(k => [k, () => { vendorEvents++; }]));
      const converter = new Ffmpeg('synthetic-native', logger);
      const mp3 = path.join(directory, 'input.mp3');
      mediaSubstep = 'media-mp3-generate';
      run('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.25', '-c:a', 'libmp3lame', mp3]);
      mediaSubstep = 'media-voice-convert';
      const voice = await converter.voice(await fs.readFile(mp3));
      const voiceFile = path.join(directory, 'output.opus');
      mediaSubstep = 'media-voice-output-write';
      await fs.writeFile(voiceFile, voice);
      mediaSubstep = 'media-voice-probe';
      const voiceInfo = JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', voiceFile]));
      mediaSubstep = 'media-voice-codec-contract';
      fact(voiceInfo.streams[0].codec_name === 'opus' && voiceInfo.streams[0].sample_rate === '48000' && voiceInfo.streams[0].channels === 1);
      mediaSubstep = 'media-voice-tags-read';
      const tags = run('opustags', [voiceFile]);
      mediaSubstep = 'media-voice-vendor-read';
      const vendor = run('opustags', ['--vendor', voiceFile]);
      mediaSubstep = 'media-voice-tags-contract';
      fact(vendor.trim() === 'Recorder' && !/encoder=/i.test(tags));
      const videoFile = path.join(directory, 'input.mp4');
      mediaSubstep = 'media-mp4-generate';
      run('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=34x26:d=0.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', videoFile]);
      mediaSubstep = 'media-video-convert';
      const video = await converter.video(await fs.readFile(videoFile));
      const out = path.join(directory, 'output.mp4');
      mediaSubstep = 'media-video-output-write';
      await fs.writeFile(out, video);
      mediaSubstep = 'media-video-probe';
      const videoInfo = JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', out]));
      mediaSubstep = 'media-video-track-select';
      const track = videoInfo.streams.find(stream => stream.codec_type === 'video');
      mediaSubstep = 'media-video-codec-contract';
      fact(track.codec_name === 'h264' && track.pix_fmt === 'yuv420p' && track.width === 34 && track.height === 26);
      mediaSubstep = null;
    });
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
  await check('runtime-has-no-global-installers', async () => {
    for (const executable of ['npm', 'npx', 'corepack', 'yarn', 'yarnpkg']) {
      const r = spawnSync('sh', ['-c', 'command -v "$1"', 'check', executable], { encoding: 'utf8' });
      fact(r.status === 127 || r.status === 1);
    }
    for (const missing of ['/build-tools', '/root/.abuild', '/app/gows']) {
      let absent = false;
      try { await fs.stat(missing); } catch (error) { absent = error.code === 'ENOENT'; }
      fact(absent);
    }
  });
  return { library_abi_and_local_media_checked: true };
}

main().then(limits => {
  for (const [key, value] of Object.entries(original)) console[key] = value;
  process.stdout.write(JSON.stringify({ format: 'noovicrew-private-waha-native-checks-v1', cases: results,
    vendor_events_redacted: vendorEvents, ...limits, minimum_cpu_approved: false,
    qr_connected: false, provider_homologated: false, security_approved: false, production_approved: false }) + '\n');
}).catch(() => {
  for (const [key, value] of Object.entries(original)) console[key] = value;
  process.stdout.write(JSON.stringify({ format: 'noovicrew-private-waha-native-checks-v1', cases: results,
    vendor_events_redacted: vendorEvents, failed: true, media_failed_step: mediaSubstep, production_approved: false }) + '\n');
  process.exitCode = 1;
});
