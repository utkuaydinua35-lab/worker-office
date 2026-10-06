#!/usr/bin/env bash
# Worker Office — one-command installer and launcher (macOS and Linux).
#
#   curl -fsSL https://raw.githubusercontent.com/utkuaydinua35-lab/worker-office/refs/heads/claude/kind-cray-emsr6a/install.sh | bash
#
# Installs everything under ~/WorkerOffice (its own Node.js and Python when the
# system has none), builds the office, then opens it in the browser. Running
# the same command again updates to the latest version. Nothing outside
# ~/WorkerOffice is changed except one `worker-office` line in your shell
# profile and, on macOS, a "Worker Office" launcher on the Desktop.
set -euo pipefail

APP_HOME="${WORKER_OFFICE_HOME:-$HOME/WorkerOffice}"
BRANCH="${WORKER_OFFICE_BRANCH:-claude/kind-cray-emsr6a}"
OFFICE_REPO="https://github.com/utkuaydinua35-lab/worker-office.git"
CREW_REPO="https://github.com/utkuaydinua35-lab/crewAI.git"
NODE_MAJOR=22
PYTHON_VERSION=3.12
RUNTIME="$APP_HOME/.runtime"
PROFILE_MARKER="# worker-office launcher"

step() { printf '\n\033[1;35m▶ %s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
fail() {
  printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2
  exit 1
}

case "$(uname -s)" in
  Darwin) OS=darwin ;;
  Linux) OS=linux ;;
  *) fail "Bu kurulum yalnızca macOS ve Linux içindir." ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) ARCH=arm64 ;;
  x86_64 | amd64) ARCH=x64 ;;
  *) fail "Desteklenmeyen işlemci mimarisi: $(uname -m)" ;;
esac

mkdir -p "$APP_HOME" "$RUNTIME"

# ── 1. git ────────────────────────────────────────────────────────────────────
step "Gerekli araçlar kontrol ediliyor"
if ! git --version >/dev/null 2>&1; then
  if [ "$OS" = darwin ]; then
    info "Apple'ın geliştirici araçları gerekiyor. Açılan pencerede 'Yükle'ye basın."
    xcode-select --install >/dev/null 2>&1 || true
    until git --version >/dev/null 2>&1; do sleep 10; done
  else
    fail "git bulunamadı. Önce git kurun (ör. sudo apt install git), sonra komutu tekrar çalıştırın."
  fi
fi
info "git ✓"

# ── 2. Node.js ────────────────────────────────────────────────────────────────
NODE_BIN=""
if command -v node >/dev/null 2>&1; then
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "$major" -ge 20 ]; then NODE_BIN="$(command -v node)"; fi
fi
if [ -z "$NODE_BIN" ]; then
  NODE_BIN="$RUNTIME/node/bin/node"
  if [ ! -x "$NODE_BIN" ]; then
    info "Node.js $NODE_MAJOR indiriliyor..."
    base="https://nodejs.org/dist/latest-v$NODE_MAJOR.x"
    file="$(curl -fsSL "$base/SHASUMS256.txt" | awk '{print $2}' | grep -E "^node-v[0-9.]+-$OS-$ARCH\.tar\.gz$" | head -1 || true)"
    [ -n "$file" ] || fail "Node.js indirme bağlantısı bulunamadı."
    rm -rf "$RUNTIME/node" "$RUNTIME/node.tmp"
    mkdir -p "$RUNTIME/node.tmp"
    curl -fsSL "$base/$file" | tar -xz -C "$RUNTIME/node.tmp" --strip-components=1 ||
      fail "Node.js indirilemedi. İnternet bağlantınızı kontrol edip tekrar deneyin."
    mv "$RUNTIME/node.tmp" "$RUNTIME/node"
  fi
fi
export PATH="$(dirname "$NODE_BIN"):$PATH"
info "Node.js $("$NODE_BIN" -v) ✓"

# ── 3. uv (Python manager; brings its own Python) ────────────────────────────
UV_BIN="$(command -v uv 2>/dev/null || true)"
if [ -z "$UV_BIN" ]; then
  UV_BIN="$RUNTIME/uv/uv"
  if [ ! -x "$UV_BIN" ]; then
    info "Python araçları indiriliyor..."
    case "$OS-$ARCH" in
      darwin-arm64) target=aarch64-apple-darwin ;;
      darwin-x64) target=x86_64-apple-darwin ;;
      linux-arm64) target=aarch64-unknown-linux-gnu ;;
      linux-x64) target=x86_64-unknown-linux-gnu ;;
    esac
    rm -rf "$RUNTIME/uv" && mkdir -p "$RUNTIME/uv"
    curl -fsSL "https://github.com/astral-sh/uv/releases/latest/download/uv-$target.tar.gz" |
      tar -xz -C "$RUNTIME/uv" --strip-components=1 ||
      fail "Python araçları (uv) indirilemedi. İnternet bağlantınızı kontrol edip tekrar deneyin."
  fi
fi
[ -x "$UV_BIN" ] || fail "Python araçları (uv) kurulamadı."
info "uv ✓"

