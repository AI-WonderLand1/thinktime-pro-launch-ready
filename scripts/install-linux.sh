#!/usr/bin/env bash
set -euo pipefail

APP_NAME="ThinkTime Pro"
APP_DIR="${HOME}/.local/share/thinktime-pro"
SERVICE_DIR="${HOME}/.config/systemd/user"
DESKTOP_DIR="${HOME}/.local/share/applications"
PORT="${THINKTIME_PORT:-4317}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NPM_BIN="$(command -v npm || true)"
NODE_BIN="$(command -v node || true)"

if [[ -z "${NPM_BIN}" || -z "${NODE_BIN}" ]]; then
  echo "Node.js/npm is required. Install Node.js 20+ first, then run this installer again."
  exit 1
fi

NODE_MAJOR="$(${NODE_BIN} -p 'Number(process.versions.node.split(".")[0])')"
if [[ "${NODE_MAJOR}" -lt 20 ]]; then
  echo "ThinkTime Pro requires Node.js 20 or newer. Found: $(${NODE_BIN} --version)"
  exit 1
fi

SOURCE_REAL="$(realpath "${SOURCE_DIR}")"
APP_REAL="$(realpath -m "${APP_DIR}")"
if [[ "${SOURCE_REAL}" == "${APP_REAL}" ]]; then
  echo "ThinkTime Pro is already running from its installed directory."
  echo "Reinstall from a separate extracted copy of the release ZIP."
  exit 1
fi

mkdir -p "${APP_DIR}" "${SERVICE_DIR}" "${DESKTOP_DIR}"

# Keep local server configuration/secrets when reinstalling.
ENV_BACKUP=""
if [[ -f "${APP_DIR}/.env.local" ]]; then
  ENV_BACKUP="$(mktemp)"
  cp "${APP_DIR}/.env.local" "${ENV_BACKUP}"
fi

find "${APP_DIR}" -mindepth 1 -maxdepth 1 ! -name '.env.local' -exec rm -rf -- {} +
cp -a "${SOURCE_DIR}/." "${APP_DIR}/"
rm -rf "${APP_DIR}/node_modules" "${APP_DIR}/dist"

if [[ -n "${ENV_BACKUP}" ]]; then
  cp "${ENV_BACKUP}" "${APP_DIR}/.env.local"
  rm -f "${ENV_BACKUP}"
fi

cd "${APP_DIR}"
echo "Installing ThinkTime Pro dependencies..."
"${NPM_BIN}" install --no-audit --no-fund
echo "Building ThinkTime Pro..."
"${NPM_BIN}" run build

cat > "${SERVICE_DIR}/thinktime-pro.service" <<SERVICE
[Unit]
Description=ThinkTime Pro local application server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=PORT=${PORT}
Environment=HOST=127.0.0.1
ExecStart=${NPM_BIN} start
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
SERVICE

BROWSER_CMD=""
for candidate in chromium chromium-browser google-chrome google-chrome-stable microsoft-edge microsoft-edge-stable; do
  if command -v "${candidate}" >/dev/null 2>&1; then
    BROWSER_CMD="$(command -v "${candidate}") --app=http://127.0.0.1:${PORT} --class=ThinkTimePro"
    break
  fi
done
if [[ -z "${BROWSER_CMD}" ]] && command -v firefox >/dev/null 2>&1; then
  BROWSER_CMD="$(command -v firefox) --new-window http://127.0.0.1:${PORT}"
fi
if [[ -z "${BROWSER_CMD}" ]]; then
  BROWSER_CMD="xdg-open http://127.0.0.1:${PORT}"
fi

cat > "${DESKTOP_DIR}/thinktime-pro.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=${APP_NAME}
Comment=Workforce timekeeping and payroll-estimate application
Exec=sh -lc '${BROWSER_CMD}'
Icon=${APP_DIR}/public/icons/icon-512.png
Terminal=false
Categories=Office;Utility;
StartupNotify=true
DESKTOP
chmod +x "${DESKTOP_DIR}/thinktime-pro.desktop"

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemd user services are required by this installer, but systemctl was not found."
  exit 1
fi

systemctl --user daemon-reload
systemctl --user enable --now thinktime-pro.service

healthcheck() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1
  else
    "${NODE_BIN}" -e "fetch('http://127.0.0.1:${PORT}/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" >/dev/null 2>&1
  fi
}

READY=false
for _ in {1..40}; do
  if healthcheck; then
    READY=true
    break
  fi
  sleep 0.5
done

if [[ "${READY}" != "true" ]]; then
  echo "ThinkTime Pro was copied and built, but the local service did not become healthy."
  echo "Run: journalctl --user -u thinktime-pro.service -n 100 --no-pager"
  exit 1
fi

echo
echo "ThinkTime Pro is installed and the local service is healthy."
echo "Open ThinkTime Pro from your application menu."
echo "Local address: http://127.0.0.1:${PORT}"
echo
echo "Chromium/Chrome/Edge opens ThinkTime in a standalone app-style window."
echo "Firefox on Linux opens a dedicated browser window; use the application-menu launcher created by this installer."
