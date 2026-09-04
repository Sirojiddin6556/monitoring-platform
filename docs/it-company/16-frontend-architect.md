# 16. Frontend Architect Report — FastAPI + Jinja2 + HTMX + WebSocket

This document outlines the frontend architecture for the **Infrastructure Monitoring Platform (SaaS & Enterprise)**. The frontend will be transitioned from the legacy Next.js application to a highly efficient server-rendered stack using **FastAPI, Jinja2 templates, HTMX (for dynamic, SPA-like updates), and native WebSockets (for real-time streaming)**.

---

## 1. Frontend Structure and Directory Layout

We organize the templates and static resources directly within the backend structure (or in a dedicated static/templates root served by FastAPI) to facilitate zero-lag templating and fast deployments.

```
backend/
├── app/
│   ├── templates/               # Jinja2 HTML Templates
│   │   ├── base.html            # Global HTML shell, imports HTMX, Tailwind, & global CSS/JS
│   │   ├── layouts/
│   │   │   └── app_shell.html   # Main layout with Sidebar, Topbar, and Toast notification container
│   │   ├── pages/               # Page-specific views loaded via standard gets or hx-boost
│   │   │   ├── login.html       # Authentication screen
│   │   │   ├── dashboards.html  # Widgets & graphs dashboard
│   │   │   ├── servers.html     # Servers inventory & server metrics detail page
│   │   │   ├── websites.html    # Website availability monitor
│   │   │   ├── incidents.html   # Alarm dashboard (acknowledging & resolving incidents)
│   │   │   ├── maintenance.html # Maintenance windows scheduler
│   │   │   └── settings.html    # Profile, Telegram channel integration, agent token creation
│   │   └── fragments/           # Partial HTML blocks for HTMX swaps
│   │       ├── server_list.html # Dynamic servers list fragment
│   │       ├── server_card.html # Individual server status card
│   │       ├── log_feed.html    # Real-time server log lines
│   │       ├── metric_chart.html# Rendered SVG or canvas-based metric sparklines
│   │       ├── incident_row.html# Individual incident row status & action buttons
│   │       └── toast.html       # Notification popup fragment
│   └── static/                  # Static assets
│       ├── css/
│       │   └── theme.css        # OBSIDIAN INDIGO design system tokens and resets
│       └── js/
│           ├── app.js           # Light wrapper scripts (chart initialization, cookie helpers)
│           └── ws-client.js     # WebSocket connection builder and handler for HTMX integration
```

---

## 2. Routing Map

All pages are served by FastAPI. To ensure high speed and zero-page-reload feel, HTMX `hx-boost="true"` is applied to the root AppShell body, intercepting standard links and replacing only the `#main-content` target.

| Route (URL) | FastAPI View Function | Description | HTMX Target / Swap |
| :--- | :--- | :--- | :--- |
| `/login` | `GET /login` | Serves standard login page (unauthorized). | Entire page reload |
| `/` or `/dashboards` | `GET /dashboards` | Serves Dashboards overview page. | `#main-content` (swap innerHTML) |
| `/servers` | `GET /servers` | Serves Server lists and grid dashboard. | `#main-content` (swap innerHTML) |
| `/servers/{id}` | `GET /servers/{id}` | Detailed metrics, realtime stats & logs page for specific server. | `#main-content` (swap innerHTML) |
| `/websites` | `GET /websites` | Serves Websites checklist & SLA uptime status. | `#main-content` (swap innerHTML) |
| `/incidents` | `GET /incidents` | Serves Incident list table & resolve console. | `#main-content` (swap innerHTML) |
| `/maintenance` | `GET /maintenance` | Serves scheduling calendar/list for maintenance. | `#main-content` (swap innerHTML) |
| `/sla` | `GET /sla` | Serves consolidated SLA/SLO metrics tables. | `#main-content` (swap innerHTML) |
| `/settings` | `GET /settings` | Serves setup inputs, notifications & token configurations. | `#main-content` (swap innerHTML) |

---

## 3. Client State and Authentication Management

1. **Authentication Token (JWT)**:
   - Stored in a secure, `HttpOnly`, `SameSite=Lax` cookie named `access_token`.
   - Automatically sent by the browser with every HTMX AJAX call (`hx-get`, `hx-post`, etc.).
   - If the cookie is expired/missing, FastAPI returns an `hx-redirect: /login` header or standard `401 Unauthorized` redirecting users to the login screen.
2. **Multi-tenant State (`org_id`)**:
   - Stored in a session cookie or path query parameter (e.g., `?org_id=2`).
   - Selected organisation dropdown in Topbar modifies the current request parameters (HTMX sends `hx-get="/dashboards" hx-include="#org-selector"`).
3. **Dynamic Interactivity State (e.g., selected time window)**:
   - Kept in the DOM using HTMX indicators or query string state. For example: `<select name="time_range" hx-get="/servers/srv-1/metrics" hx-target="#metrics-area">`.

---

## 4. Design System Concordance: "OBSIDIAN INDIGO"

The visual theme is aligned with the Dark-theme enterprise specification **OBSIDIAN INDIGO**.

