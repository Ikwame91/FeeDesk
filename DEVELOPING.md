# FeeDesk — Development Guide

This guide is for development-mode agents editing this app's source code. For app operations and tools, see AGENTS.md.
Current product status is [`docs/STATUS.md`](docs/STATUS.md). Visual rules are [`DESIGN.md`](DESIGN.md) (Banknote).

The sections below the FeeDesk map still describe Agent-Native mechanics inherited from the Chat template.
Where they say the app's home is a full-page chat at `/`, that is the template. FeeDesk's signed-in home is `/dashboard`.

## Tech Stack

- **Framework:** @agent-native/core 0.223.0 + React Router v8 (framework mode)
- **Frontend:** React 19, Vite, Tailwind CSS 4. Banknote theme in `app/global.css` (Bodoni Moda + Public Sans)
- **Routing:** File-based via `flatRoutes()` — SSR shell + client rendering
- **Backend:** Nitro (via @agent-native/core) — file-based API routing, server plugins
- **Data:** Drizzle on PGlite locally (`./data/pglite`), Postgres when `DATABASE_URL` is a Postgres URL
- **Hosted:** https://feedesk-gh.netlify.app from branch `scaffold-app`, Neon Postgres. Steps in `docs/DEPLOY.md`

## Commands

- **Dev:** `pnpm dev` → http://localhost:8080
- **Build:** `pnpm build`
- **Start:** `node .output/server/index.mjs` (production)
- **Checks:** `pnpm test`, `pnpm typecheck`, `pnpm agent-native:doctor`
- **Demo:** `pnpm demo:load` resets local fictional data. `pnpm demo:check` runs the match with no AI

## Directory Structure

```
app/routes/dashboard.tsx   # /dashboard  Overview (signed-in home)
app/routes/flags.tsx       # /flags      To review
app/routes/capture.tsx     # /capture    Photo or typed receipt rows
app/routes/school.tsx      # /school     Name, term, MoMo number
app/routes/chat.*          # /chat       Full-page chat
app/lib/explain-flag.ts    # Flag sentences (uploaded evidence only)
server/lib/                # money, importers, matching, reconcile, capture
server/plugins/db.ts       # Three named migrations (see below)
actions/                   # One file = UI hook + agent tool + HTTP + CLI
seed/                      # Fictional demo data and answer-key.json
docs/STATUS.md             # What is done
```

Migrations in `server/plugins/db.ts`, applied in order, never edited once they have run:

1. `feedesk-core-tables` — students, receipts, money_lines, matches, flags
2. `feedesk-proposed-matches` — `proposed` match state and `flags.match_id`
3. `feedesk-photo-capture` — `capture_batches`, `capture_rows`

## Framework Basics

**SSR-first framework, CSR-by-default content:** This app uses React Router v8 framework mode with `ssr: true`. But virtually every route renders only an SSR shell (loading spinner + meta tags). Normal app data fetching happens on the client via action hooks. Server-side data fetching is the exception — only used for public pages that need SEO/OG tags.

## Chat beside the work

FeeDesk's signed-in landing is Overview (`/dashboard`), set as `app.homePath` in
`server/plugins/agent-native-email-branding.ts`. `/` is the shared sign-in page.
Chat also lives in the right-hand panel on Overview, Flags, Capture, and School, and full-page at `/chat`.
The same actions serve a click, the panel, and a confirmed photo row.

The paragraphs under this heading are the Chat template's AgentKit notes. They still describe how the
composer and transport work. They do not describe FeeDesk's primary screen.

Agent-Native is the application framework and execution platform. AgentKit is
its agent interaction and experience layer. Toolkit supplies the semantic
composer, design-system primitives, and workspace UI used around the
conversation.

The `/` route is the app's primary AgentKit surface. Its default integration is:

- `createAgentNativeAgentKitTransport()` from
  `@agent-native/toolkit/app/chat/agentkit-chat` for the production Agent-Native
  runtime.
- `CoreAgentKitRoot` from `@agent-native/toolkit/app/chat/agentkit-chat` for one
  managed controller, thread context, and the default action-widget renderer.
- `AgentKitChat` for the reference transcript, composer, queue, approvals,
  activities, and suggestions.
- `CoreComposerRuntimeProvider` for Agent-Native composer capabilities.

The surrounding Core app shell owns the full-height canvas, global navigation,
durable thread routing, and route-level chrome. `AgentKitChat` owns the
conversation column. Pass route controls through its `toolbar` prop. Use
`slots` and `registry` on `AgentKitRoot` for presentation overrides without
forking conversation state.

