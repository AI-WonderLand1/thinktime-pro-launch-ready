#!/usr/bin/env bash
set -euo pipefail
systemctl --user disable --now thinktime-pro.service 2>/dev/null || true
rm -f "${HOME}/.config/systemd/user/thinktime-pro.service"
rm -f "${HOME}/.local/share/applications/thinktime-pro.desktop"
rm -rf "${HOME}/.local/share/thinktime-pro"
systemctl --user daemon-reload 2>/dev/null || true
echo "ThinkTime Pro was removed from this Linux user account."
