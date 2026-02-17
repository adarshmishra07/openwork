#!/bin/bash
#
# ShopOS Install/Update Script
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/shopos/shopos/main/install.sh | bash
#
# Or download and run:
#   chmod +x install.sh && ./install.sh
#

set -e

# Configuration
GITHUB_OWNER="shopos"
GITHUB_REPO="shopos"
APP_NAME="ShopOS"
INSTALL_DIR="/Applications"
APP_PATH="${INSTALL_DIR}/${APP_NAME}.app"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print functions
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Check if running on macOS
check_macos() {
    if [[ "$(uname)" != "Darwin" ]]; then
        error "This installer only supports macOS. For other platforms, please download from GitHub releases."
    fi
}

# Detect architecture
detect_arch() {
    local arch=$(uname -m)
    case "$arch" in
        x86_64)
            echo "x64"
            ;;
        arm64)
            echo "arm64"
            ;;
        *)
            error "Unsupported architecture: $arch"
            ;;
    esac
}

# Check if app is already installed
is_installed() {
    [[ -d "$APP_PATH" ]]
}

# Get installed version
get_installed_version() {
    if is_installed; then
        local plist="${APP_PATH}/Contents/Info.plist"
        if [[ -f "$plist" ]]; then
            /usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$plist" 2>/dev/null || echo "unknown"
        else
            echo "unknown"
        fi
    else
        echo "none"
    fi
}

# Fetch latest release info from GitHub
get_latest_release() {
    local api_url="https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest"
    curl -fsSL "$api_url" 2>/dev/null
}

# Extract version from release JSON
get_release_version() {
    local release_json="$1"
    echo "$release_json" | grep -o '"tag_name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' | sed 's/^v//'
}

