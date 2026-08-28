import type { BackendSnapshot } from "@opengbot/protocol";
import { localStoragePersistence, useChat } from "@tanstack/ai-react";
import { AlertTriangleIcon, BotIcon, FolderOpenIcon, SendIcon, SquareIcon } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Message, MessageContent, MessageHeader } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Spinner } from "@/components/ui/spinner";

import { DEV_SMOKE_READY_MARKER } from "../dev-smoke";
import { createBackendConnection } from "./backend-connection";

export function App() {
  const [snapshot, setSnapshot] = useState<BackendSnapshot>();
  const [error, setError] = useState<string>();
  const [choosingProject, setChoosingProject] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let nextSnapshot = await window.opengbot.handshake();
        console.info(`opengbot:dev-smoke:${String(window.opengbot.isDevSmoke())}`);
        console.info("opengbot:handshake-ready");
        if (window.opengbot.isDevSmoke() && !nextSnapshot.activeProject) {
          nextSnapshot = (await window.opengbot.chooseProject()) ?? nextSnapshot;
          console.info("opengbot:project-ready");
        }
        if (!cancelled) setSnapshot(nextSnapshot);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Backend unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function chooseProject(): Promise<void> {
    setChoosingProject(true);
    setError(undefined);
    try {
      const nextSnapshot = await window.opengbot.chooseProject();
      if (nextSnapshot) setSnapshot(nextSnapshot);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The project could not be opened.");
    } finally {
      setChoosingProject(false);
    }
  }

  return (
    <main className="h-screen min-h-0 bg-background text-foreground">
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BotIcon className="size-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold">OpenGBot</h1>
              <p className="truncate text-xs text-muted-foreground">
                Projects first. Models plural.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void chooseProject()}
            disabled={choosingProject}
          >
            {choosingProject ? <Spinner /> : <FolderOpenIcon />}
            {snapshot?.activeProject ? "Change project" : "Open project"}
          </Button>
        </header>

        <ContextBar snapshot={snapshot} />

        <section className="min-h-0 flex-1 p-4">
          {error ? (
            <Alert variant="destructive" className="mx-auto max-w-3xl">
              <AlertTriangleIcon />
              <AlertTitle>OpenGBot could not continue</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : snapshot?.activeProject && snapshot.activeSession && snapshot.activeIntegration ? (
            <ChatWorkspace key={snapshot.activeSession.id} snapshot={snapshot} />
          ) : (
            <Empty className="h-full border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderOpenIcon />
                </EmptyMedia>
                <EmptyTitle>Open a project to start</EmptyTitle>
                <EmptyDescription>
                  Every bot gets an explicit working root. This first trusted-host harness is
                  process scoped; strong read isolation comes with the outer sandbox.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => void chooseProject()} disabled={choosingProject}>
                  {choosingProject ? <Spinner /> : <FolderOpenIcon />}
                  Choose project folder
                </Button>
              </EmptyContent>
            </Empty>
          )}
        </section>
      </div>
    </main>
  );
}

function ContextBar({ snapshot }: { snapshot: BackendSnapshot | undefined }) {
  const items = [
    ["Project", snapshot?.activeProject?.name ?? "None"],
    ["Backend", snapshot ? `${snapshot.mode} · ${snapshot.backendId}` : "Connecting"],
    ["Provider", snapshot?.activeIntegration?.displayName ?? "None"],
    ["Model", snapshot?.activeIntegration?.model ?? "None"],
  ];
  return (
    <div className="grid grid-cols-2 gap-px border-b bg-border lg:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0 bg-background px-4 py-2">
          <p className="text-[11px] text-muted-foreground">{label}</p>
          <p className="truncate text-xs font-medium">{value}</p>
        </div>
      ))}
    </div>
  );
}

