# Claude Code Server (2FA)

> Based on [sphinxcode/claude-code-server](https://github.com/sphinxcode/claude-code-server), adapted for TOTP 2FA (using Claude Opus 4.6).

**Browser-based VS Code with Claude Code Chat Extension and CLI and TOTP two-factor authentication.**

Deploy a full VS Code development environment in the cloud with Claude Code chat extension and CLI ready to go. Secured with TOTP 2FA (Google Authenticator, Authy, etc.) instead of a password. Access it from any browser, on any device.

---

## Features

- **TOTP 2FA Authentication** -- Secured with authenticator app, no passwords
- **Claude Code CLI + Extension** -- Use Claude in the terminal (`claude`) or the VS Code chat sidebar -- both pre-installed, defaults to Opus
- **Browser-Based VS Code** -- Full IDE experience accessible from any device
- **Persistent Storage** -- Extensions, settings, and projects survive redeploys (optional -- works without a volume too, you'll just re-enroll 2FA each deploy)
- **GitHub CLI Pre-installed** -- Run `gh auth login` to clone and push to private repos
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

1. Deploy the container and open `http://localhost:3000` (or your platform URL)
2. On first visit, you'll see a **QR code** -- scan it with your authenticator app (Google Authenticator, Authy, 1Password, etc.)
3. Enter the 6-digit code from your authenticator to **confirm enrollment**
4. You're in! VS Code opens in the browser
5. **Copy the TOTP secret from your container logs** (see below) and save it as the `TOTP_SECRET` environment variable in your platform -- this ensures your authenticator app keeps working across redeploys

On subsequent visits, just enter your 6-digit authenticator code to sign in. Sessions last 30 days by default, so you won't be prompted every time.

### Persisting 2FA Across Redeploys

When the container first generates a TOTP secret, it prints it to the console logs:

```
════════════════════════════════════════════════════════════════
New TOTP secret generated. To persist across deploys without a
volume, set this environment variable:
  TOTP_SECRET=JBSWY3DPEHPK3PXP...
════════════════════════════════════════════════════════════════
```

Copy that value and add it as an environment variable (`TOTP_SECRET`) in your hosting platform. On the next deploy, the container will use that secret automatically -- no new QR code, same authenticator code works.

If you use a **persistent volume** at `/home/clauder`, the secret is saved to disk and you don't need to set the env var. But without a volume, `TOTP_SECRET` is the way to avoid re-enrolling every deploy.

> **Resetting 2FA:** To re-enroll with a new QR code, remove the `TOTP_SECRET` env var and either delete `~/.config/claude-2fa/secret.json` from the volume or redeploy without a volume.

### Using Claude Code

Claude Code is available in two ways:

- **Terminal** -- Open the VS Code terminal and run `claude` (interactive) or `claude-auto` (auto-accept mode)
- **Chat Sidebar** -- Click the Claude icon in the VS Code activity bar to use Claude directly in the editor's chat panel

The default model is **Opus**. You can change it with `claude config set model sonnet` or `/model sonnet` in a session.

Claude Code supports two authentication methods:

- **API Key** -- Set `ANTHROPIC_API_KEY` as an environment variable (pay-per-use via Anthropic API)
- **OAuth Login** -- Run `claude` in the terminal and follow the prompts to log in with your Claude Pro or Max subscription (no API key needed)

If you don't set an API key, Claude will prompt you to authenticate via OAuth on first use.

### Private Repositories

GitHub CLI (`gh`) is pre-installed for authenticating with GitHub:

1. Open the terminal in VS Code
2. Run `gh auth login`
3. Select **GitHub.com** → **HTTPS** → **Login with a web browser**
4. Copy the one-time code, open the URL in another tab, and paste it
5. Done -- git is now authenticated for private repos

This persists on the volume. Without a volume, you'll need to re-authenticate after each deploy.

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | No | - | Anthropic API key for Claude CLI (or use OAuth login instead) |
| `TOTP_SECRET` | No | auto-generated | TOTP secret for 2FA (see below) |
| `SESSION_SECRET` | No | auto-generated | Secret for signing session cookies |
| `SESSION_MAX_AGE` | No | 30 days (ms) | Session cookie lifetime |
| `APP_NAME` | No | `Claude Code Server` | Displayed on login page and banner |
| `CLAUDER_HOME` | No | `/home/clauder` | Volume mount path |
| `RUN_AS_USER` | No | `clauder` | Set to `root` if you need root access |

> **`TOTP_SECRET`**: On first deploy, the container generates a TOTP secret and prints it to the console logs. Copy that secret and set it as the `TOTP_SECRET` environment variable -- this lets your authenticator app work across redeploys without needing a persistent volume. If set, the container auto-enrolls on startup (no QR code shown).
>
> **`SESSION_SECRET`** is automatically generated and persisted to the volume on first run. Set it explicitly only if you need deterministic session secrets.

### Volume Configuration

> A volume is **optional**. Without one, all data is lost on every redeploy -- but if you set `TOTP_SECRET` as an env var, your 2FA enrollment persists. I personally use this without a volume and just push any changes to my repo.

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
- [GitHub CLI](https://cli.github.com/) -- GitHub authentication and private repo access
- [otplib](https://github.com/yeojz/otplib) -- TOTP implementation

---

## License

MIT
