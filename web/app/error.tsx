"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <h1 className="text-lg font-semibold text-ink">Couldn&apos;t load this page</h1>
      <p className="mt-2 text-sm text-ink-2">
        The database or the weather service didn&apos;t respond. If this keeps happening, check DATABASE_URL and the server
        logs.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
