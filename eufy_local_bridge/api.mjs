import { accountStatus, body, changeGuardMode, fail, json, matches } from '../../http-api.mjs';
import { publicAlarmFailureReason } from '../../adapter.mjs';

export const port = 18787;

export function addonHandler({ token, adapter, login, loginStatus, video, udpDiagnostic, statePollSeconds, poeSnapshotIntervalSeconds }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (req.socket.remoteAddress !== '127.0.0.1' || req.headers.host !== '127.0.0.1:' + port ||
          req.headers.origin !== undefined || req.headers.cookie !== undefined) fail(403, 'Accès local réservé à Home Assistant.');
      const auth = req.headers.authorization ?? '';
      if (!auth.startsWith('Bearer ') || !matches(auth.slice(7), token)) fail(401, 'Clé d’appairage refusée.');
      if (req.method === 'GET') {
        if (req.url === '/api/state' || req.url === '/api/eufy/status') {
          const state = adapter.snapshot();
          const status = await accountStatus(state.auth, loginStatus);
          if (req.url === '/api/eufy/status') return json(res, 200, status);
          return json(res, 200, { ...state, auth: { status: status.status }, udpDiagnostic: udpDiagnostic?.snapshot(),
            statePollSeconds, poeSnapshotIntervalSeconds });
        }
        const camera = /^\/api\/cameras\/([a-zA-Z0-9_-]{1,128})\/live(\?background=1)?$/.exec(req.url);
        if (camera) {
          if (camera[2] && !poeSnapshotIntervalSeconds) fail(403, 'Captures périodiques désactivées.');
          return await video.view(camera[1], res, Boolean(camera[2]));
        }
      }
      if (req.method === 'POST') {
        if (req.url === '/api/diagnostics/udp' && udpDiagnostic) {
          const input = await body(req);
          if (Object.keys(input).length !== 1 || typeof input.stationId !== 'string') fail(400, 'Base requise.');
          udpDiagnostic.start(input.stationId);
          return json(res, 202, { status: 'accepted' });
        }
        if (req.url === '/api/alarm') return await changeGuardMode(adapter, req, res, (await body(req)).mode);
        if (req.url === '/api/eufy/login' || req.url === '/api/eufy/challenge') {
          const input = await body(req);
          if (req.url === '/api/eufy/login') await login(input);
          else await adapter.submitChallenge(input);
          return json(res, 202, { status: 'submitted' });
        }
      }
      fail(404, 'Ressource introuvable.');
    } catch (error) {
      if (res.headersSent || res.destroyed) return res.destroy();
      const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
      // Driver errors may contain account or device details. Keep responses independent of input.
      if (req.method === 'POST' && req.url === '/api/alarm' && (status === 503 || status === 504)) {
        const reason = publicAlarmFailureReason(error.reason);
        if (reason) {
          console.warn('Commande d’alarme : ' + reason);
          return json(res, status, { reason });
        }
      }
      json(res, status, { error: 'Requête non aboutie.' });
    }
  };
}
