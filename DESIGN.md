# OpenGBot Design Contract

This document is the normative product design reference for OpenGBot. Read it
before changing any user-facing layout, interaction, copy, component, theme, or
desktop window behavior.

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are
requirements. A deliberate exception must be explained in the change and must
not weaken accessibility, security clarity, or platform behavior.

## Product character

OpenGBot is a native-feeling professional workspace, not a website placed in a
desktop window. Its character is:

- **Calm, capable, and direct.** Quiet while idle; expressive when work, risk,
  or recovery needs attention.
- **Project-first and context-explicit.** The user should never wonder which
  project, bot, backend, provider, or model is active.
- **Information-rich, not crowded.** Density comes from hierarchy and spatial
  continuity, not tiny text or endless badges.
- **Neutral-first.** Color communicates selection, focus, status, and brand
  identity; it is not decoration.
- **Fast under pointer and keyboard.** Local feedback is immediate even when
  backend work is not.
- **Candid, not alarming.** Permissions and limitations remain visible without
  flooding routine work with implementation terminology.

The design shorthand is **quiet machine, lively work**. Delight should come from
crisp type, stable geometry, immediate feedback, thoughtful states, and small
moments of polish—not ornamental chrome.

## Product vocabulary

Use these terms consistently in UI, documentation, and code-facing design:

- **Project:** the outer context and capability boundary for a granted root.
- **Bot:** a durable actor/configuration inside a project. A bot owns chats and
  may coordinate child agents.
- **Chat:** a durable conversation with a bot.
- **Run:** one execution initiated from a chat.
- **Child agent:** an attributed participant or child run, never an anonymous
  assistant message.
- **Backend, provider, and model:** execution context, not content hierarchy.

The primary hierarchy is **project → bot → chat → run**. New UI MUST preserve
that hierarchy instead of collapsing the product into one global conversation.

## How to use visual references

Reference images and competitor products are inspiration, not requirements.
Derive principles and interaction patterns; do not copy branding, exact layouts,
or visual novelty.

- Codex contributes integrated chrome, content-first transcripts, restrained
  separators, and contextual inspectors.
- Grok Bot contributes visible actor identity and separation between
  conversation and environment.
- Arc contributes focused onboarding and careful use of soft depth.
- macOS Settings contributes familiar preference navigation and grouped rows.
- T3 Code contributes project/task hierarchy, dense toolbars, and a persistent
  composer.
- Zed contributes durable pane geometry, resizable regions, and keyboard-first
  professional density.

OpenGBot MUST NOT inherit their excessive empty space, permanent panel layouts,
pill overload, branding, or decorative glow. A reference never overrides this
document or the user's request.

## Native application shell

Native feel comes first from window behavior, focus, menus, shortcuts, spatial
memory, and latency—not from rounded corners.

### Window chrome

- macOS SHOULD use Electron's `hiddenInset` title-bar treatment and real traffic
  lights. Never recreate window controls.
- The primary sidebar and titlebar SHOULD form one continuous surface beneath a
  unified toolbar approximately **52 px** high.
- Reserve at least **84 px** at the leading macOS edge for traffic lights.
- Only unused titlebar/toolbar regions may use `-webkit-app-region: drag`.
  Buttons, inputs, menus, selectable content, and navigation MUST be `no-drag`.
- Double-clicking unused titlebar space SHOULD retain the platform-configured
  titlebar behavior, such as zoom or minimize.
- Windows and Linux SHOULD retain their system frame until a complete,
  platform-tested custom treatment exists. Do not ship a macOS imitation.
- Continue using native folder pickers, application menus, keychain facilities,
  notifications, and reveal-in-file-manager actions where applicable.
- Do not use vibrancy or blur by default. Native behavior and geometry matter
  more than unreliable translucency.

### Workspace anatomy

The default wide layout is a continuous pane system:

```text
┌ unified native toolbar ───────────────────────────────────────────┐
│ project / bot / chat                     Local · Codex · 5.6 Sol │
├ project + bot sidebar ─┬ main workspace ──────────┬ inspector? ┤
│ chats and activity     │ transcript / artifact    │ run/context│
│ settings               │ persistent composer      │             │
└────────────────────────┴───────────────────────────┴─────────────┘
```

- Navigation sidebar: **248 px** default; resizable from **220–304 px**.
- Center workspace: flexible, with at least **560 px** usable width.
- Optional inspector: **304 px** default; resizable from **280–380 px**.
- Transcript reading measure: **720–780 px**.
- Composer maximum width: **800 px**.
- Minimum supported window: **960 × 640 px**.
- Baseline visual QA window: **1280 × 800 px**.

