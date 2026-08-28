import type { BackendSnapshot } from "@opengbot/protocol";
import { localStoragePersistence, useChat } from "@tanstack/ai-react";
import {
  AlertTriangleIcon,
  BotIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CopyIcon,
  FolderIcon,
  FolderOpenIcon,
  MessageSquareIcon,
  PanelLeftIcon,
  RotateCcwIcon,
  SendIcon,
  SquareIcon,
  TerminalSquareIcon,
  XIcon,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePanelRef } from "react-resizable-panels";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { MarkdownContent } from "@/components/ui/markdown-content";
import { Message, MessageContent, MessageHeader } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { DEV_SMOKE_READY_MARKER } from "../dev-smoke";
import { createBackendConnection } from "./backend-connection";

const SIDEBAR_STORAGE_KEY = "opengbot.sidebar.open";
const IS_MAC = navigator.platform.toLowerCase().includes("mac");
const SIDEBAR_COLLAPSED_WIDTH = IS_MAC ? 84 : 56;

type DesktopCommand = "open-project" | "toggle-sidebar" | "focus-composer" | "stop-run";

function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}

export function App() {
  const [snapshot, setSnapshot] = useState<BackendSnapshot>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [choosingProject, setChoosingProject] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => window.localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "false",
  );
  const sidebarPanelRef = usePanelRef();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const stopRunRef = useRef<() => void>(() => undefined);
  const connectInFlightRef = useRef<Promise<void> | undefined>(undefined);

  const connect = useCallback(() => {
    if (connectInFlightRef.current) return connectInFlightRef.current;
    const request = (async () => {
      setLoading(true);
      setError(undefined);
      try {
        let nextSnapshot = await window.opengbot.handshake();
        console.info(`opengbot:dev-smoke:${String(window.opengbot.isDevSmoke())}`);
        console.info("opengbot:handshake-ready");
        if (window.opengbot.isDevSmoke() && !nextSnapshot.activeProject) {
          nextSnapshot = (await window.opengbot.chooseProject()) ?? nextSnapshot;
          console.info("opengbot:project-ready");
        }
        setSnapshot(nextSnapshot);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Backend unavailable");
      } finally {
        setLoading(false);
      }
    })();
    connectInFlightRef.current = request.finally(() => {
      connectInFlightRef.current = undefined;
    });
    return connectInFlightRef.current;
  }, []);

  useEffect(() => {
    void connect();
  }, [connect]);

  const chooseProject = useCallback(async () => {
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
  }, []);

  const changeSidebar = useCallback(
    (open: boolean) => {
      setSidebarOpen(open);
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open));
      if (open) sidebarPanelRef.current?.expand();
      else sidebarPanelRef.current?.collapse();
    },
    [sidebarPanelRef],
  );

  useEffect(() => {
    return window.opengbot.onCommand((command: DesktopCommand) => {
      if (command === "open-project") void chooseProject();
      else if (command === "toggle-sidebar") changeSidebar(!sidebarPanelRef.current?.isCollapsed());
      else if (command === "focus-composer") composerRef.current?.focus();
      else stopRunRef.current();
    });
  }, [changeSidebar, chooseProject, sidebarPanelRef]);

  return (
    <TooltipProvider delayDuration={450}>
      <SidebarProvider open={sidebarOpen} onOpenChange={changeSidebar}>
        <main className="app-chrome h-screen min-h-0 w-full flex-1 overflow-hidden bg-background text-foreground">
          <ResizablePanelGroup orientation="horizontal" className="h-full">
            <ResizablePanel
              id="workspace-sidebar"
              panelRef={sidebarPanelRef}
              defaultSize={sidebarOpen ? 248 : SIDEBAR_COLLAPSED_WIDTH}
              minSize={220}
              maxSize={304}
              collapsible
              collapsedSize={SIDEBAR_COLLAPSED_WIDTH}
              onResize={(size) => {
                const open = size.inPixels > SIDEBAR_COLLAPSED_WIDTH + 4;
                if (open !== sidebarOpen) {
                  setSidebarOpen(open);
                  window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open));
                }
              }}
            >
              <WorkspaceSidebar
                snapshot={snapshot}
                loading={loading}
                collapsed={!sidebarOpen}
                choosingProject={choosingProject}
                onChooseProject={chooseProject}
                onFocusComposer={() => composerRef.current?.focus()}
              />
            </ResizablePanel>
            <ResizableHandle className="z-20" />
            <ResizablePanel id="workspace-main" minSize={560}>
              <div className="flex h-full min-h-0 w-full flex-col">
                <WorkspaceTitlebar
                  snapshot={snapshot}
                  sidebarOpen={sidebarOpen}
                  choosingProject={choosingProject}
                  onToggleSidebar={() => changeSidebar(!sidebarOpen)}
                  onChooseProject={chooseProject}
                />
                <section className="app-content min-h-0 flex-1">
                  {loading ? (
                    <WorkspaceSkeleton />
                  ) : error ? (
                    <ShellError error={error} onRetry={connect} />
                  ) : snapshot?.activeProject &&
                    snapshot.activeSession &&
                    snapshot.activeIntegration ? (
                    <ChatWorkspace
                      key={snapshot.activeSession.id}
                      snapshot={snapshot}
                      composerRef={composerRef}
                      stopRunRef={stopRunRef}
                    />
                  ) : (
                    <ProjectEmptyState
                      choosingProject={choosingProject}
                      onChooseProject={chooseProject}
                    />
                  )}
                </section>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </main>
      </SidebarProvider>
    </TooltipProvider>
  );
}

