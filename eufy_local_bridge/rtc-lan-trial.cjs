'use strict';

const dgram = require('node:dgram');
const { isIPv4 } = require('node:net');

function privateIp(address) {
  return isIPv4(address) && /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(address);
}

function makeSelection(localIp, stationIp) {
  if (!privateIp(localIp) || !privateIp(stationIp)) throw Error('Private LAN route unavailable');
  let localPort, remotePort;

  function select(line, local) {
    if (typeof line !== 'string' || /[\r\n]/.test(line)) return;
    const fields = line.trim().split(/[ \t]+/);
    // SDK trickle accepts a bare foundation; SDP candidate attributes have a prefix.
    if (!/^(?:(?:a=)?candidate:[^:\s]+|[A-Za-z0-9+/]{1,32})$/i.test(fields[0]) ||
        fields[1] !== '1' || fields[2]?.toLowerCase() !== 'udp' || !/^\d+$/.test(fields[3]) ||
        fields[4] !== (local ? localIp : stationIp) || !/^\d{1,5}$/.test(fields[5]) ||
        fields[6] !== 'typ' || fields[7] !== 'host') return;
    const port = Number(fields[5]);
    if (port < 1 || port > 65535) return;
    if (local) localPort ??= port;
    else remotePort ??= port;
    // Keep only the selected host's mandatory fields, like the Windows LAN bridge.
    if (port === (local ? localPort : remotePort)) return fields.slice(0, 8).join(' ');
  }

  function filterSdp(sdp, local) {
    return sdp.replace(/^[ \t]*a=candidate:[^\r\n]*(\r\n|\r|\n|$)/gim, (line, end) => {
      const kept = select(line.trim(), local);
      return kept === undefined ? '' : kept + end;
    });
  }

  function matches(endpoint, ip, port) {
    return port !== undefined && typeof endpoint?.transportType === 'string' && endpoint.transportType.toLowerCase() === 'udp' &&
      endpoint.address === ip && endpoint.port === port;
  }

  return {
    bind: localIp,
    local: candidate => select(candidate, true),
    remote: candidate => select(candidate, false),
    localSdp: sdp => filterSdp(sdp, true),
    remoteSdp: sdp => filterSdp(sdp, false),
    matchesPair: pair => matches(pair?.local, localIp, localPort) && matches(pair?.remote, stationIp, remotePort),
    reset() { localPort = remotePort = undefined; },
  };
}

async function openLanTrial(stationIp, signal) {
  if (!privateIp(stationIp)) throw Error('Private station IPv4 required');
  const timeout = AbortSignal.timeout(3000);
  const deadline = signal ? AbortSignal.any([signal, timeout]) : timeout;
  deadline.throwIfAborted();
  const socket = dgram.createSocket('udp4');
  let onAbort;
  try {
    socket.unref();
    // UDP connect asks the kernel to select its source IPv4. No datagram is written.
    await new Promise((resolve, reject) => {
      onAbort = () => reject(deadline.reason);
      deadline.addEventListener('abort', onAbort, { once: true });
      socket.on('error', reject);
      socket.once('connect', resolve);
      socket.connect(9, stationIp);
    });
    deadline.throwIfAborted();
    return makeSelection(socket.address().address, stationIp);
  } finally {
    if (onAbort) deadline.removeEventListener('abort', onAbort);
    try { socket.close(); } catch { /* A failed bind can leave the socket closed. */ }
  }
}

module.exports = { makeSelection, openLanTrial };