# ── 4. Source ─────────────────────────────────────────────────────────────────
fetch_repo() { # url dir
  local url="$1" dir="$2"
  if [ -d "$dir/.git" ]; then
    git -C "$dir" fetch --quiet --depth 1 origin "$BRANCH"
    git -C "$dir" reset --quiet --hard FETCH_HEAD
  else
    rm -rf "$dir"
    git clone --quiet --depth 1 --branch "$BRANCH" "$url" "$dir"
  fi
}
step "Ofis indiriliyor / güncelleniyor"
fetch_repo "$OFFICE_REPO" "$APP_HOME/worker-office"
info "Ofis ✓"
step "Ekip motoru (CrewAI) indiriliyor / güncelleniyor — ilk seferde birkaç dakika sürebilir"
fetch_repo "$CREW_REPO" "$APP_HOME/crewai"
info "CrewAI ✓"

# ── 5. Build the office ───────────────────────────────────────────────────────
office_rev="$(git -C "$APP_HOME/worker-office" rev-parse HEAD)"
if [ "$(cat "$APP_HOME/.office-built" 2>/dev/null)" != "$office_rev" ]; then
  step "Ofis hazırlanıyor"
  (
    cd "$APP_HOME/worker-office"
    HUSKY=0 NPM_CONFIG_UPDATE_NOTIFIER=false npm ci --no-audit --no-fund --loglevel=error >/dev/null
    node esbuild.js --production >/dev/null
    npm run --silent build:webview >/dev/null
  ) || fail "Ofis derlenemedi. Komutu tekrar çalıştırmayı deneyin."
  echo "$office_rev" >"$APP_HOME/.office-built"
fi
info "Ofis hazır ✓"

# ── 6. Python environment for the workers ─────────────────────────────────────
crew_rev="$(git -C "$APP_HOME/crewai" rev-parse HEAD)"
if [ "$(cat "$APP_HOME/.crew-built" 2>/dev/null)" != "$crew_rev" ]; then
  step "Worker'ların çalışma ortamı kuruluyor"
  if [ ! -x "$APP_HOME/.venv/bin/python" ]; then
    "$UV_BIN" venv --quiet --python "$PYTHON_VERSION" "$APP_HOME/.venv"
  fi
  (
    cd "$APP_HOME/crewai"
    "$UV_BIN" pip install --quiet --reinstall-package crewai --python "$APP_HOME/.venv/bin/python" \
      ./lib/crewai-core ./lib/cli "./lib/crewai[anthropic]"
  ) || fail "Worker ortamı kurulamadı. Komutu tekrar çalıştırmayı deneyin."
  echo "$crew_rev" >"$APP_HOME/.crew-built"
fi
info "Worker ortamı hazır ✓"

# ── 7. Launchers ──────────────────────────────────────────────────────────────
mkdir -p "$APP_HOME/Dosyalar"
LAUNCHER="$APP_HOME/baslat.sh"
cat >"$LAUNCHER" <<EOF
#!/usr/bin/env bash
# Starts Worker Office and opens it in the browser.
export PATH="$(dirname "$NODE_BIN"):\$PATH"
export PIXEL_AGENTS_WORKER_PYTHON="$APP_HOME/.venv/bin/python"
export PIXEL_AGENTS_WORKER_FILES="$APP_HOME/Dosyalar"
cd "$APP_HOME/worker-office"
printf '\n\033[1;32mWorker Office açılıyor...\033[0m\n'
printf 'Tarayıcı açılmazsa aşağıdaki bağlantıyı kopyalayıp tarayıcıya yapıştırın.\n'
printf 'Ofisi kapatmak için bu pencereyi kapatın (veya Ctrl+C).\n'
exec "$NODE_BIN" dist/cli.js --open
EOF
chmod +x "$LAUNCHER"

for profile in "$HOME/.zshrc" "$HOME/.bashrc"; do
  if [ -f "$profile" ] || [ "$profile" = "$HOME/.zshrc" -a "$OS" = darwin ]; then
    touch "$profile"
    if ! grep -qF "$PROFILE_MARKER" "$profile"; then
      printf '\n%s\nalias worker-office="%s"\n' "$PROFILE_MARKER" "$LAUNCHER" >>"$profile"
    fi
  fi
done

if [ "$OS" = darwin ] && [ -d "$HOME/Desktop" ]; then
  DESKTOP_LAUNCHER="$HOME/Desktop/Worker Office.command"
  printf '#!/usr/bin/env bash\nexec "%s"\n' "$LAUNCHER" >"$DESKTOP_LAUNCHER"
  chmod +x "$DESKTOP_LAUNCHER"
fi

step "Kurulum tamam!"
info "Bir dahaki sefere ofisi açmak için:"
if [ "$OS" = darwin ]; then
  info "  • Masaüstündeki 'Worker Office' simgesine çift tıklayın, ya da"
fi
info "  • Yeni bir terminal penceresine  worker-office  yazın."
info "Worker'ların dosyaları: $APP_HOME/Dosyalar"

if [ "${WORKER_OFFICE_NO_START:-}" != "1" ]; then
  exec "$LAUNCHER"
fi
