import type { BackendSnapshot } from "@opengbot/protocol";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { DEV_SMOKE_READY_MARKER } from "../dev-smoke";

export function App() {
  const [snapshot, setSnapshot] = useState<BackendSnapshot>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;

    window.opengbot
      .handshake()
      .then((nextSnapshot) => {
        if (!cancelled) {
          setSnapshot(nextSnapshot);
          console.info(DEV_SMOKE_READY_MARKER);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Backend unavailable");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-8 py-10">
        <header className="flex items-center justify-between gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Desktop control plane</p>
            <h1 className="text-2xl font-semibold tracking-tight">OpenGBot</h1>
          </div>
          <Badge variant={snapshot ? "secondary" : "outline"}>
            {snapshot ? `${snapshot.mode} · ${snapshot.backendId}` : "Connecting…"}
          </Badge>
        </header>

        <Card className="mx-auto my-auto w-full max-w-3xl">
          <CardHeader>
            <CardTitle>Projects first. Models plural.</CardTitle>
            <CardDescription>
              Keep every bot scoped to an explicit project while Codex, Grok, and future providers
              stay visible and interchangeable.
            </CardDescription>
            <CardAction>
              <Badge variant={error ? "destructive" : "outline"}>
                {error ? "Connection failed" : snapshot ? "Backend ready" : "Starting backend"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              <Status label="Project" value={snapshot?.activeProject?.name ?? "Not selected"} />
              <Status label="Backend" value={snapshot?.backendId ?? "Connecting"} />
              <Status
                label="Provider"
                value={snapshot?.activeIntegration?.displayName ?? "Not configured"}
              />
              <Status label="Model" value={snapshot?.activeIntegration?.model ?? "Not selected"} />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button variant="outline" disabled>
              Connect provider
            </Button>
            <Button disabled>New project</Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="truncate">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
