# ============================================================================
# Claude Code Server - Browser-based VS Code with AI & TOTP 2FA
# ============================================================================

FROM codercom/code-server:4.108.0

USER root

# ============================================================================
# SYSTEM DEPENDENCIES
# Install gosu, Node.js 22, Python/uv, and essential tools
# ============================================================================

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        gosu \
        nodejs \
        python3 \
        python3-pip \
        python3-venv \
        pipx \
        git \
        curl \
        wget \
        unzip \
        jq \
        htop \
        vim \
        nano \
        ripgrep \
    && npm install -g npm@latest \
    && pip3 install --break-system-packages uv \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# GitHub CLI (for `gh auth login` device flow - private repo access)
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ============================================================================
# PERSISTENCE CONFIGURATION
# Default to /home/clauder for new deployments
# ============================================================================

ENV HOME=/home/clauder
ENV USER=clauder

# XDG Base Directory Specification
ENV XDG_DATA_HOME=/home/clauder/.local/share
ENV XDG_CONFIG_HOME=/home/clauder/.config
ENV XDG_CACHE_HOME=/home/clauder/.cache
ENV XDG_STATE_HOME=/home/clauder/.local/state

# PATH: Volume paths FIRST (user installs), image paths LAST (fallbacks)
ENV PATH="/home/clauder/.local/bin:/home/clauder/.local/node/bin:/home/clauder/.claude/local:/home/clauder/node_modules/.bin:/usr/local/bin:/usr/bin:/usr/lib/code-server/lib/vscode/bin/remote-cli:${PATH}"

# Custom startup scripts directory
ENV ENTRYPOINTD=/home/clauder/entrypoint.d

# ============================================================================
# USER SETUP
# Create clauder user (UID 1000) with passwordless sudo
# - Stays non-root for Claude YOLO mode compatibility
# - Can use sudo for package installs (apt, npm -g, pip, etc.)
# ============================================================================

# Install sudo if not present, then configure user
RUN apt-get update && apt-get install -y sudo \
    && rm -rf /var/lib/apt/lists/* \
    && (groupadd -g 1000 clauder 2>/dev/null || true) \
    && (useradd -m -s /bin/bash -u 1000 -g 1000 clauder 2>/dev/null || usermod -l clauder -d /home/clauder -m coder 2>/dev/null || true) \
    && (groupmod -n clauder coder 2>/dev/null || true) \
    && mkdir -p /etc/sudoers.d \
    && echo "clauder ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/clauder \
    && chmod 0440 /etc/sudoers.d/clauder \
    && chown root:root /etc/sudoers.d/clauder

# ============================================================================
# DIRECTORY SETUP
# ============================================================================

RUN mkdir -p \
    /home/clauder/.local/share \
    /home/clauder/.config \
    /home/clauder/.cache \
    /home/clauder/.local/state \
    /home/clauder/.local/bin \
    /home/clauder/.local/node \
    /home/clauder/.claude \
    /home/clauder/.config/claude-2fa \
    /home/clauder/entrypoint.d \
    /home/clauder/workspace \
    && chown -R 1000:1000 /home/clauder

# ============================================================================
# 2FA AUTH PROXY
# ============================================================================

COPY auth-proxy/ /usr/lib/auth-proxy/
RUN cd /usr/lib/auth-proxy && npm ci --omit=dev

# Copy entrypoint script
COPY entrypoint.sh /usr/bin/entrypoint.sh
RUN chmod +x /usr/bin/entrypoint.sh

# ============================================================================
# CLAUDE CODE CLI INSTALLATION
# Install globally via npm - this is the official package
# ============================================================================

RUN npm install -g @anthropic-ai/claude-code \
    && echo "Claude CLI installed: $(claude --version 2>/dev/null || echo 'checking...')"

# ============================================================================
# VS CODE EXTENSIONS
# Pre-install to staging dir (copied to volume on first run by entrypoint)
# ============================================================================

RUN mkdir -p /opt/default-extensions \
    && code-server --install-extension anthropic.claude-code \
       --extensions-dir /opt/default-extensions \
    && echo "Extension pre-installed: anthropic.claude-code"

# ============================================================================
# RUNTIME
# Stay as root - entrypoint handles user switching based on RUN_AS_USER
# ============================================================================

WORKDIR /home/clauder/workspace
EXPOSE 3000

# Entrypoint starts code-server (background) + 2FA proxy (foreground)
ENTRYPOINT ["/usr/bin/entrypoint.sh"]


