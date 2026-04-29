#!/usr/bin/env bash
#
# tools/install-dev-tools.sh
#
# Idempotent installer for binary dev tools that npm cannot bundle.
# Drops binaries into ~/.local/bin (must be on PATH).
#
# Currently installs:
#   - gitleaks (secret scanner used by .husky/pre-commit and CI)
#
# Usage:
#   ./tools/install-dev-tools.sh
#
# Re-running is safe: each tool checks its current version and skips if
# already at the pinned version. To force a reinstall, delete the binary
# from ~/.local/bin and re-run.

set -euo pipefail

# ---------------------------------------------------------------------------
# Pinned versions
# ---------------------------------------------------------------------------
GITLEAKS_VERSION="8.30.1"

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
LOCAL_BIN="${HOME}/.local/bin"
mkdir -p "${LOCAL_BIN}"

if ! echo "${PATH}" | tr ':' '\n' | grep -qx "${LOCAL_BIN}"; then
  echo "WARNING: ${LOCAL_BIN} is not on your PATH." >&2
  echo "  Add this to your shell profile:  export PATH=\"\${HOME}/.local/bin:\${PATH}\"" >&2
fi

OS="$(uname -s)"
ARCH="$(uname -m)"
case "${OS}" in
  Linux) GITLEAKS_OS="linux" ;;
  Darwin) GITLEAKS_OS="darwin" ;;
  *) echo "Unsupported OS: ${OS}" >&2; exit 1 ;;
esac
case "${ARCH}" in
  x86_64|amd64) GITLEAKS_ARCH="x64" ;;
  arm64|aarch64) GITLEAKS_ARCH="arm64" ;;
  *) echo "Unsupported architecture: ${ARCH}" >&2; exit 1 ;;
esac

# ---------------------------------------------------------------------------
# gitleaks
# ---------------------------------------------------------------------------
install_gitleaks() {
  local target="${LOCAL_BIN}/gitleaks"

  if [ -x "${target}" ]; then
    local current
    current="$("${target}" version 2>/dev/null | head -n1 | tr -d 'v')"
    if [ "${current}" = "${GITLEAKS_VERSION}" ]; then
      echo "gitleaks ${GITLEAKS_VERSION} already installed at ${target} — skipping"
      return 0
    fi
    echo "Replacing gitleaks ${current} with ${GITLEAKS_VERSION}"
  fi

  local archive="gitleaks_${GITLEAKS_VERSION}_${GITLEAKS_OS}_${GITLEAKS_ARCH}.tar.gz"
  local url="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${archive}"
  local tmpdir
  tmpdir="$(mktemp -d)"

  echo "Downloading ${url}"
  if ! curl --fail --silent --show-error --location --output "${tmpdir}/${archive}" "${url}"; then
    rm -rf "${tmpdir}"
    echo "Failed to download gitleaks ${GITLEAKS_VERSION}" >&2
    return 1
  fi
  tar -xzf "${tmpdir}/${archive}" -C "${tmpdir}" gitleaks
  install -m 0755 "${tmpdir}/gitleaks" "${target}"
  rm -rf "${tmpdir}"
  echo "Installed gitleaks $("${target}" version 2>/dev/null | head -n1) to ${target}"
}

install_gitleaks

echo "Done."