function ChatWorkspace({ snapshot }: { snapshot: BackendSnapshot }) {
  const [input, setInput] = useState("");
  const smokeSent = useRef(false);
  const connection = useMemo(() => createBackendConnection(snapshot), [snapshot]);
  const persistence = useMemo(() => localStoragePersistence(), []);
  const session = snapshot.activeSession!;
  const integration = snapshot.activeIntegration!;
  const { messages, sendMessage, isLoading, error, stop } = useChat({
    threadId: session.threadId,
    connection,
    persistence,
    onFinish(message) {
      if (
        window.opengbot.isDevSmoke() &&
        message.parts.some(
          (part) => part.type === "text" && part.content.includes("OpenGBot smoke response"),
        )
      ) {
        console.info(DEV_SMOKE_READY_MARKER);
      }
    },
    onError(cause) {
      if (window.opengbot.isDevSmoke()) console.info(`opengbot:chat-error:${cause.message}`);
    },
  });

  useEffect(() => {
    if (!window.opengbot.isDevSmoke() || smokeSent.current) return;
    const timeout = window.setTimeout(() => {
      smokeSent.current = true;
      console.info("opengbot:smoke-send");
      void sendMessage("Run the OpenGBot desktop smoke check.");
    }, 100);
    return () => window.clearTimeout(timeout);
  }, [sendMessage]);

  function submit(event: FormEvent): void {
    event.preventDefault();
    const content = input.trim();
    if (!content || isLoading || !snapshot.features.chat) return;
    setInput("");
    void sendMessage(content);
  }

  return (
    <Card className="mx-auto flex h-full min-h-0 max-w-5xl flex-col overflow-hidden py-0">
      <CardHeader className="flex-row items-center justify-between border-b py-3">
        <div className="min-w-0">
          <CardTitle className="truncate text-sm">{session.displayName}</CardTitle>
          <p className="truncate text-xs text-muted-foreground">{snapshot.activeProject?.root}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={integration.availability === "ready" ? "secondary" : "destructive"}>
            {integration.credentialMode === "host_cli_login"
              ? "Host login"
              : integration.credentialMode}
          </Badge>
          <Badge variant="outline">Trusted host process</Badge>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-0">
        {integration.availability !== "ready" ? (
          <Alert variant="destructive" className="m-4 w-auto">
            <AlertTriangleIcon />
            <AlertTitle>Codex is not ready</AlertTitle>
            <AlertDescription>{integration.statusMessage}</AlertDescription>
          </Alert>
        ) : null}

        <MessageScrollerProvider>
          <MessageScroller className="min-h-0 flex-1">
            <MessageScrollerViewport>
              <MessageScrollerContent className="mx-auto w-full max-w-3xl p-5">
                {messages.length === 0 ? (
                  <Empty className="min-h-64">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <BotIcon />
                      </EmptyMedia>
                      <EmptyTitle>Ask Codex to work in this project</EmptyTitle>
                      <EmptyDescription>
                        The selected workspace is its working and write root. This trusted-host
                        slice is not strong read containment. Network access is off.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  messages.map((message, index) => (
                    <MessageScrollerItem
                      key={message.id}
                      scrollAnchor={index === messages.length - 1}
                    >
                      <Message align={message.role === "user" ? "end" : "start"}>
                        <MessageContent>
                          <MessageHeader>{message.role === "user" ? "You" : "Codex"}</MessageHeader>
                          {message.parts.map((part, partIndex) => {
                            if (part.type !== "text" && part.type !== "thinking") return null;
                            return (
                              <Bubble
                                key={`${message.id}:${part.type}:${partIndex}`}
                                align={message.role === "user" ? "end" : "start"}
                                variant={
                                  message.role === "user"
                                    ? "default"
                                    : part.type === "thinking"
                                      ? "muted"
                                      : "secondary"
                                }
                              >
                                <BubbleContent className="whitespace-pre-wrap">
                                  {part.content}
                                </BubbleContent>
                              </Bubble>
                            );
                          })}
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  ))
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>

        {error ? (
          <Alert variant="destructive" className="mx-4 w-auto">
            <AlertTriangleIcon />
            <AlertTitle>Codex run failed</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={submit} className="border-t p-4">
          <InputGroup>
            <InputGroupTextarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={`Message ${integration.displayName}…`}
              aria-label={`Message ${integration.displayName}`}
              disabled={!snapshot.features.chat}
              className="min-h-20"
            />
            <InputGroupAddon align="block-end" className="justify-between">
              <span>{snapshot.sandbox.codexMode} · network off</span>
              {isLoading ? (
                <InputGroupButton type="button" variant="outline" onClick={stop}>
                  <SquareIcon /> Stop
                </InputGroupButton>
              ) : (
                <InputGroupButton
                  type="submit"
                  variant="default"
                  disabled={!input.trim() || !snapshot.features.chat}
                >
                  <SendIcon /> Send
                </InputGroupButton>
              )}
            </InputGroupAddon>
          </InputGroup>
        </form>
      </CardContent>
    </Card>
  );
}
