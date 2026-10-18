import os from 'node:os';
import makeMdns from 'multicast-dns';
import type { FastifyBaseLogger } from 'fastify';

// Built-in mDNS responder for `<hostname>.local` discovery on the LAN.
//
// Why not just rely on the OS mDNS stack (macOS mDNSResponder / avahi):
// users of the Docker release path usually don't have avahi inside the
// container, and asking everyone to set their host's Local Hostname or
// ship an avahi .service file is friction. This responder makes the app
// discoverable at `hoopoe.local` out of the box.
//
// It is intentionally minimal: answers A (and ANY) queries for the
// configured hostname with every non-internal IPv4 the host has, and
// sends a two-shot unsolicited announcement at startup (RFC 6762 §8.3).
// No SRV / PTR / TXT, no service-type browsing — just the hostname.
//
// Coexistence with the OS responder: multicast-dns binds UDP 5353 with
// SO_REUSEADDR (Node dgram default). On Linux that's enough — both
// sockets receive the multicast and both get to reply. On macOS the OS
// mDNSResponder already has 5353 and SO_REUSEADDR alone doesn't help
// (would need SO_REUSEPORT, which Node doesn't expose), so our bind
// fails with EADDRINUSE. We log a warning and no-op: the Mac is already
// answering `<Mac-name>.local` via Bonjour, so the user picks between
// setting their Mac name to "Hoopoe" or running inside a Linux container.

export interface MdnsResponderHandle {
  readonly hostname: string;
  stop(): Promise<void>;
}

export interface MdnsResponderOptions {
  hostname: string; // e.g. 'hoopoe' — '.local' is appended
  logger: FastifyBaseLogger;
}

const TTL_SECONDS = 120;

function localIPv4s(): string[] {
  const out: string[] = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return out;
}

function nameMatches(q: string, want: string): boolean {
  // DNS names are case-insensitive. multicast-dns strips the trailing dot.
  return q.toLowerCase() === want.toLowerCase();
}

export function startMdnsResponder(opts: MdnsResponderOptions): Promise<MdnsResponderHandle> {
  const fqdn = `${opts.hostname}.local`;
  const log = opts.logger.child({ module: 'mdns' });

  return new Promise((resolve) => {
    let mdns: ReturnType<typeof makeMdns>;
    try {
      mdns = makeMdns();
    } catch (err) {
      log.warn({ err }, 'mdns: failed to construct socket — hoopoe.local discovery disabled');
      resolve({ hostname: fqdn, stop: async () => {} });
      return;
    }

    const buildAnswers = () =>
      localIPv4s().map((ip) => ({
        name: fqdn,
        type: 'A' as const,
        ttl: TTL_SECONDS,
        // Cache-flush bit (RFC 6762 §10.2): tells peers to replace any
        // cached A record for this name instead of appending — matters
        // when our IP changes (DHCP renew, LAN hop).
        flush: true,
        data: ip,
      }));

    // Settle: wait for either 'ready' (socket bound) or an 'error' before
    // resolving, so callers get a stable handle. If the socket errors out
    // after that (rare), we log it and the responder goes quiet — not fatal.
    let settled = false;
    const settle = (handle: MdnsResponderHandle) => {
      if (settled) return;
      settled = true;
      resolve(handle);
    };

    mdns.on('error', (err: NodeJS.ErrnoException) => {
      if (!settled) {
        if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
          log.warn(
            { code: err.code },
            'mdns: UDP 5353 unavailable — OS responder (mDNSResponder/avahi) likely already answers *.local; set HOOPOE_MDNS=0 to silence',
          );
        } else {
          log.warn({ err }, 'mdns: socket error at startup — discovery disabled');
        }
        try {
          mdns.destroy();
        } catch {
          /* ignore */
        }
        settle({ hostname: fqdn, stop: async () => {} });
        return;
      }
      log.warn({ err }, 'mdns: runtime socket error');
    });

    mdns.on('warning', (err) => {
      log.debug({ err }, 'mdns: warning');
    });

    mdns.on('query', (query) => {
      // Answer A and ANY queries targeting our hostname. mDNS clients can
      // ask for ANY (type 255) when they want everything about a name.
      // ANY (QTYPE 255) is a valid mDNS question type but @types/dns-packet
      // omits it from `RecordType`, so cast to string for the comparison.
      const match = query.questions?.some((q) => {
        const t = q.type as string;
        return (t === 'A' || t === 'ANY') && nameMatches(q.name, fqdn);
      });
      if (!match) return;
      const answers = buildAnswers();
      if (answers.length === 0) return; // host has no non-loopback IPv4
      mdns.respond({ answers });
    });

    mdns.once('ready', () => {
      const ips = localIPv4s();
      log.info({ hostname: fqdn, ips }, 'mdns: responder ready');
      // Unsolicited announcement so caches populate immediately instead
      // of waiting for the first query. RFC 6762 §8.3 recommends two
      // packets 1s apart.
      const announce = () => {
        const answers = buildAnswers();
        if (answers.length > 0) mdns.respond({ answers });
      };
      announce();
      const second = setTimeout(announce, 1000);
      // Node refuses to exit while a timer is pending; this one is cheap
      // and short-lived, but mark it unref'd just in case tests spin up
      // the responder and then expect the process to drain.
      second.unref?.();

      settle({
        hostname: fqdn,
        stop: () =>
          new Promise<void>((res) => {
            clearTimeout(second);
            // Goodbye packet: TTL=0 tells peers to flush their cache.
            try {
              mdns.respond({
                answers: localIPv4s().map((ip) => ({
                  name: fqdn,
                  type: 'A' as const,
                  ttl: 0,
                  flush: true,
                  data: ip,
                })),
              });
            } catch {
              /* best-effort */
            }
            mdns.destroy(() => res());
          }),
      });
    });
  });
}