At widths below roughly **1180 px**, the inspector SHOULD become a Sheet. The
sidebar MAY collapse to a **56 px** rail when requested or constrained. Collapse
secondary content before compressing primary work. Only one main content pane
should remain at the minimum width.

Pane widths, collapsed state, selected project/chat, scroll position, and drafts
SHOULD persist across launches.

### Context placement

- The sidebar owns project navigation, bots, chats, recent activity, and the
  settings entry.
- The center toolbar owns the active chat/task title and compact breadcrumbs.
- Backend, provider, model, and connection state form one compact execution
  cluster. They MUST remain readable without opening a menu.
- Internal backend IDs, credential enums, and detailed sandbox configuration
  belong in a popover or inspector—not persistent primary chrome.
- A contextual inspector appears only when it has useful content. It MUST NOT
  reserve a blank third of the window.
- The main workspace is a direct pane. It MUST NOT be wrapped in a large floating
  Card inside another canvas.

## Visual system

### Surfaces

Construct hierarchy with alignment, separators, and small tonal steps:

- `background`: primary canvas.
- `card`: deliberately raised or inset bounded objects.
- `muted`: inactive chrome and secondary groups.
- `accent`: hover and selected navigation states.
- `primary`: primary actions and prominent current-context indicators; it is not
  the fill for ordinary selected navigation rows.
- `ring`: keyboard focus indication in the primary color family.
- `input`: structural control boundaries, not hover or selection.
- `border`: structural hairlines.
- `popover`: transient menus and overlays.

Adjacent persistent panes MUST use one-pixel separators, not shadows. Shadows are
reserved for popovers, dialogs, floating composers, and detached overlays.
Never nest more than two visible surface levels.

The unified titlebar/sidebar use the muted chrome surface; the center workspace
uses `background`; the inspector normally uses `background` separated by a
border. Do not alternate pane colors merely to distinguish layout.

Avoid card soup. A card is appropriate for a permission request, connection
setup, file summary, or bounded onboarding object—not every row, message, pane,
or settings section. Gradients and glow MAY appear once in focused onboarding;
they MUST NOT become routine workspace chrome.

### Color

Use semantic shadcn tokens in components; do not use raw Tailwind colors in JSX.
The starting palette has slight cool chroma rather than pure gray:

| Role                  | Light target           | Dark target            |
| --------------------- | ---------------------- | ---------------------- |
| Canvas / `background` | `oklch(.985 .003 255)` | `oklch(.145 .006 255)` |
| Raised / `card`       | `oklch(1 0 0)`         | `oklch(.18 .007 255)`  |
| Muted surface         | `oklch(.965 .005 255)` | `oklch(.215 .008 255)` |
| Hover / selection     | `oklch(.94 .01 255)`   | `oklch(.255 .012 255)` |
| Primary accent        | `oklch(.59 .18 255)`   | `oklch(.70 .16 250)`   |

Exact values may be tuned together during visual QA, but their semantic roles
MUST NOT be changed ad hoc in individual components. Add explicit `success`,
`warning`, and `info` tokens. Primary color is not a generic status color, and
red is reserved for destructive/error states. Status MUST NOT rely on color
alone.

Success owns green, warning owns amber, info owns blue/cyan, and destructive
owns red. Provider colors belong only to provider identity marks.

Follow the operating-system light/dark appearance by default and react to live
changes. Resolve the theme before React mounts so the renderer never flashes the
wrong theme. Dark mode is charcoal, not absolute black; light mode is slightly
off-white, not a white-card field. Keep platform-native scrollbars unless a
demonstrated problem requires otherwise.

### Typography

- Use the platform system UI stack for chrome and prose. Do not name an
  unbundled font such as Inter first.
- Use `ui-monospace` only for code, commands, paths, identifiers, branches,
  timings, token counts, logs, and terminal output.
- Use this scale as the default:

| Usage              | Size / line height | Weight |
| ------------------ | ------------------ | ------ |
| Section/meta label | `11 / 14 px`       | 500    |
| Compact chrome     | `12 / 16 px`       | 500    |
| Standard UI/chrome | `13 / 19 px`       | 400    |
| Descriptive body   | `14 / 21 px`       | 400    |
| Conversation prose | `14 / 22 px`       | 400    |
| Pane title         | `14 / 20 px`       | 600    |
| Major screen title | `16 / 22 px`       | 600    |

