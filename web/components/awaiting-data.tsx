import { RadioTower } from "lucide-react";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { Card, CardHeader, PageHeader } from "./ui";

/** Shown until any node has uploaded: the exact settings the Pi needs to start sending. */
export async function AwaitingData({ title }: { title: string }) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.|10\.|192\.168\.)/.test(host);
  const proto = h.get("x-forwarded-proto")?.split(",")[0] ?? (local ? "http" : "https");
  const ingestUrl = `${proto}://${host}/api/ingest`;

  return (
    <div className="space-y-6">
      <PageHeader title={title} description="No sensor node has reported yet." />
      <Card className="max-w-3xl">
        <CardHeader
          icon={RadioTower}
          title="Waiting for the first upload"
          description="Everything fills in as soon as a node posts its first batch."
        />
        <ol className="space-y-5 px-5 pt-5 pb-6 text-sm text-ink-2">
          <Step n={1} title="Point the uploader at this site">
            On the Pi, set these in <Code>/etc/sensor/uploader.env</Code>:
            <Pre>{`INGEST_URL=${ingestUrl}\nINGEST_TOKEN=<the INGEST_TOKEN configured on this server>\nDEVICE_ID=marine-node-01`}</Pre>
          </Step>
          <Step n={2} title="Restart the uploader">
            <Pre>sudo systemctl restart sensor-uploader</Pre>
          </Step>
          <Step n={3} title="Watch it arrive">
            The node uploads every 30 s, so the first readings show up here within a minute.
          </Step>
        </ol>
        <p className="border-t border-border px-5 py-4 text-sm text-ink-2">
          No hardware handy? From the <Code>web</Code> folder, <Code>npm run simulate</Code> streams readings from a
          simulated node to a local dev server (add <Code>{`-- --url ${ingestUrl} --token <token>`}</Code> to target this
          site).
        </p>
      </Card>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-ink">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{title}</p>
        <div className="mt-1">{children}</div>
      </div>
    </li>
  );
}

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.8125rem] text-ink">{children}</code>
);

const Pre = ({ children }: { children: ReactNode }) => (
  <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2 px-3.5 py-3 font-mono text-[0.8125rem] leading-relaxed text-ink">
    {children}
  </pre>
);
