import { connect, type TLSSocket } from "node:tls";
import { validateUrlSafety } from "@/platform/infra/public-url-safety";

export interface CertificateExpiry { sslExpiresAt: string | null; sslDaysToExpiry: number | null }
const UNKNOWN: CertificateExpiry = { sslExpiresAt: null, sslDaysToExpiry: null };

/** Read only the verified certificate. Pin the socket to the validated public
 * address; preserve the hostname for SNI and certificate verification. */
export async function checkCertificateExpiry(host: string, deps: {
  validate?: typeof validateUrlSafety;
  connect?: typeof connect;
  now?: () => number;
} = {}): Promise<CertificateExpiry> {
  try {
    const url = new URL(`https://${host}/`);
    if (url.hostname !== host || url.port || url.username || url.password) return UNKNOWN;
    return await new Promise<CertificateExpiry>((resolve) => {
      let settled = false;
      let socket: TLSSocket | null = null;
      const finish = (value: CertificateExpiry) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket?.destroy();
        resolve(value);
      };
      const timer = setTimeout(() => finish(UNKNOWN), 8_000);
      // The deadline includes DNS. A lookup completing after timeout must
      // never create a socket or extend the cron's network lifetime.
      Promise.resolve().then(() => (deps.validate ?? validateUrlSafety)(url.toString())).then(({ address }) => {
        if (settled) return;
        socket = (deps.connect ?? connect)({ host: address, port: 443, servername: host, rejectUnauthorized: true });
        socket.once("error", () => finish(UNKNOWN));
        socket.once("close", () => finish(UNKNOWN));
        socket.once("secureConnect", () => {
          try {
            const expiry = Date.parse(socket!.getPeerCertificate().valid_to ?? "");
            const remainingDays = (expiry - (deps.now?.() ?? Date.now())) / 86_400_000;
            finish(socket!.authorized && Number.isFinite(expiry)
              ? { sslExpiresAt: new Date(expiry).toISOString(), sslDaysToExpiry: remainingDays > 0 ? Math.ceil(remainingDays) : Math.floor(remainingDays) }
              : UNKNOWN);
          } catch { finish(UNKNOWN); }
        });
      }).catch(() => finish(UNKNOWN));
    });
  } catch { return UNKNOWN; }
}