Avoid marketing-scale headings inside working screens. Use sentence case.
Uppercase is limited to sparse section labels and MUST NOT be used for buttons
or conversational headings. Muted text must remain legible rather than looking
disabled.

### Spacing, controls, and radii

Use a strict **4 px** base grid. Prefer `4, 8, 12, 16, 24, 32` px spacing.
Arbitrary one-off spacing requires a layout reason.

- Compact control: **28 px** high.
- Standard control: **32 px** high.
- Prominent control: **36 px** high.
- Sidebar row: **32–36 px** high.
- Pane padding: **12–16 px**.
- Conversation turn gap: **20–24 px**.
- Toolbar group gap: **6–8 px**.
- Compact row/control radius: **6 px**.
- Standard control/popover radius: **8 px**.
- Grouped surface radius: **10–12 px**.
- Composer radius: **14–16 px**.

Full circles are for avatars, status indicators, and intentionally circular
actions. Do not give every object the same large radius.

### Icons and imagery

- Lucide is the utility icon family. Do not mix arbitrary icon families or
  stroke weights in one toolbar.
- Use **16 px** icons by default, **14 px** for compact metadata, and **20–24 px**
  for empty states.
- Icon-only controls need an accessible name, a consistent Tooltip, and at least
  a **28 × 28 px** visible hit target; prefer **32 × 32 px**.
- Icons support unfamiliar labels rather than replacing them.
- Provider, product, and actor identity MAY use their own marks. Provider colors
  must not redefine the application shell.

## Component contract

OpenGBot uses the standard **Radix Nova shadcn** foundation.

- Use existing shadcn components and built-in variants before custom markup.
- Use semantic tokens and extend them in the existing global stylesheet. Do not
  paint individual components with raw colors.
- Use `Sidebar`, `Resizable`, `Sheet`, `Tooltip`, `DropdownMenu`, `Command`,
  `Separator`, `Badge`, `Alert`, `Empty`, `Skeleton`, and chat primitives when
  their patterns apply.
- Use `MessageScroller` for transcript scrolling, `Message` for rows, `Bubble`
  for actual message surfaces, `Attachment` for attachments, and `Marker` for
  system/timeline events. Do not hand-roll their behavior.
- Keep generated shadcn components recognizable and composable. Product
  expression belongs in shell composition and semantic tokens, not a bespoke
  incompatible primitive API.
- Use badges sparingly. Ordinary metadata is text; a badge denotes compact state.
- Menus contain secondary/contextual actions. Common primary actions remain
  visible.
- Dialogs are for blocking decisions or short focused flows. Sheets/inspectors
  are for context that benefits from preserving the workspace.
- Use `AlertDialog` only for irreversible or materially destructive actions.
  Name the affected object, state the consequence, and default focus to the safe
  action. Do not confirm harmless or readily reversible operations.
- Settings use conventional sidebar navigation and grouped rows with standard
  controls and consistently aligned values.

## Selection, cursors, and drag regions

Selection is intentional and scoped. Never set `user-select: none` on the whole
document and repair isolated exceptions afterward.

**Non-selectable chrome:** titlebar, toolbar labels, sidebar navigation, tabs,
buttons, badges, menus, status bars, icons, and decorative text.

**Selectable content:** user/assistant messages, exposed thinking, code, diffs,
terminal/log output, tool results, error details, paths, URLs, IDs, commands,
branches, generated artifacts, form values, and any descriptive content a user
may quote.

Paths and IDs SHOULD provide explicit Copy actions. Project paths SHOULD also
offer Reveal in Finder/Explorer. Text selection MUST NOT begin window dragging,
row navigation, or pane manipulation.

Use the text cursor for selectable content and resize cursors for splitters.
Avoid applying a hand cursor to every desktop control; links and library-native
control behavior should remain recognizable.

## Pointer and activation behavior

`pointerdown` is perceived as faster because it happens on press; `click`
commits after release. That is not permission to replace click everywhere.

- Use semantic `click` and form submission for buttons and actions by default.
- Use CSS pressed/active states for immediate feedback.
- Use Pointer Events, not mouse-only events.
- `pointerdown` MAY commit only immediate, reversible, non-destructive actions:
  selecting an already-loaded sidebar row, focusing the composer, or beginning
  drag/resize/reorder behavior.
- A pointerdown selection must accept only the primary button, tolerate movement
  correctly, and have an equivalent keyboard path.
- Use click/release for Send, Stop, Delete, permissions, account connections,
  provider/backend changes, dialogs, external navigation, and configuration.
