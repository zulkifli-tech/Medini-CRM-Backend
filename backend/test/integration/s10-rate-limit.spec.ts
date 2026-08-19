import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * S10-05 — Rate limiting E2E against the COMPILED app (dist/main.js).
 * The app is spawned as a real OS process (vitest workers cannot boot Nest
 * apps: process.abort() unsupported). Proves the wired AuthThrottlerGuard:
 *   login 5/min/IP → 6th+ = 429, different IP unaffected,
 *   register 3/min/IP → 4th = 429,
 *   /health/live NOT throttled.
 */

const PORT = 3999 + Math.floor(Math.random() * 500);
const APP_IP = '203.0.113.77';
const REG_IP = '203.0.113.78';

function post(path: string, body: unknown, ip: string): Promise<number> {
  return new Promise((r) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port: PORT, path, method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, 'content-length': Buffer.byteLength(data) } }, (res) => { res.resume(); res.on('end', () => r(res.statusCode ?? -1)); });
    req.on('error', () => r(-1));
    req.end(data);
  });
}

function get(path: string): Promise<number> {
  return new Promise((r) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, (res) => { res.resume(); res.on('end', () => r(res.statusCode ?? -1)); }).on('error', () => r(-1));
  });
}

async function waitReady(): Promise<void> {
  for (let i = 0; i < 90; i++) {
    if ((await get('/health/live')) === 200) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('app did not become ready');
}

describe('S10-05 — Rate limiting E2E (compiled app, real HTTP)', () => {
  let proc: ReturnType<typeof spawn> | null = null;
  let stderr = '';

  beforeAll(async () => {
    const distMain = resolve(__dirname, '../../dist/main.js');
    if (!existsSync(distMain)) throw new Error('dist/main.js missing — run `npm run build` first');
    proc = spawn(process.execPath, [distMain], {
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stderr?.on('data', (d) => { stderr += d.toString(); });
    proc.stdout?.on('data', () => undefined);
    await waitReady();
  }, 90_000);

  afterAll(() => { proc?.kill(); });

  it('login: 5 allowed (401 bad creds), 6th+ = 429; other IP unaffected', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push(await post('/api/v1/auth/login', { username: 'nobody', password: 'wrongpass1' }, APP_IP));
    expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(codes[5]).toBe(429);
    expect(codes[6]).toBe(429);
    expect(await post('/api/v1/auth/login', { username: 'nobody', password: 'wrongpass1' }, '198.51.100.9')).toBe(401);
  });

  it('register: 3 allowed (validation/authz errors), 4th = 429', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push(await post('/api/v1/auth/register', { inviteToken: 'x', name: 'x', username: 'x', password: 'wrongpass1' }, REG_IP));
    expect([401, 400, 422, 409, 403]).toContain(codes[0]);
    expect(codes[3]).toBe(429);
  });

  it('non-auth routes are NOT throttled (health 10x rapid calls all 200)', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 10; i++) codes.push(await get('/health/live'));
    expect(codes.filter((c) => c === 200).length).toBe(10);
  });
});
