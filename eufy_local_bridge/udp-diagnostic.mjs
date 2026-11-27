import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fail } from '../../http-api.mjs';

const probe = '/usr/local/libexec/eufy-udp-probe';
const stunFields = ['requestsSent', 'requestsReceived', 'successesSent', 'successesReceived', 'errorsSent', 'errorsReceived'];

function idle(stationId) {
  return { stationId, status: 'idle', interfaces: [], startedAt: null, finishedAt: null, reason: null };
}

function counters(rows) {
  if (!Array.isArray(rows) || rows.length > 64) throw Error();
  const names = new Set();
  return rows.map(({ name, sent, received }) => {
    if (typeof name !== 'string' || !/^[^\x00-\x20\x7f/]{1,15}$/u.test(name) || names.has(name) ||
        !Number.isSafeInteger(sent) || sent < 0 || !Number.isSafeInteger(received) || received < 0) throw Error();
    names.add(name);
    return { name, sent, received };
  });
}

export class UdpDiagnostic {
  #adapter;
  #spawn;
  #result;
  #active;
  #closed = false;

  constructor(adapter, spawnProbe = spawn) {
    this.#adapter = adapter;
    this.#spawn = spawnProbe;
    adapter.on('udpTargetChanged', this.#checkTarget);
    adapter.on('iceAttempt', this.#recordIceAttempt);
  }

  #recordIceAttempt = (stationId, reason, attempt) => {
    const run = this.#active;
    if (!run?.readyAt || run.target !== this.#adapter.udpDiagnosticTarget || stationId !== run.target.id) return;
    // The adapter emits sanitized reports from both live events and periodic status polls.
    const { finishedAt } = attempt;
    if (finishedAt < run.readyAt || finishedAt > (run.countersAt ?? new Date().toISOString()) ||
        run.iceAttempts.some(row => row.finishedAt === finishedAt)) return;
    run.iceAttempts.push({ ...attempt, reason });
    run.iceAttempts.sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
    if (run.iceAttempts.length > 4) run.iceAttempts.shift();
  };

  #checkTarget = () => {
    if (this.#active && this.#active.target !== this.#adapter.udpDiagnosticTarget) this.#abort('station_changed');
  };

  snapshot() {
    const target = this.#adapter.udpDiagnosticTarget;
    if (!target) return undefined;
    if (this.#result?.stationId !== target.id) return idle(target.id);
    if (this.#active?.trial) return { ...this.#result, windowsLanTrial: this.#active.trial };
    return this.#result;
  }

  async #testWindowsLan(run) {
    run.trial = { status: 'running' };
    try {
      run.trial = await this.#adapter.testWindowsLanSelection(run.target);
    } catch {
      run.trial = { status: 'error', reason: 'trial_unavailable' };
    }
  }

  start(stationId) {
    if (typeof stationId !== 'string' || !/^T9000[A-Za-z0-9_-]{0,123}$/.test(stationId)) fail(400, 'HomeBase invalide.');
    const target = this.#adapter.udpDiagnosticTarget;
    if (this.#closed || !target) fail(503, 'HomeBase indisponible.');
    if (target.id !== stationId) fail(409, 'La HomeBase sélectionnée a changé.');
    this.#checkTarget();
    if (this.#active) return;
    const startedAt = new Date().toISOString();
    this.#result = { ...idle(stationId), status: 'running', startedAt };
    if (!target.address) {
      this.#result = { ...this.#result, status: 'error', reason: 'address_unavailable', finishedAt: startedAt };
      return;
    }
    let child;
    try {
      child = this.#spawn(probe, [target.address], {
        stdio: ['ignore', 'pipe', 'ignore'], env: {}, timeout: 95_000, killSignal: 'SIGKILL',
      });
    } catch {
      this.#result = { ...this.#result, status: 'error', reason: 'capture_unavailable', finishedAt: startedAt };
      return;
    }
    const run = this.#active = { target, child, iceAttempts: [] };
    let interfaces;
    let stun;
    // The fixed probe emits one readiness line after installing its filter,
    // and one counter report. Publish a report only after a successful exit.
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on('line', line => {
      if (run !== this.#active) return;
      try {
        const message = JSON.parse(line);
        if (!run.readyAt) {
          if (message?.ready !== true) throw Error();
          this.#checkTarget();
          if (run !== this.#active) return;
          run.readyAt = new Date().toISOString();
          void this.#testWindowsLan(run);
        } else {
          if (interfaces) throw Error();
          run.countersAt = new Date().toISOString();
          interfaces = counters(message.interfaces);
          if (message.stun !== undefined) {
            stun = {};
            for (const field of stunFields) {
              const count = message.stun[field];
              if (!Number.isSafeInteger(count) || count < 0) throw Error();
              stun[field] = count;
            }
          }
        }
      } catch { this.#abort('capture_unavailable'); }
    });
    const captureFailed = () => {
      if (run === this.#active) this.#abort('capture_unavailable');
    };
    lines.once('error', captureFailed);
    child.once('error', captureFailed);
    child.once('close', code => {
      lines.close();
      this.#checkTarget();
      if (run !== this.#active) return;
      this.#active = undefined;
      let status = 'error', reason = null;
      if (code !== 0 || !run.readyAt || !interfaces) reason = 'capture_unavailable';
      else {
        const sent = interfaces.some(row => row.sent > 0);
        const received = interfaces.some(row => row.received > 0);
        if (sent) status = received ? 'bidirectional' : 'outbound_only';
        else if (received) status = 'inbound_only';
        else status = 'no_traffic';
      }
      const trial = run.trial?.status === 'running' ? { status: 'inconclusive' } : run.trial;
      this.#result = { ...this.#result, status, interfaces: code === 0 ? (interfaces ?? []) : [],
        ...(trial ? { windowsLanTrial: trial } : {}),
        ...(status !== 'error' ? { iceAttempts: run.iceAttempts } : {}),
        ...(status !== 'error' && stun ? { stun } : {}),
        reason, finishedAt: new Date().toISOString() };
    });
  }

  #abort(reason) {
    const run = this.#active;
    this.#active = undefined;
    this.#result = { ...this.#result, status: 'error', reason, finishedAt: new Date().toISOString() };
    run.child.kill('SIGKILL');
  }

  close() {
    this.#closed = true;
    this.#adapter.off('udpTargetChanged', this.#checkTarget);
    this.#adapter.off('iceAttempt', this.#recordIceAttempt);
    if (this.#active) this.#abort('capture_unavailable');
  }
}