- Let shadcn/Radix own menu and overlay pointer semantics.
- Never activate on right-click or while a pointer is being dragged.

Allow native input focus and caret placement to occur without a custom handler.
A custom pointerdown handler MUST NOT call `preventDefault` when that would
suppress focus, text selection, drag cancellation, or assistive click behavior.
Pointerdown selection MUST ignore secondary buttons and modifiers, MUST NOT
double-activate again on click, and MUST NOT execute an action nested inside the
selected row.

Pressed state MUST appear immediately. Backend latency must not delay selection
or press feedback.

## Keyboard and focus

Every operation MUST be keyboard accessible. Baseline shortcuts:

| Action              | Shortcut           |
| ------------------- | ------------------ |
| Command palette     | `Cmd/Ctrl+K`       |
| Open/switch project | `Cmd/Ctrl+O`       |
| New chat            | `Cmd/Ctrl+N`       |
| New bot             | `Cmd/Ctrl+Shift+N` |
| Toggle sidebar      | `Cmd/Ctrl+B`       |
| Toggle inspector    | `Cmd/Ctrl+Shift+I` |
| Settings            | `Cmd/Ctrl+,`       |
| Focus composer      | `Cmd/Ctrl+L`       |
| Stop active run     | `Cmd/Ctrl+.`       |
| Send                | `Enter`            |
| Newline in composer | `Shift+Enter`      |

- Application shortcuts MUST appear in the native application menu and command
  palette. Do not intercept operating-system text-editing shortcuts or use
  unmodified letter keys while focus is in an input, textarea, or editable
  surface.
- Escape closes only the topmost transient surface. It MUST NOT unexpectedly
  stop a run.
- Enter MUST NOT send while an IME composition is active.
- Focus rings appear on keyboard navigation using `:focus-visible` and remain
  high contrast.
- Menus/dialogs move focus inside and restore it to their trigger on close.
- Keyboard chat switching keeps focus on the selected navigation row; do not
  steal it into the composer.
- First project opening MAY focus the composer when ready.
- Failed submission preserves/restores the draft and returns focus sensibly.
- Navigable collections use standard roving focus and arrow-key behavior.
- Disabled controls explain why in nearby text; a Tooltip alone is insufficient.
- DOM order and tab order MUST follow visual reading order; positive `tabindex`
  is prohibited.
- Streaming and background completion MUST NOT move focus. If a focused control
  is removed by a panel close or state transition, focus moves to its stable
  trigger or nearest logical control.
- Resizable separators MUST be keyboard operable with an accessible separator
  role and arrow-key adjustment.

## Conversation and run experience

### Transcript

- Assistant responses SHOULD be unboxed content on the canvas.
- User messages MAY use a restrained muted bubble aligned to the trailing edge,
  with a maximum width around **72–78%**.
- Thinking, commands, file edits, tool calls, approvals, diffs, and child-agent
  updates are structured timeline items, not ordinary chat bubbles.
- Tool detail expands in place and retains its position when complete.
- Actor attribution appears when the actor changes or ambiguity exists. Do not
  repeat “You” or a provider name above every consecutive message.
- Markdown, code, files, tool activity, approvals, and errors use purpose-built
  renderers. Plain `whitespace-pre-wrap` text is not the final transcript model.
- Transcript text and generated results MUST remain selectable.

### Scrolling and streaming

- Use `MessageScroller` auto-follow. Follow the live edge until the user scrolls
  away; then stop following and show Jump to latest.
- Anchor the initiating user turn while its response grows.
- Stream content without animating every token or moving stable controls.
- Show a stable run phase within roughly **100 ms**: Starting, Thinking, Running
  command, Waiting for approval, Reconnecting, or an equivalent honest state.
- Delay indeterminate spinners/skeletons for roughly **150–250 ms** to avoid
  flashing on instant work.
- Announce accessibility updates in throttled semantic chunks, never per token.
- Thinking MAY be open while active and SHOULD collapse when complete, with a
  user-controlled disclosure.

### Composer

- The composer is persistent at the bottom of the main pane, either docked or
  slightly raised. It does not belong to the whole window.
- Default minimum height is about **76 px**. It grows to roughly **220 px** and
  then scrolls internally.
- Attachments/context live at the leading edge; provider/model, permission mode,
  and sandbox state use a compact footer or adjacent execution cluster.
- Send changes to Stop in the same location during a run. Controls MUST NOT jump.
- Drafts persist per chat. Switching chats during a run does not cancel it.
- Insert submitted user messages optimistically, but preserve or restore the
  draft if submission fails.
