import { MailView } from "@/components/mail/MailView";

export const metadata = { title: "Posteingang · Jarvis" };

export default async function MailPage({ searchParams }: PageProps<"/mail">) {
  const { uid } = await searchParams;
  const n = typeof uid === "string" ? Number(uid) : NaN;
  return <MailView initialUid={Number.isInteger(n) && n > 0 ? n : null} />;
}