- **CSS Variables & Palette** (defined in `static/css/theme.css`):
  ```css
  :root {
    --bg-base: #09090b;       /* Zinc-950 - deep void obsidian bg */
    --bg-surface: #18181b;    /* Zinc-900 - card/sidebar bg */
    --bg-elevated: #27272a;   /* Zinc-800 - inputs, hover buttons */
    
    --border-dim: #27272a;    /* Zinc-800 */
    --border-focus: #4f46e5;  /* Indigo-600 */

    --text-primary: #fafafa;  /* Zinc-50 */
    --text-secondary: #a1a1aa;/* Zinc-400 */
    --text-muted: #52525b;     /* Zinc-600 */

    /* Accent & Status */
    --color-indigo: #6366f1;   /* Indigo accent */
    --status-success: #10b981; /* Emerald-500 */
    --status-warning: #f59e0b; /* Amber-500 */
    --status-danger: #ef4444;  /* Rose-500 */
    --status-offline: #71717a; /* Zinc-500 */
  }
  ```
- **AppShell & Navigation**:
  - **Sidebar**: Sticky left pane, `#09090b` color, featuring clean navigation items with hover-states highlighting with `--color-indigo`.
  - **Topbar**: Clean bar displaying current Tenant selector dropdown, live connection status (Websocket icon indicator), and current logged user.
  - **Font Face**: Inter (sans-serif) for general controls and tables; JetBrains Mono for system metrics values, server IDs, and logs display.

---

## 5. Contract 1: Logic, Data Fetching & State (HTMX & WebSocket API)

This contract defines how data is updated dynamically without writing custom React-like states.

### 5.1 HTMX Data Fetching Conventions
- **Metrics/Logs Auto-polling**: 
  - Fallback polling is handled using HTMX triggers: `hx-trigger="every 10s"` on `#server-status-list` swapping only server cards.
- **Form Actions**:
  - Login/Register: Send POST forms using `hx-post="/api/auth/login"` targeting the window or triggering redirects.
  - Acknowledge incident: Button triggers `hx-post="/api/incidents/{incident_id}/acknowledge"` which returns updated incident row fragment `incident_row.html`.

### 5.2 Realtime WebSockets Protocol (`/ws`)
- Client connects via `static/js/ws-client.js`.
- The connection URL contains user token: `ws://[host]/ws?token=[JWT_TOKEN]`.
- **Received frames format**:
  ```json
  {
    "type": "metric_update" | "new_log" | "new_incident",
    "server_id": "srv-1",
    "html": "<div class='badge bg-success'>...</div>"
  }
  ```
- The client-side WebSocket controller listens to incoming events. If it receives an HTML block from the WebSocket broadcast, it directly inserts/replaces the corresponding element in the DOM based on the component selector (using HTMX OOB swaps `hx-swap-oob="true"` or direct injection).

---

## 6. Contract 2: UI-Components & Visual Layout (Jinja2 Templates & CSS)

This contract defines the reusable blocks that are styled and structured independently of API wiring.

### 6.1 UI Kit Base Classes (Tailwind + Custom class modifiers)
- **Buttons (`.ui-btn`)**:
  - Primary: `bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded-md transition`
  - Secondary: `bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 px-4 py-2 rounded-md transition`
  - Danger: `bg-red-600 hover:bg-red-500 text-white font-medium px-4 py-2 rounded-md transition`
- **Badges (`.ui-badge`)**:
  - Success: `bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-xs`
  - Warning: `bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-xs`
  - Danger: `bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded text-xs`
  - Neutral: `bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 px-2 py-0.5 rounded text-xs`
- **Metric Cards (`.ui-card`)**:
  - Clean card container with `bg-zinc-900 border border-zinc-800 rounded-lg p-4 shadow-md`.

### 6.2 Key HTML Fragments for Swapping
1. **`server_card.html`**:
   Renders server status, name, CPU %, RAM %, IP address, and connection age.
2. **`log_feed.html`**:
   Renders monospace lines of system logs with colors highlighting `ERROR`, `WARNING`, or `INFO`.
3. **`incident_row.html`**:
   Renders standard tabular view of alarm, containing state status badge, severity badge, resource target, title, and action button (Acknowledge/Resolve).

---

## 7. Next Stages Implementation Backlog

### Phase 1: Frontend Logic Developer (19) Tasks
- [ ] Create core static script `ws-client.js` connecting to `/ws` with JWT parsing support.
- [ ] Configure standard cookie extraction middleware on backend or JS hooks for headers.
- [ ] Set up HTMX attributes (`hx-get`, `hx-post`, `hx-trigger`, `hx-target`) across page templates for seamless asynchronous mutations.
- [ ] Implement lazy-loading strategies for metrics charts using HTMX triggers.

### Phase 2: UI Component Developer (20) Tasks
- [ ] Write `theme.css` containing variables and root layouts matching the **OBSIDIAN INDIGO** system design.
- [ ] Construct template layouts (`base.html`, `app_shell.html`) with proper responsive sidebar and topbar structure.
- [ ] Design and build reusable component Jinja2 macros (Buttons, Status Badges, Sparkline graphs placeholders, Dialog modals).
- [ ] Create detailed styling templates for list elements, server information grids, and logs container.

### Phase 3: Frontend Integration Engineer (21) Tasks
- [ ] Bind FastAPI Python endpoints (e.g. `routers/metrics.py`, `routers/incidents.py`) to return HTML template fragments instead of/in addition to raw JSON.
- [ ] Set up cookie-based session extraction on login/registration success.
- [ ] Integrate WebSocket updates on the server-side to broadcast prepared HTML fragments directly to connected client pools.
- [ ] Conduct end-to-end verification of page transitions, network efficiency, and tenant isolation behavior under HTMX swapping.