Action UI is opt-in on each action through `chatUI.renderer`. `CoreAgentKitRoot`
provides Core's `AgentKitActionWidget` in `slots.widget`; it resolves the
declared React renderer from the stored tool input and result, then keeps the
widget with its assistant message after activity rollup and thread reload. App
renderers can register with `registerActionChatRenderer()` from
`@agent-native/toolkit/app/chat/agentkit-chat` using the same renderer id declared by
the action. Built-in Core renderers need no app registration.

This template is also the canonical AgentKit reference surface. Develop and
verify shared chat UX here first, then use domain apps such as Dispatch as
consumer smoke tests. Queue behavior can be exercised by submitting follow-ups
while a run is active. The shared composer remains mounted throughout these
states. The route does not provide fallback suggestions: contextual next
actions appear only when the agent injects them through AgentKit's structured
`suggestions` input.

For a headless app that later needs UI, this template is the intended landing
zone: bring the existing actions over, keep their names stable, and let the chat
call them before adding extra screens. For a custom agent backend, keep the app
shell and implement `AgentTransport`, or adapt an existing Core
`AgentChatRuntime` with `createAgentKitProtocolAdapter()` from
`@agent-native/core/client/agent-chat`.

### Package and scaffold path

The Chat template depends on `@agent-native/core`,
`@agent-native/agentkit`, and `@agent-native/toolkit` through workspace
specifiers in this repository. The CLI resolves them for the generated shape:

- A normal standalone scaffold receives published package ranges.
- A local framework-development scaffold packages the local Core, AgentKit,
  and Toolkit implementations. Missing compiled package exports are built
  before the tarballs are created.
- A workspacified Chat app inherits a concrete package version already pinned
  by the workspace root. Otherwise it uses the compatible range supplied by
  the running CLI.

Do not replace these dependencies with direct `dist` paths or deep source
imports. Install the generated manifest as written.

### Migrate an older Core chat surface

Core's `AssistantChat` remains supported as the AgentKit-backed surface, as do
`AgentPanel`, `AgentSidebar`, `AgentChatSurface`, `AgentChatHome`, and
`MultiTabAssistantChat`. Apps that only mount these components do not need to
replace their chat UI.

If your app used the removed `AssistantChat.createAdapter`, adapter helpers, or
assistant-ui transcript/runtime APIs, follow the version-matched guide at
`node_modules/@agent-native/core/docs/migrations/agentkit-chat.md`. It maps each
removed API to `runtime`, `createTransport`, AgentKit slots, or a custom
`AgentTransport`. Keep one conversation controller and stream owner.

Widgets invoke stable action ids through the transport. Map them to the same
`defineAction` surface used by the app and agent. Smart objects and client
effects request host navigation or context changes. They do not bypass action
validation, application-state helpers, request context, or ownable-data access
checks.

## Adding a Page

Create a file in `app/routes/`. The filename determines the URL path:

```
app/routes/_index.tsx              → /
app/routes/settings.tsx            → /settings
app/routes/inbox.tsx               → /inbox
app/routes/inbox.$threadId.tsx     → /inbox/:threadId
app/routes/$id.tsx                 → /:id (dynamic param)
```

Each route file exports a default component, optional `meta()`, and optional `HydrateFallback()`:

```tsx
import MyPage from "@/pages/MyPage";

export function meta() {
  return [{ title: "My Page" }];
}

export function HydrateFallback() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
    </div>
  );
}

export default function MyPageRoute() {
  return <MyPage />;
}
```

**Do NOT fetch data server-side** in route loaders unless the page genuinely needs SEO/OG content. The standard pattern is: SSR renders the shell, client hydrates, and React reads/writes normal app data through actions with `useActionQuery` / `useActionMutation`.

## Adding App Data

Normal app data starts as an action, not a custom route. Add `actions/<verb>-<resource>.ts` with `defineAction`, mark reads with `http: { method: "GET" }`, and call reads/writes from React with `useActionQuery` / `useActionMutation` from `@agent-native/core/client`. This keeps the UI and agent on one contract and lets mutating actions refresh action-backed queries automatically.

## Adding a Route-Only Endpoint

