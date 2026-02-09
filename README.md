# Claude Code Server (2FA)

> Based on [sphinxcode/claude-code-server](https://github.com/sphinxcode/claude-code-server), adapted for TOTP 2FA (using Claude Opus 4.6).

**Browser-based VS Code with Claude Code CLI and TOTP two-factor authentication.**

Deploy a full VS Code development environment in the cloud with Claude Code CLI ready to go. Secured with TOTP 2FA (Google Authenticator, Authy, etc.) instead of a password. Access it from any browser, on any device.

---

## Features

- **TOTP 2FA Authentication** -- Secured with authenticator app, no passwords
- **Claude Code CLI Pre-installed** -- Start AI-assisted coding immediately with `claude` or `claude-auto`
- **Browser-Based VS Code** -- Full IDE experience accessible from any device
- **Persistent Storage** -- Extensions, settings, and projects survive redeploys
- **Non-Root Security** -- Runs as the `clauder` user with optional sudo access
- **Host-Agnostic** -- Works with any Docker host (Coolify, fly.io, self-hosted, etc.)

---

## Quick Start

### Docker Run

```bash
docker build -t claude-code-server .
docker run -d \
  -p 3000:3000 \
  -v claude-data:/home/clauder \
  -e ANTHROPIC_API_KEY=your-key-here \
  --name claude-code \
  claude-code-server
```

### Docker Compose

```yaml
services:
  claude-code:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - claude-data:/home/clauder
    environment:
      - ANTHROPIC_API_KEY=your-key-here
    restart: unless-stopped

volumes:
  claude-data:
```

### Coolify / PaaS Deployment

This works with any Docker-based platform (Coolify, CapRover, Dokku, etc.):

1. Point the service at your Git repo
2. Set build method to **Dockerfile**
3. Set the exposed port to **3000**
4. Add a volume mount for `/home/clauder` (optional but recommended for persistence)
5. Add any environment variables you need (e.g. `ANTHROPIC_API_KEY`)
6. Deploy -- the container handles everything else


### First Login & 2FA Setup

1. Open `http://localhost:3000` in your browser
2. On first visit, you'll see a **QR code** -- scan it with your authenticator app (Google Authenticator, Authy, 1Password, etc.)
3. Enter the 6-digit code from your authenticator to **confirm enrollment**
4. You're in! VS Code opens in the browser

On subsequent visits, just enter your 6-digit authenticator code to sign in. Sessions last 30 days by default, so you won't be prompted every time.

> **How 2FA works:** The container generates a TOTP secret on first run and shows you a QR code. Once you scan it and verify a code, the secret is saved to the volume at `~/.config/claude-2fa/secret.json`. There's no password -- only someone with your authenticator app can log in. If you lose your authenticator, delete the secret file from the volume (or wipe the volume) to re-enroll.

### Using Claude Code

Once logged in, open the terminal in VS Code and run:

```bash
claude          # Interactive mode
claude-auto     # Auto-accept mode (alias for claude --dangerously-skip-permissions)
```

Claude Code supports two authentication methods:

- **API Key** -- Set `ANTHROPIC_API_KEY` as an environment variable (pay-per-use via Anthropic API)
- **OAuth Login** -- Run `claude` in the terminal and follow the prompts to log in with your Claude Pro or Max subscription (no API key needed)

If you don't set an API key, Claude will prompt you to authenticate via OAuth on first use.

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | No | - | Anthropic API key for Claude CLI (or use OAuth login instead) |
| `SESSION_SECRET` | No | auto-generated | Secret for signing session cookies |
| `SESSION_MAX_AGE` | No | 30 days (ms) | Session cookie lifetime |
| `APP_NAME` | No | `Claude Code Server` | Displayed on login page and banner |
| `CLAUDER_HOME` | No | `/home/clauder` | Volume mount path |
| `RUN_AS_USER` | No | `clauder` | Set to `root` if you need root access |

> **Note:** `SESSION_SECRET` is automatically generated and persisted to the volume on first run. Sessions survive container restarts without any configuration. Set it explicitly only if you need deterministic session secrets.

### Volume Configuration

> **CRITICAL**: Without a volume, ALL data is lost on every redeploy -- including your 2FA enrollment! I personally use this without a volume and just push any changes to my repo's anyway.

| Setting | Value |
|---------|-------|
| **Mount Path** | `/home/clauder` |
| **Size** | 5GB+ recommended |

---

## Architecture & Security

```
Internet (port 3000) --> 2FA Auth Proxy (Express) --> code-server (localhost:8080, no auth)
```

Code-server runs with `--auth none` on its default port `127.0.0.1:8080` -- it is **not reachable from outside the container**. Only the auth proxy listens on the external port (3000). All traffic must pass through the proxy, which enforces TOTP authentication before forwarding requests.

### How TOTP Authentication Works

TOTP (Time-based One-Time Password) generates a new 6-digit code every 30 seconds based on a shared secret between the server and your authenticator app. Both sides compute the same code from the secret + current time, so nothing sensitive is ever transmitted during login -- you just prove you have the secret by entering the right code.

- **Enrollment:** On first run, the server generates a random TOTP secret and displays it as a QR code. You scan it once with your authenticator app, and the secret is saved to the volume (`~/.config/claude-2fa/secret.json`, file permissions `0600`). After enrollment, the QR code is never shown again.
- **Login:** You enter the 6-digit code from your app. The server computes the expected code from the stored secret and compares. A window of +/-30 seconds is allowed to account for clock drift.
- **No password at all** -- authentication relies entirely on possession of the authenticator device.

### Security Measures

| Measure | Detail |
|---------|--------|
| **Internal binding** | code-server binds to `127.0.0.1` only -- unreachable without the proxy |
| **Rate limiting** | 5 login attempts per 60 seconds to prevent brute force |
| **Cookie flags** | `httpOnly` (no JS access), `sameSite: lax` (CSRF protection) |
| **Signed cookies** | Session cookie is cryptographically signed with a secret key |
| **WebSocket auth** | WebSocket upgrade requests validate the session cookie before proxying; unauthenticated connections are destroyed |
| **File permissions** | TOTP secret file stored with `0600` permissions (owner-only read/write) |

> **Important:** The auth proxy does not terminate TLS. In production, you should place it behind a reverse proxy that handles HTTPS (Coolify, Caddy, nginx, Cloudflare Tunnel, etc.). Without HTTPS, session cookies could be intercepted on the network.

---

## Built With

- [code-server](https://github.com/coder/code-server) -- VS Code in the browser
- [Claude Code CLI](https://claude.ai/code) -- AI coding assistant by Anthropic
- [otplib](https://github.com/yeojz/otplib) -- TOTP implementation

---

## License

MIT