function WorkspaceSidebar({
  snapshot,
  loading,
  collapsed,
  choosingProject,
  onChooseProject,
  onFocusComposer,
}: {
  snapshot: BackendSnapshot | undefined;
  loading: boolean;
  collapsed: boolean;
  choosingProject: boolean;
  onChooseProject: () => void;
  onFocusComposer: () => void;
}) {
  const backendReady = snapshot?.status === "ready";

  return (
    <Sidebar collapsible="none" className="w-full border-0">
      <SidebarHeader className="app-drag h-13 justify-end border-b px-2 py-0">
        {!IS_MAC || !collapsed ? (
          <div
            className={
              collapsed ? "app-no-drag flex justify-center" : "flex items-center gap-2 pl-20"
            }
          >
            <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <BotIcon className="size-3.5" />
            </div>
            {!collapsed ? <span className="truncate text-sm font-semibold">OpenGBot</span> : null}
          </div>
        ) : null}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {!collapsed ? <SidebarGroupLabel>Project</SidebarGroupLabel> : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {loading ? (
                <SidebarMenuItem className="flex h-9 items-center gap-2 px-2">
                  <Skeleton className="size-4" />
                  {!collapsed ? <Skeleton className="h-3 w-28" /> : null}
                </SidebarMenuItem>
              ) : snapshot?.activeProject ? (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    size="lg"
                    isActive
                    {...(collapsed ? { tooltip: snapshot.activeProject.name } : {})}
                    onClick={onChooseProject}
                    className={collapsed ? "justify-center" : undefined}
                  >
                    <FolderIcon />
                    {!collapsed ? (
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{snapshot.activeProject.name}</span>
                        <span className="truncate text-xs font-normal text-muted-foreground">
                          {snapshot.activeProject.root}
                        </span>
                      </span>
                    ) : null}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    {...(collapsed ? { tooltip: "Open project" } : {})}
                    onClick={onChooseProject}
                    disabled={choosingProject}
                    className={collapsed ? "justify-center" : undefined}
                  >
                    {choosingProject ? <Spinner /> : <FolderOpenIcon />}
                    {!collapsed ? <span>Open project</span> : null}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {snapshot?.activeSession ? (
          <SidebarGroup>
            {!collapsed ? <SidebarGroupLabel>Chat</SidebarGroupLabel> : null}
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    isActive
                    {...(collapsed ? { tooltip: snapshot.activeSession.displayName } : {})}
                    onClick={onFocusComposer}
                    className={collapsed ? "justify-center" : undefined}
                  >
                    <MessageSquareIcon />
                    {!collapsed ? <span>{snapshot.activeSession.displayName}</span> : null}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter className="border-t">
        {snapshot ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={
                  collapsed
                    ? "flex h-8 items-center justify-center"
                    : "flex min-w-0 items-center gap-2 px-2 py-1"
                }
              >
                <span className="relative flex size-4 shrink-0 items-center justify-center">
                  <TerminalSquareIcon className="size-4" />
                  <span
                    className={`absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full ring-2 ring-sidebar ${backendReady ? "bg-success" : "bg-warning"}`}
                  />
                </span>
                {!collapsed ? (
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">
                      {snapshot.mode === "embedded" ? "Local backend" : "Remote backend"}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {snapshot.status.replace("_", " ")}
                    </span>
                  </span>
                ) : null}
              </div>
            </TooltipTrigger>
            {collapsed ? (
              <TooltipContent side="right">
                Backend {snapshot.status.replace("_", " ")}
              </TooltipContent>
            ) : null}
          </Tooltip>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  );
}

function WorkspaceTitlebar({
  snapshot,
  sidebarOpen,
  choosingProject,
  onToggleSidebar,
  onChooseProject,
}: {
  snapshot: BackendSnapshot | undefined;
  sidebarOpen: boolean;
  choosingProject: boolean;
  onToggleSidebar: () => void;
  onChooseProject: () => void;
}) {
  const project = snapshot?.activeProject;
  const integration = snapshot?.activeIntegration;
  const contextReady =
    snapshot?.status === "ready" && (!integration || integration.availability === "ready");

  return (
    <header className="app-drag flex h-13 shrink-0 items-center gap-2 border-b bg-background/95 px-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="app-no-drag"
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <PanelLeftIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}</TooltipContent>
      </Tooltip>

      <div className="min-w-0 flex-1 truncate text-sm font-medium">
        {project ? (
          <>
            <span>{project.name}</span>
            {snapshot.activeSession ? (
              <span className="text-muted-foreground"> / {snapshot.activeSession.displayName}</span>
            ) : null}
          </>
        ) : (
          <span className="text-muted-foreground">OpenGBot</span>
        )}
      </div>

      {snapshot ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="app-no-drag max-w-72 text-muted-foreground"
            >
              <span
                className={`size-1.5 rounded-full ${contextReady ? "bg-success" : "bg-warning"}`}
                aria-hidden="true"
              />
              <span className="truncate">
                {snapshot.mode === "embedded" ? "Local" : "Remote"}
                {integration ? ` · ${integration.displayName}` : ""}
                {integration?.model ? ` · ${integration.model}` : ""}
              </span>
              <ChevronDownIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Execution context</DropdownMenuLabel>
            <div className="space-y-2 px-1.5 py-2 text-xs">
              <ContextDetail label="Backend" value={`${snapshot.mode} · ${snapshot.status}`} />
              <ContextDetail label="Provider" value={integration?.displayName ?? "Not connected"} />
              <ContextDetail label="Model" value={integration?.model ?? "Not selected"} />
              <ContextDetail label="Access" value={`${snapshot.sandbox.codexMode} · network off`} />
              {project ? <ContextDetail label="Root" value={project.root} mono /> : null}
            </div>
            <DropdownMenuSeparator />
            {project ? (
              <DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(project.root)}>
                <CopyIcon /> Copy project path
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={onChooseProject} disabled={choosingProject}>
              <FolderOpenIcon /> {project ? "Change project…" : "Open project…"}
              <DropdownMenuShortcut>⌘O</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </header>
  );
}

function ContextDetail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-2">
      <span className="text-muted-foreground select-none">{label}</span>
      <span
        className={`min-w-0 break-words text-foreground select-text ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function WorkspaceSkeleton() {
  return (
    <div
      className="mx-auto flex h-full w-full max-w-3xl flex-col gap-7 px-8 py-10"
      aria-label="Connecting to backend"
    >
      <div className="space-y-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
      <div className="ml-auto">
        <Skeleton className="h-16 w-72 rounded-xl" />
      </div>
      <div className="mt-auto">
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    </div>
  );
}

function ShellError({ error, onRetry }: { error: string; onRetry: () => Promise<void> }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Alert variant="destructive" className="max-w-xl">
        <AlertTriangleIcon />
        <AlertTitle>Backend connection failed</AlertTitle>
        <AlertDescription className="select-text">{error}</AlertDescription>
        <AlertAction>
          <Button type="button" variant="outline" size="sm" onClick={() => void onRetry()}>
            <RotateCcwIcon /> Retry
          </Button>
        </AlertAction>
      </Alert>
    </div>
  );
}

function ProjectEmptyState({
  choosingProject,
  onChooseProject,
}: {
  choosingProject: boolean;
  onChooseProject: () => void;
}) {
  return (
    <Empty className="h-full rounded-none border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderOpenIcon />
        </EmptyMedia>
        <EmptyTitle>Open a project to begin</EmptyTitle>
        <EmptyDescription>
          The project becomes the explicit working root for this bot and its chat.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" onClick={onChooseProject} disabled={choosingProject}>
          {choosingProject ? <Spinner /> : <FolderOpenIcon />}Choose project folder
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function ChatWorkspace({
  snapshot,
  composerRef,
  stopRunRef,
}: {
  snapshot: BackendSnapshot;
  composerRef: MutableRefObject<HTMLTextAreaElement | null>;
  stopRunRef: MutableRefObject<() => void>;
}) {
  const [input, setInput] = useState("");
  const smokeSent = useRef(false);
  const connection = useMemo(() => createBackendConnection(snapshot), [snapshot]);
  const persistence = useMemo(() => localStoragePersistence(), []);
  const session = snapshot.activeSession!;
  const integration = snapshot.activeIntegration!;
  const { messages, sendMessage, queue, cancelQueued, isLoading, status, error, stop, reload } =
    useChat({
      threadId: session.threadId,
      connection,
      persistence,
      queue: { whenBusy: "queue", drain: "fifo", maxSize: 5, onOverflow: "reject" },
      onFinish(message) {
        if (
          window.opengbot.isDevSmoke() &&
          message.parts.some(
            (part) => part.type === "text" && part.content.includes("OpenGBot smoke response"),
          )
        )
          console.info(DEV_SMOKE_READY_MARKER);
      },
      onError(cause) {
        if (window.opengbot.isDevSmoke()) console.info(`opengbot:chat-error:${cause.message}`);
      },
    });

  useEffect(() => {
    stopRunRef.current = stop;
    return () => {
      stopRunRef.current = () => undefined;
    };
  }, [stop, stopRunRef]);

  useEffect(() => {
    if (!window.opengbot.isDevSmoke() || smokeSent.current) return;
    const timeout = window.setTimeout(() => {
      smokeSent.current = true;
      console.info("opengbot:smoke-send");
      void sendMessage("Run the OpenGBot desktop smoke check.");
    }, 100);
    return () => window.clearTimeout(timeout);
  }, [sendMessage]);

  async function sendCurrentInput(): Promise<void> {
    const content = input.trim();
    if (!content || !snapshot.features.chat || integration.availability !== "ready") return;
    setInput("");
    try {
      await sendMessage(content);
    } catch {
      setInput((current) => current || content);
      composerRef.current?.focus();
    }
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    void sendCurrentInput();
  }
  const runLabel =
    status === "submitted" ? "Starting…" : status === "streaming" ? "Working…" : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {integration.availability !== "ready" ? (
        <Alert variant="destructive" className="m-4 mb-0 w-auto shrink-0">
          <AlertTriangleIcon />
          <AlertTitle>{integration.displayName} is not ready</AlertTitle>
          <AlertDescription>
            {integration.statusMessage ?? "This integration is unavailable."}
          </AlertDescription>
        </Alert>
      ) : null}

      <MessageScrollerProvider>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto w-full max-w-3xl px-6 py-8 sm:px-8">
              {messages.length === 0 ? (
                <Empty className="min-h-full rounded-none border-0 py-16">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <BotIcon />
                    </EmptyMedia>
                    <EmptyTitle>Start this project chat</EmptyTitle>
                    <EmptyDescription>
                      {integration.availability === "ready"
                        ? `Ask ${integration.displayName} to work in ${snapshot.activeProject?.name}.`
                        : integration.statusMessage}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                messages.map((message, index) => (
                  <MessageScrollerItem
                    key={message.id}
                    scrollAnchor={index === messages.length - 1 && message.role === "user"}
                  >
                    <Message align={message.role === "user" ? "end" : "start"}>
                      <MessageContent>
                        <MessageHeader>
                          {message.role === "user"
                            ? "You"
                            : message.role === "system"
                              ? "System"
                              : integration.displayName}
                        </MessageHeader>
                        {message.parts.map((part, partIndex) => (
                          <MessagePart
                            key={`${message.id}:${part.type}:${partIndex}`}
                            part={part as MessagePartValue}
                            role={message.role}
                          />
                        ))}
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                ))
              )}

              {runLabel ? (
                <div
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                  aria-live="polite"
                >
                  <Spinner /> {runLabel}
                </div>
              ) : null}
              {queue.map((queued, index) => (
                <div key={queued.id} className="ml-auto flex max-w-[80%] items-start gap-2">
                  <div className="rounded-xl border border-dashed bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                    <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide select-none">
                      Queued {index + 1}
                    </span>
                    <span className="whitespace-pre-wrap select-text">
                      {typeof queued.content === "string"
                        ? queued.content
                        : "Queued multimodal message"}
                    </span>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => cancelQueued(queued.id)}
                        aria-label="Remove queued message"
                      >
                        <XIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remove from queue</TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      {error ? (
        <Alert
          variant="destructive"
          className="mx-auto mb-3 w-[calc(100%-3rem)] max-w-3xl shrink-0"
        >
          <AlertTriangleIcon />
          <AlertTitle>Run failed</AlertTitle>
          <AlertDescription className="select-text">{error.message}</AlertDescription>
          <AlertAction>
            <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
              <RotateCcwIcon /> Retry
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      <form onSubmit={submit} className="shrink-0 border-t bg-background/95 px-4 py-3 sm:px-6">
        <InputGroup className="mx-auto max-w-[800px] rounded-xl bg-card shadow-sm">
          <InputGroupTextarea
            ref={composerRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={`Message ${integration.displayName}…`}
            aria-label={`Message ${integration.displayName}`}
            disabled={!snapshot.features.chat || integration.availability !== "ready"}
            className="min-h-16 max-h-[220px] py-3 text-[15px] leading-6"
          />
          <InputGroupAddon align="block-end" className="justify-between gap-3">
            <span className="truncate text-xs font-normal">
              {snapshot.sandbox.codexMode} · network off
              {queue.length > 0 ? ` · ${queue.length} queued` : ""}
            </span>
            {isLoading ? (
              <InputGroupButton type="button" variant="outline" size="sm" onClick={stop}>
                <SquareIcon /> Stop
              </InputGroupButton>
            ) : (
              <InputGroupButton
                type="submit"
                variant="default"
                size="sm"
                disabled={
                  !input.trim() || !snapshot.features.chat || integration.availability !== "ready"
                }
              >
                <SendIcon /> Send
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
}

type MessagePartValue =
  | { type: "text" | "thinking"; content: string }
  | { type: "tool-call"; id: string; name: string; arguments: string; state: string }
  | { type: "tool-result"; toolCallId: string; content: string | unknown[]; state: string }
  | { type: string };

function MessagePart({
  part,
  role,
}: {
  part: MessagePartValue;
  role: "user" | "assistant" | "system";
}) {
  if (part.type === "text" && "content" in part)
    return (
      <Bubble
        align={role === "user" ? "end" : "start"}
        variant={role === "user" ? "secondary" : "ghost"}
      >
        <BubbleContent className="select-text">
          <MarkdownContent>{part.content}</MarkdownContent>
        </BubbleContent>
      </Bubble>
    );
  if (part.type === "thinking" && "content" in part)
    return (
      <details className="group/reasoning max-w-full rounded-lg border bg-muted/35 px-3 py-2 text-sm text-muted-foreground">
        <summary className="cursor-default font-medium select-none">Reasoning</summary>
        <div className="mt-2 border-l pl-3 select-text">
          <MarkdownContent>{part.content}</MarkdownContent>
        </div>
      </details>
    );
  if (part.type === "tool-call" && "name" in part)
    return (
      <details className="max-w-full rounded-lg border bg-muted/25 px-3 py-2 text-sm">
        <summary className="flex cursor-default list-none items-center gap-2 select-none">
          <TerminalSquareIcon className="size-4 text-muted-foreground" />
          <span className="font-medium">{part.name}</span>
          <Badge variant="outline" className="ml-auto">
            {part.state}
          </Badge>
        </summary>
        <pre className="mt-2 overflow-x-auto border-t pt-2 font-mono text-xs whitespace-pre-wrap select-text">
          {part.arguments}
        </pre>
      </details>
    );
  if (part.type === "tool-result" && "content" in part) {
    const content =
      typeof part.content === "string" ? part.content : JSON.stringify(part.content, null, 2);
    return (
      <details className="max-w-full rounded-lg border bg-muted/25 px-3 py-2 text-sm">
        <summary className="flex cursor-default list-none items-center gap-2 select-none">
          <CheckCircle2Icon className="size-4 text-success" />
          <span className="font-medium">Tool result</span>
          <Badge variant="outline" className="ml-auto">
            {part.state}
          </Badge>
        </summary>
        <pre className="mt-2 max-h-80 overflow-auto border-t pt-2 font-mono text-xs whitespace-pre-wrap select-text">
          {content}
        </pre>
      </details>
    );
  }
  return null;
}
