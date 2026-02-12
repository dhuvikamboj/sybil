#!/bin/bash
# sybil WhatsApp Session Manager
# Usage: ./whatsapp-session.sh [command]
# Commands:
#   status   - Show session status
#   clear    - Clear current session (requires new QR scan)
#   backup   - Backup session to a tarball
#   restore  - Restore session from a tarball
#   path     - Show session directory path

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Import settings
if [ -f "$PROJECT_ROOT/.env" ]; then
    # Source only variable assignments, skip comments and empty lines
    while IFS= read -r line || [ -n "$line" ]; do
        if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
            export "$line"
        fi
    done < "$PROJECT_ROOT/.env"
fi

# Set defaults
sybil_DIR="${HOME}/.sybil"
WHATSAPP_DIR="$sybil_DIR/whatsapp-session"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    echo "sybil WhatsApp Session Manager"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  status   - Show session status"
    echo "  clear    - Clear current session (requires new QR scan)"
    echo "  backup   - Backup session to a tarball"
    echo "  restore  - Restore session from a tarball"
    echo "  path     - Show session directory path"
    echo ""
    echo "Session Location: $WHATSAPP_DIR"
    exit 0
}

cmd_status() {
    echo "WhatsApp Session Status"
    echo "========================"
    echo ""

    if [ -d "$WHATSAPP_DIR" ]; then
        print_status "Session directory exists: $WHATSAPP_DIR"

        # Count files
        file_count=$(find "$WHATSAPP_DIR" -type f 2>/dev/null | wc -l)
        print_status "Session files: $file_count"

        # Check for key session files
        if [ -f "$WHATSAPP_DIR/Default/Local Storage/leveldb" ]; then
            print_status "Session storage found"
        fi

        # Show last modified
        if [ "$file_count" -gt 0 ]; then
            last_modified=$(find "$WHATSAPP_DIR" -type f -exec stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" {} + 2>/dev/null | sort -r | head -1)
            if [ -z "$last_modified" ]; then
                last_modified=$(find "$WHATSAPP_DIR" -type f -printf '%TY-%Tm-%Td %TH:%TM:%TS\n' 2>/dev/null | sort -r | head -1)
            fi
            if [ -n "$last_modified" ]; then
                print_status "Last modified: $last_modified"
            fi
        fi
    else
        print_warning "Session directory does not exist"
        print_status "Run the bot and initialize WhatsApp to create session"
    fi
    echo ""
    print_status "To check session in bot: /whatsapp"
}

cmd_path() {
    echo "$WHATSAPP_DIR"
}

cmd_clear() {
    echo "Clearing WhatsApp Session"
    echo "=========================="
    echo ""
    echo "This will delete your current WhatsApp session."
    echo "You will need to scan a new QR code to reconnect."
    echo ""
    read -p "Are you sure you want to continue? (y/N): " confirm

    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo "Aborted."
        exit 0
    fi

    if [ -d "$WHATSAPP_DIR" ]; then
        rm -rf "$WHATSAPP_DIR"
        print_status "Session cleared successfully"
        print_status "Restart the bot and scan a new QR code"
    else
        print_warning "No session directory found"
    fi
}

cmd_backup() {
    if [ ! -d "$WHATSAPP_DIR" ]; then
        print_error "No session directory found to backup"
        exit 1
    fi

    backup_file="$sybil_DIR/whatsapp-backup-$(date +%Y%m%d-%H%M%S).tar.gz"

    print_status "Backing up session to: $backup_file"

    # Create parent directory if needed
    mkdir -p "$sybil_DIR"

    tar -czf "$backup_file" -C "$sybil_DIR" whatsapp-session

    print_status "Backup completed: $backup_file"
    print_status "Backup size: $(du -h "$backup_file" | cut -f1)"
}

cmd_restore() {
    if [ -z "$2" ]; then
        print_error "Please provide a backup file to restore"
        echo "Usage: $0 restore <backup-file.tar.gz>"
        exit 1
    fi

    backup_file="$2"

    if [ ! -f "$backup_file" ]; then
        print_error "Backup file not found: $backup_file"
        exit 1
    fi

    print_status "Restoring session from: $backup_file"

    # Clear existing session
    if [ -d "$WHATSAPP_DIR" ]; then
        rm -rf "$WHATSAPP_DIR"
    fi

    # Extract backup
    tar -xzf "$backup_file" -C "$sybil_DIR"

    print_status "Session restored successfully"
    print_status "Restart the bot to use the restored session"
}

# Main command handler
case "${1:-status}" in
    status)
        cmd_status
        ;;
    path)
        cmd_path
        ;;
    clear)
        cmd_clear
        ;;
    backup)
        cmd_backup
        ;;
    restore)
        cmd_restore "$@"
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        show_help
        ;;
esac
