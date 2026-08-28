import type { BackendSnapshot } from "@opengbot/protocol";
import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  FolderOpenIcon,
  LogInIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

function humanizeIdentifier(value: string): string {
  const words = value.replaceAll(/[_-]+/g, " ").trim();
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : value;
}

function accessLabel(mode: string): string {
  if (mode === "workspace-write") return "Can edit project files";
  if (mode === "read-only") return "Can read project files";
  if (mode === "danger-full-access") return "Full project access";
  return humanizeIdentifier(mode);
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
      <span className={cn("min-w-0 break-words text-foreground select-text", mono && "font-mono")}>
        {value}
      </span>
    </div>
  );
}

export function ProviderContextMenu({
  snapshot,
  choosingProject,
  integrationBusyId,
  onChooseProject,
  onSelectIntegration,
  onLoginIntegration,
}: {
  snapshot: BackendSnapshot;
  choosingProject: boolean;
  integrationBusyId: string | undefined;
  onChooseProject: () => void;
  onSelectIntegration: (integrationId: string, model: string) => Promise<void>;
  onLoginIntegration: (integrationId: string) => Promise<void>;
}) {
  const project = snapshot.activeProject;
  const integration = snapshot.activeIntegration;
  const contextReady = snapshot.status === "ready" && integration?.availability === "ready";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="app-no-drag max-w-72 text-muted-foreground">
          <span
            className={cn("size-1.5 rounded-full", contextReady ? "bg-success" : "bg-warning")}
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
        <div className="flex flex-col gap-2 px-1.5 py-2 text-xs">
          <ContextDetail
            label="Backend"
            value={`${humanizeIdentifier(snapshot.mode)} · ${humanizeIdentifier(snapshot.status)}`}
          />
          <ContextDetail label="Provider" value={integration?.displayName ?? "Not connected"} />
          <ContextDetail label="Model" value={integration?.model ?? "Not selected"} />
          <ContextDetail
            label="Access"
            value={`${accessLabel(snapshot.sandbox.workspaceAccess)} · Tool network off`}
          />
          {project ? <ContextDetail label="Root" value={project.root} mono /> : null}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Providers on this backend</DropdownMenuLabel>
        <DropdownMenuGroup>
          {snapshot.integrations.map((candidate) => {
            const active = candidate.id === integration?.id;
            const busy = integrationBusyId === candidate.id;
            return (
              <DropdownMenuSub key={candidate.id}>
                <DropdownMenuSubTrigger>
                  {busy || candidate.availability === "authenticating" ? (
                    <Spinner />
                  ) : active ? (
                    <CheckIcon />
                  ) : (
                    <BotIcon />
                  )}
                  <span className="min-w-0 flex-1 truncate">{candidate.displayName}</span>
                  <Badge variant={candidate.availability === "ready" ? "secondary" : "outline"}>
                    {humanizeIdentifier(candidate.availability)}
                  </Badge>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-72">
                  <DropdownMenuLabel>{candidate.statusMessage}</DropdownMenuLabel>
                  <div className="flex flex-col gap-1 px-1.5 pb-2 text-xs text-muted-foreground select-text">
                    <span>Credentials stay with the provider CLI.</span>
                    {candidate.executableVersion ? (
                      <span className="font-mono">{candidate.executableVersion}</span>
                    ) : null}
                  </div>
                  <DropdownMenuGroup>
                    {candidate.models.map((model) => (
                      <DropdownMenuItem
                        key={model}
                        disabled={!project || busy}
                        onSelect={() => void onSelectIntegration(candidate.id, model)}
                      >
                        {active && candidate.model === model ? <CheckIcon /> : <BotIcon />}
                        <span className="truncate">{model}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                  {candidate.availability === "login_required" ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          disabled={busy}
                          onSelect={() => void onLoginIntegration(candidate.id)}
                        >
                          <LogInIcon /> Sign in in browser…
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </>
                  ) : null}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {project ? (
            <DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(project.root)}>
              <CopyIcon /> Copy project path
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={onChooseProject} disabled={choosingProject}>
            <FolderOpenIcon /> {project ? "Change project…" : "Open project…"}
            <DropdownMenuShortcut>⌘O</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
