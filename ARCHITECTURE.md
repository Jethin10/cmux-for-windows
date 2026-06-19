# Architecture

## Goal

Build a production-grade Windows-first desktop app for supervising coding-agent terminal sessions. Reliability of terminal lifecycle, transcript persistence, and attention routing comes before generic terminal multiplexer parity.

## Process model

```text
Electron App
├─ Renderer Process
│  ├─ React UI
│  ├─ xterm.js terminal views
│  ├─ dashboard/session list
│  └─ logs/search/notification views
├─ Main Process
│  ├─ window lifecycle
│  ├─ secure preload bridge
│  ├─ native notifications
│  └─ core service host
└─ Core Services
   ├─ WorkspaceService
   ├─ AgentSessionService
   ├─ TerminalService / PTY Broker
   ├─ TemplateService
   ├─ NotificationService
   ├─ TranscriptService
   ├─ SearchService
   ├─ LayoutService
   ├─ EventService
   ├─ SettingsService
   └─ StorageService
```

## State ownership

- **Durable state:** workspaces, agent sessions, terminal metadata, templates, notifications, domain events, transcript chunk metadata, layouts, settings.
- **Runtime state:** PTY handles, process IDs, active streams, renderer subscriptions, backpressure queues, pending resize/write operations.
- **Renderer cache:** selected workspace/session, visible panels, split sizes, search text, terminal viewport state.

Renderer code must request backend confirmation for durable mutations.

## Package boundaries

- `@cmux/shared` owns serializable domain types and small pure utilities.
- `@cmux/ipc` owns IPC channel names and request/response contracts.
- `@cmux/core` owns state machines and service orchestration contracts.
- `@cmux/storage` owns migrations and persistence adapters.
- `@cmux/pty` owns the PTY broker interface and implementation boundary.
- `@cmux/ui` owns shared presentation components with no Electron or Node access.
- `@cmux/desktop` wires Electron main/preload/renderer together.

## Terminal stream policy

Terminal output is not a domain event. Output is streamed hot-path to attached renderers and passed to transcript storage in bounded chunks. Low-volume lifecycle facts are emitted as domain events.

## MVP layout policy

MVP starts with a session dashboard and a single selected terminal view. Complex pane splitting is deferred until the PTY/session model is reliable.
