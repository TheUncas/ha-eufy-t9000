import { spawn } from 'node:child_process';

export class Video {
  constructor(adapter, cameraStreams, executable = 'ffmpeg', firstFrameTimeoutMs = 30_000) {
    this.adapter = adapter;
    this.local = new Map(cameraStreams.map(camera => [camera.id, camera]));
    this.executable = executable;
    this.firstFrameTimeoutMs = firstFrameTimeoutMs;
    this.streams = new Map();
    this.waitingForeground = 0;
    adapter.on('video', (id, chunk) => {
      const stream = this.streams.get(id);
      if (!stream || stream.local || stream.ending || !stream.process.stdin.writable) return;
      if (stream.process.stdin.writableLength > 4 * 1024 * 1024) {
        this.finish(stream, 'Le décodage vidéo ne suit plus le flux.');
      } else {
        stream.process.stdin.write(chunk);
      }
    });
    adapter.on('videoEnd', id => {
      const stream = this.streams.get(id);
      if (stream && !stream.local) this.finish(stream, 'Le connecteur a fermé le direct.');
    });
  }

  async view(id, res, background = false) {
    if (this.closed) throw Object.assign(new Error('Arrêt de la passerelle.'), { status: 503 });
    const local = this.local.get(id);
    if (!local || background) {
      const state = this.adapter.snapshot();
      const camera = state.devices.find(d => d.id === id && d.kind === 'camera' && d.live);
      if (!camera || (background && camera.power !== 'poe'))
        throw Object.assign(new Error('Direct indisponible pour cette caméra.'), { status: 404 });
      if (background && state.station?.online !== true)
        throw Object.assign(new Error('HomeBase indisponible.'), { status: 503 });
    }
    let stream = this.streams.get(id);
    const occupied = !local && [...this.streams.values()].find(s => !s.local && (s !== stream || s.ending));
    if ((background && this.waitingForeground) || (occupied?.foregroundViewers && (background || !occupied.ending)))
      throw Object.assign(new Error('Un direct est déjà utilisé sur la base.'), { status: 409 });
    if (occupied) {
      // Reserve the next slot for a live viewer even if a scheduled capture started waiting first.
      if (!background) this.waitingForeground++;
      try {
        await this.finish(occupied, 'Capture terminée pour libérer le direct.');
        if (!res.destroyed && !res.writableEnded) return this.view(id, res, background);
        return;
      } finally {
        if (!background) this.waitingForeground--;
      }
    }
    if (!stream) {
      const input = local
        ? ['-rtsp_transport', 'tcp', '-protocol_whitelist', 'rtsp,tcp,rtp', '-i', local.url]
        : ['-protocol_whitelist', 'pipe', '-i', 'pipe:0'];
      const process = spawn(this.executable, ['-hide_banner', '-loglevel', 'error', '-nostdin',
        '-probesize', '131072', '-analyzeduration', '500000', ...input,
        '-map', '0:v:0', '-an', '-vf', 'fps=6', '-c:v', 'mjpeg', '-q:v', '5',
        '-f', 'mpjpeg', '-boundary_tag', 'eufyframe', '-flush_packets', '1', 'pipe:1'],
      { stdio: [local ? 'ignore' : 'pipe', 'pipe', 'ignore'], windowsHide: true });
      stream = { id, local, process, viewers: new Set(), foregroundViewers: 0, ending: false, controller: new AbortController() };
      this.streams.set(id, stream);
      const timeout = () => this.finish(stream, 'Aucune image reçue de la caméra dans le délai imparti.');
      const reconnecting = !local && this.adapter.snapshot().station?.online === false;
      const startMs = reconnecting ? 75_000 : this.firstFrameTimeoutMs;
      stream.timeout = setTimeout(timeout, startMs);
      if (!reconnecting && startMs !== 30_000) {
        process.stdout.once('data', () => {
          clearTimeout(stream.timeout);
          if (!stream.ending) stream.timeout = setTimeout(timeout, 30_000);
        });
      }
      process.on('error', () => this.finish(stream, 'FFmpeg est indisponible sur la passerelle.'));
      process.on('exit', () => this.finish(stream, 'La caméra ou le décodeur a fermé le flux.'));
      process.stdin?.on('error', () => this.finish(stream, 'Le décodeur vidéo a fermé le flux.'));
      process.stdout.on('data', chunk => {
        if (stream.ending) return;
        stream.timeout.refresh();
        for (const viewer of stream.viewers) {
          if (viewer.writableLength > 2 * 1024 * 1024) { viewer.destroy(); continue; }
          if (!viewer.headersSent) viewer.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace; boundary=eufyframe' });
          viewer.write(chunk);
        }
      });
      if (!local) {
        stream.start = Promise.resolve().then(() => this.adapter.startLive(id, stream.controller.signal));
        stream.start.catch(() => this.finish(stream, 'Le connecteur a refusé le direct.'));
      }
    }
    if (stream.ending) throw Object.assign(new Error('Le direct précédent se ferme.'), { status: 409 });
    stream.viewers.add(res);
    if (!background) stream.foregroundViewers++;
    res.once('close', () => {
      stream.viewers.delete(res);
      // Preserve the last viewer's priority until the SDK finishes releasing this camera.
      if (!stream.viewers.size) this.finish(stream, 'Direct fermé.');
      else if (!background && !stream.ending) stream.foregroundViewers--;
    });
  }

  finish(stream, message) {
    if (stream.ending) return stream.stopped;
    stream.ending = true;
    stream.controller.abort();
    clearTimeout(stream.timeout);
    stream.process.stdin?.destroy();
    stream.process.kill();
    for (const res of stream.viewers) {
      if (!res.headersSent) {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: message }));
      } else res.end();
    }
    const remove = () => this.streams.delete(stream.id);
    if (stream.start) {
      stream.stopped = stream.start.then(() => this.adapter.stopLive(stream.id)).catch(() => {}).finally(remove);
    } else remove();
    return stream.stopped;
  }

  close() {
    this.closed = true;
    for (const stream of this.streams.values()) this.finish(stream, 'Arrêt de la passerelle.');
  }
}
