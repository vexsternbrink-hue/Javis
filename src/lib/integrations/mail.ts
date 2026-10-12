import "server-only";
import { ImapFlow, type FetchMessageObject } from "imapflow";
import { simpleParser } from "mailparser";
import { getMailConfig, type MailConfig } from "./config";
import {
  cleanText,
  displayName,
  formatAddress,
  sanitizeQuery,
  toIso,
  type MailDetail,
  type MailSummary,
} from "./mail-format";

// GMX-Postfach über IMAP – AUSSCHLIESSLICH LESEND.
// Der Posteingang wird schreibgeschützt geöffnet (EXAMINE), daher werden
// Mails beim Lesen auch nicht als gelesen markiert. Versenden, Löschen oder
// Verschieben gibt es bewusst nicht.

export class MailError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = "MailError";
  }
}

const MAX_BODY_CHARS = 8000;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

function requireConfig(): MailConfig {
  const config = getMailConfig();
  if (!config) throw new MailError("Das GMX-Postfach ist noch nicht verbunden (GMX_EMAIL / GMX_PASSWORD fehlen).", 400);
  return config;
}

async function withInbox<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const config = requireConfig();
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  client.on("error", () => {
    // Fehler werden über die Promises unten behandelt.
  });
  try {
    await client.connect();
  } catch (error) {
    const authFailed =
      typeof error === "object" && error !== null && "authenticationFailed" in error && Boolean(error.authenticationFailed);
    throw new MailError(
      authFailed
        ? "GMX hat die Anmeldung abgelehnt. Prüfe GMX_EMAIL/GMX_PASSWORD und ob „POP3/IMAP-Zugriff“ in den GMX-Einstellungen erlaubt ist."
        : "Keine Verbindung zum GMX-Postfach. Bitte später erneut versuchen.",
    );
  }
  try {
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      return await fn(client);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
}

function toSummary(message: FetchMessageObject): MailSummary {
  const envelope = message.envelope;
  return {
    uid: message.uid,
    from: displayName(envelope?.from),
    fromAddress: envelope?.from?.[0]?.address ?? null,
    subject: envelope?.subject?.trim() || "(kein Betreff)",
    date: toIso(envelope?.date ?? message.internalDate),
    unread: !(message.flags?.has("\\Seen") ?? false),
  };
}

async function fetchSummaries(client: ImapFlow, uids: number[]): Promise<MailSummary[]> {
  if (uids.length === 0) return [];
  const result: MailSummary[] = [];
  for await (const message of client.fetch(uids, { uid: true, envelope: true, flags: true, internalDate: true }, { uid: true })) {
    result.push(toSummary(message));
  }
  return result.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

export async function listRecentMails(options: { limit: number; unreadOnly?: boolean }) {
  const limit = Math.min(Math.max(options.limit, 1), 30);
  return withInbox(async (client) => {
    const unreadUids = (await client.search({ seen: false }, { uid: true })) || [];
    let uids: number[];
    if (options.unreadOnly) {
      uids = unreadUids.slice(-limit);
    } else {
      const all = (await client.search({ all: true }, { uid: true })) || [];
      uids = all.slice(-limit);
    }
    return { unreadCount: unreadUids.length, mails: await fetchSummaries(client, uids) };
  });
}

export async function searchMails(query: string, limit = 10) {
  const q = sanitizeQuery(query);
  if (!q) return listRecentMails({ limit });
  return withInbox(async (client) => {
    const uids = (await client.search({ or: [{ subject: q }, { from: q }, { body: q }] }, { uid: true })) || [];
    return { unreadCount: null, mails: await fetchSummaries(client, uids.slice(-Math.min(limit, 30))) };
  });
}

export async function readMail(uid: number): Promise<MailDetail | null> {
  return withInbox(async (client) => {
    const message = await client.fetchOne(
      String(uid),
      { uid: true, envelope: true, flags: true, internalDate: true, source: { maxLength: MAX_SOURCE_BYTES } },
      { uid: true },
    );
    if (!message) return null;
    const summary = toSummary(message);
    let body = "";
    if (message.source) {
      const parsed = await simpleParser(message.source, { skipImageLinks: true, skipTextToHtml: true });
      body = parsed.text || "";
    }
    const { text, truncated } = cleanText(body || "(kein lesbarer Text)", MAX_BODY_CHARS);
    return { ...summary, to: formatAddress(message.envelope?.to), text, truncated };
  });
}
