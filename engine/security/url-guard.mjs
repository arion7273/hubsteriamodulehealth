import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTNAMES = new Set(['metadata.google.internal', 'metadata']);

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    return false;
  }
  if (ip === '::1') return true;
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true;
  return false;
}

/**
 * @param {string} targetUrl
 * @param {object} opts
 * @param {boolean} opts.localRunnerEnabled
 * @param {string[]} opts.allowedLocalHosts
 * @param {string[]} [opts.authorizedOrigins] — app env base URLs
 */
export async function assertUrlAllowed(targetUrl, opts) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https URLs are allowed');
  }
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new Error('Hostname is not allowed');
  }

  const isLocalHost = opts.allowedLocalHosts?.some((h) => host === h.toLowerCase() || host.endsWith(`.${h}`));
  const addresses = await dns.lookup(host, { all: true });
  for (const { address } of addresses) {
    if (isPrivateIp(address) && !opts.localRunnerEnabled) {
      throw new Error('Local/private targets require localRunnerEnabled in global settings');
    }
    if (isPrivateIp(address) && !isLocalHost) {
      throw new Error('Private network target not in allowedLocalHosts');
    }
  }

  if (opts.authorizedOrigins?.length) {
    const origin = `${parsed.protocol}//${parsed.host}`;
    const allowed = opts.authorizedOrigins.some((o) => {
      try {
        const u = new URL(o);
        return `${u.protocol}//${u.host}` === origin;
      } catch {
        return false;
      }
    });
    if (!allowed && !isLocalHost) {
      throw new Error('URL origin not authorized for this app environment');
    }
  }

  return parsed;
}

export function originFromUrl(url) {
  const u = new URL(url);
  return `${u.protocol}//${u.host}`;
}