- If messages are queued while busy, render the queue distinctly and allow
  cancellation instead of silently hiding it.

### Errors and recovery

- Run failures appear inline with the affected run and offer Retry, Copy details,
  and a relevant repair action.
- Backend disconnection is shell-level because it affects the whole workspace.
- Provider-login failure offers a direct login/repair action.
- A transient error MUST NOT replace or erase the transcript.
- Preserve completed content and unsent drafts through failures.
- Error details MUST NOT expose secrets.

## Feedback, state, and motion

Every control needs distinct default, hover, pressed, focused, and disabled
states and, when asynchronous, a pending state.

The following values are transition durations, never intentional feedback
delays. Hover and pressed feedback begin in the same rendered frame as the
interaction.

- Hover: **100–120 ms**.
- Press: **60–80 ms**.
- Pane/inspector: **160–200 ms**.
- Dialog/popover: **180–220 ms**.
- Pane resizing has no transition.

Use opacity and surface-color change before scale. Avoid bouncing and springs in
core workflows. Motion communicates spatial or state change; it is not
decoration. Respect `prefers-reduced-motion`.

Skeletons preserve final geometry. Empty states explain what the area is, why it
is empty, and one primary next action. Do not show a spinner where the final
structure is already known.

## Accessibility

OpenGBot targets WCAG 2.2 AA.

- Normal text contrast is at least **4.5:1**; UI boundaries and applicable large
  text meet their contrast thresholds.
- Status never relies on color alone.
- Controls have semantic roles and accessible names.
- Tooltips supplement controls; they never contain the only explanation or path
  to an action.
- Dynamic run state uses appropriate, throttled live regions.
- Browser/Electron text zoom MUST NOT break the shell.
- UI work MUST be tested with keyboard-only navigation, screen-reader semantics,
  reduced motion, system high-contrast/forced-colors modes, **200%** text zoom,
  long names, localization expansion, and minimum window width.

## Copy and tone

Copy is concise, candid, calm, and human:

- Prefer “Runs locally” to an internal backend ID.
- Prefer “Uses your Codex login” to a credential enum.
- Prefer “Can read and modify files in this project” with a Details affordance
  to leading with “trusted host process.”
- Use verbs for actions and nouns for destinations.
- Use an ellipsis only when an action opens a follow-up flow or requires more
  input.
- Security truth remains accessible before access is granted, but architecture
  jargon does not dominate routine chat.

## Known design debt in the first slice

The current vertical slice proves the architecture; it is not the visual
precedent. The next shell iteration should correct these issues:

- The app header is separate from ordinary window chrome and has no drag-region
  policy.
- The slogan and four-cell context strip read like a web dashboard and expose an
  internal backend ID.
- The conversation is a centered Card inside a padded page rather than a direct
  workspace pane.
- Project, bot, and chat navigation is absent, recreating the “one large project”
  problem OpenGBot exists to solve.
- Assistant text, thinking, and user messages receive nearly equal bubble
  treatment; structured tool/agent activity has no visual model.
- Security badges carry too much visual weight while offering no direct detail
  surface.
- Global errors can displace the workspace instead of attaching recovery to the
  affected scope.
- Project paths lack Copy/Reveal actions and deliberate monospace/selectability.
- The composer does not yet define IME safety, queue presentation, or failed-send
  draft recovery.
- Theme startup, system appearance, focus restoration, selection, and keyboard
  behavior are not yet complete.

## UI definition of done

Before merging user-facing work, verify all of the following in the running
Electron application—not only a browser screenshot:

Verification is proportional to the affected surface: changed behavior requires
direct evidence, while unaffected requirements may rely on existing automated
or recorded coverage.

- The active project, backend, provider, and model are identifiable within two
  seconds.
- Project → bot → chat → run hierarchy remains clear.
- The task is completely operable by keyboard with predictable focus.
- Copyable content is selectable; chrome is intentionally non-selectable.
- Pointer press produces immediate feedback, and pointerdown is limited to safe,
  reversible selection/manipulation.
- Loading, streaming, queued, empty, offline, permission, disabled, and failure
  states are deliberately handled.
- The appropriate standard shadcn primitive and semantic tokens are used.
- The layout works at **1280 × 800**, **1440 × 900**, and **960 × 640**.
- Both system light and dark themes are visually checked with no startup flash.
- Reduced motion, text zoom, long project names, and transcript selection work.
- No secret or misleading security claim appears in visible copy or details.
- Visual QA includes at least one screenshot and an interaction pass through the
  actual Electron window.