# Get download URL for the correct architecture
get_download_url() {
    local release_json="$1"
    local arch="$2"

    # Look for .dmg file matching architecture
    # Pattern: ShopOS-{version}-mac-{arch}.dmg
    local url=$(echo "$release_json" | grep -o '"browser_download_url"[[:space:]]*:[[:space:]]*"[^"]*\.dmg"' | grep -i "${arch}" | head -1 | sed 's/.*"browser_download_url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

    # If no arch-specific DMG, try generic mac DMG
    if [[ -z "$url" ]]; then
        url=$(echo "$release_json" | grep -o '"browser_download_url"[[:space:]]*:[[:space:]]*"[^"]*mac[^"]*\.dmg"' | head -1 | sed 's/.*"browser_download_url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    fi

    # Fall back to zip if no DMG
    if [[ -z "$url" ]]; then
        url=$(echo "$release_json" | grep -o '"browser_download_url"[[:space:]]*:[[:space:]]*"[^"]*mac[^"]*\.zip"' | grep -i "${arch}" | head -1 | sed 's/.*"browser_download_url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    fi

    echo "$url"
}

# Download file with progress
download_file() {
    local url="$1"
    local output="$2"

    info "Downloading from: $url"
    curl -fSL --progress-bar -o "$output" "$url" || error "Failed to download file"
}

# Mount DMG and copy app
install_from_dmg() {
    local dmg_path="$1"
    local mount_point="/Volumes/${APP_NAME}-installer"

    info "Mounting DMG..."

    # Unmount if already mounted
    if [[ -d "$mount_point" ]]; then
        hdiutil detach "$mount_point" -quiet 2>/dev/null || true
    fi

    # Mount DMG
    hdiutil attach "$dmg_path" -mountpoint "$mount_point" -nobrowse -quiet || error "Failed to mount DMG"

    # Find .app in mounted volume
    local app_in_dmg=$(find "$mount_point" -maxdepth 1 -name "*.app" -type d | head -1)

    if [[ -z "$app_in_dmg" ]]; then
        hdiutil detach "$mount_point" -quiet
        error "Could not find .app in DMG"
    fi

    info "Installing ${APP_NAME}..."

    # Remove old version if exists
    if [[ -d "$APP_PATH" ]]; then
        rm -rf "$APP_PATH" || error "Failed to remove old version. Try running with sudo."
    fi

    # Copy new version
    cp -R "$app_in_dmg" "$INSTALL_DIR/" || error "Failed to copy app. Try running with sudo."

    # Unmount DMG
    hdiutil detach "$mount_point" -quiet

    success "App installed to ${APP_PATH}"
}

# Install from ZIP
install_from_zip() {
    local zip_path="$1"
    local temp_dir=$(mktemp -d)

    info "Extracting ZIP..."
    unzip -q "$zip_path" -d "$temp_dir" || error "Failed to extract ZIP"

    # Find .app in extracted contents
    local app_in_zip=$(find "$temp_dir" -maxdepth 2 -name "*.app" -type d | head -1)

    if [[ -z "$app_in_zip" ]]; then
        rm -rf "$temp_dir"
        error "Could not find .app in ZIP"
    fi

    info "Installing ${APP_NAME}..."

    # Remove old version if exists
    if [[ -d "$APP_PATH" ]]; then
        rm -rf "$APP_PATH" || error "Failed to remove old version. Try running with sudo."
    fi

    # Copy new version
    cp -R "$app_in_zip" "$INSTALL_DIR/" || error "Failed to copy app. Try running with sudo."

    # Cleanup
    rm -rf "$temp_dir"

    success "App installed to ${APP_PATH}"
}

# Clear quarantine attribute (needed for unsigned apps on macOS)
clear_quarantine() {
    info "Clearing macOS quarantine attribute..."
    xattr -cr "$APP_PATH" 2>/dev/null || warn "Could not clear quarantine. You may need to run: sudo xattr -cr '$APP_PATH'"
    success "Quarantine cleared - app is ready to run"
}

# Main installation flow
main() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}     ${APP_NAME} Installer${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""

    # Pre-flight checks
    check_macos

    local arch=$(detect_arch)
    info "Detected architecture: $arch"

    local installed_version=$(get_installed_version)
    local is_first_install=false

    if [[ "$installed_version" == "none" ]]; then
        is_first_install=true
        info "Fresh installation detected"
    else
        info "Currently installed version: $installed_version"
    fi

    # Fetch latest release
    info "Fetching latest release from GitHub..."
    local release_json=$(get_latest_release)

    if [[ -z "$release_json" ]]; then
        error "Failed to fetch release information from GitHub"
    fi

    local latest_version=$(get_release_version "$release_json")

    if [[ -z "$latest_version" ]]; then
        error "Could not determine latest version"
    fi

    info "Latest version: $latest_version"

    # Check if update is needed
    if [[ "$installed_version" == "$latest_version" ]]; then
        success "${APP_NAME} is already up to date (v${latest_version})"
        echo ""
        echo "To force reinstall, first remove the app:"
        echo "  rm -rf '${APP_PATH}'"
        echo "Then run this script again."
        exit 0
    fi

    # Get download URL
    local download_url=$(get_download_url "$release_json" "$arch")

    if [[ -z "$download_url" ]]; then
        error "Could not find download URL for your system (mac-${arch})"
    fi

    # Create temp directory for download
    local temp_dir=$(mktemp -d)
    local filename=$(basename "$download_url")
    local download_path="${temp_dir}/${filename}"

    # Download
    download_file "$download_url" "$download_path"

    # Install based on file type
    if [[ "$filename" == *.dmg ]]; then
        install_from_dmg "$download_path"
    elif [[ "$filename" == *.zip ]]; then
        install_from_zip "$download_path"
    else
        error "Unknown file format: $filename"
    fi

    # Cleanup download
    rm -rf "$temp_dir"

    # Clear quarantine on first install
    if $is_first_install; then
        clear_quarantine
    fi

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}     Installation Complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""

    if $is_first_install; then
        echo "You can now launch ${APP_NAME} from:"
        echo "  - Spotlight: Press Cmd+Space and type '${APP_NAME}'"
        echo "  - Finder: Go to /Applications and double-click ${APP_NAME}"
        echo ""
        echo "If you see a security warning, go to:"
        echo "  System Settings > Privacy & Security > Security"
        echo "  Click 'Open Anyway' next to the ${APP_NAME} message."
    else
        success "Updated from v${installed_version} to v${latest_version}"
    fi

    echo ""
}

# Run main function
main "$@"