Use `server/routes/api/` only for protocols that cannot be modeled as JSON actions: multipart uploads, streaming/SSE/WebSocket, webhooks, OAuth callbacks/redirects, public SEO/OG endpoints, or binary/static asset serving. Do not add `/api/*` routes for normal CRUD, data queries, or pass-through wrappers around actions; the action endpoint already exists at `/_agent-native/actions/:name`.

Each route-only endpoint still exports a default `defineEventHandler`, but keep shared app logic in actions or server libraries so agent and UI behavior do not fork.

## Adding a Server Plugin

Startup logic (auth, SSE, etc.) lives in `server/plugins/`. Use `defineNitroPlugin` from core:

```ts
import { defineNitroPlugin } from "@agent-native/core";

export default defineNitroPlugin(async (nitroApp) => {
  // Runs once at server startup
});
```

## Key Imports from `@agent-native/core`

| Import                                       | Purpose                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| `defineNitroPlugin`                          | Define a server plugin (re-exported from Nitro)                            |
| `createDefaultSSEHandler`                    | Create SSE endpoint for DB change events (server)                          |
| `readAppState`, `writeAppState`              | Read/write application state (from `@agent-native/core/application-state`) |
| `readSetting`, `writeSetting`                | Read/write settings (from `@agent-native/core/settings`)                   |
| `defineEventHandler`, `readBody`, `getQuery` | H3 route handler utilities (re-exported)                                   |
| `sendToAgentChat`                            | Send messages to agent from UI (client-side)                               |
| `agentChat`                                  | Send messages to agent from scripts (server-side)                          |

## Adding an Action

Create `actions/<verb>-<resource>.ts` with `defineAction`. Run with `pnpm action <name> --id value`; React callers should use `useActionQuery` for GET actions and `useActionMutation` for mutating actions, not a matching `/api/*` wrapper.

**Sending to agent chat from UI:**

```ts
import { sendToAgentChat } from "@agent-native/core/client";
sendToAgentChat({
  message: "Generate something",
  context: "...",
  submit: true,
});
```

**Sending to agent chat from scripts:**

```ts
import { agentChat } from "@agent-native/core";
agentChat.submit("Generate something");
```

## Database & Environment Variables

Local development uses PGlite at `data/pglite`. For production and shared environments, set `DATABASE_URL` to a persistent hosted PostgreSQL database.

Real credential values belong only in local `.env` files, deployment configuration, or registered secrets/settings UI. Never commit, document, log, return, paste, or include real keys, tokens, webhook URLs, signing secrets, or private data in examples; use empty values or obvious placeholders.

When adding app data, define tables with Drizzle's `drizzle-orm/pg-core`
exports and use Drizzle's query builder for reads/writes. Import framework
sharing helpers such as `ownableColumns()` and `createSharesTable()` from
`@agent-native/core/db/schema`. Keep SQL PostgreSQL-compatible and reserve raw
SQL for additive migrations, health checks, or carefully scoped maintenance.

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Production yes, local dev no | Postgres URL when hosted. Local default is PGlite at `./data/pglite` |
| `BETTER_AUTH_SECRET` | Local and Netlify | Signs logins. `openssl rand -hex 32`. Not the encryption key |
| `SECRETS_ENCRYPTION_KEY` | Local and Netlify | Encrypts stored provider keys. A second `openssl rand -hex 32`. Not the auth secret |
| `AUTH_DISABLED` | Optional | `true` skips login locally only. Never on the hosted site |
| `AUTH_BOOTSTRAP_ADMINS` | Hosted | The one email allowed to sign up |

Leave secrets empty in the repo. `.env.example` shows the names only.

## Extensions (Framework Feature)

The framework provides **Extensions** — mini sandboxed Alpine.js apps that run inside iframes. Extensions let users (or the agent) create interactive widgets, dashboards, and utilities without modifying the app's source code. They appear in the sidebar under an "Extensions" section. (Distinct from LLM tools — the function-calling primitives the agent invokes.)

- **Creating extensions**: Via the sidebar "+" button, agent chat, or `POST /_agent-native/extensions`
- **API calls**: Extensions use `extensionFetch()` (legacy alias `toolFetch`) which proxies requests through the server with `${keys.NAME}` secret injection
- **Styling**: Extensions inherit the main app's Tailwind v4 theme automatically
- **Sharing**: Private by default, shareable with org or specific users (same model as other ownable resources)
- **Security**: Iframe sandbox + CSP + SSRF protection on the proxy

See the `extensions` skill in `.agents/skills/extensions/SKILL.md` for full implementation details.
