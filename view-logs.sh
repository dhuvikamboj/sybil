#!/bin/bash
# sybil Log Viewer
# Usage: ./view-logs.sh [options]
# Options:
#   -c, --category <category>  Filter by category (TELEGRAM, WHATSAPP, WEB_TOOL, AGENT, AUTO_REPLY, etc.)
#   -n, --number <count>       Show last N lines (default: 50)
#   -f, --follow               Follow the log file in real-time
#   -s, --search <query>       Search for a keyword
#   -h, --help                 Show this help message

LOG_FILE="./logs/sybil.log"
LINES=50
FOLLOW=false
CATEGORY=""
SEARCH=""

show_help() {
    echo "sybil Log Viewer"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -c, --category <category>  Filter by category (TELEGRAM, WHATSAPP, WEB_TOOL, AGENT, AUTO_REPLY, etc.)"
    echo "  -n, --number <count>       Show last N lines (default: 50)"
    echo "  -f, --follow               Follow the log file in real-time"
    echo "  -s, --search <query>       Search for a keyword"
    echo "  -h, --help                 Show this help message"
    echo ""
    echo "Categories:"
    echo "  TELEGRAM   - Telegram bot messages and commands"
    echo "  WHATSAPP   - WhatsApp connection and message events"
    echo "  WEB_TOOL   - Web browsing tools (search, fetch, extract)"
    echo "  AGENT      - Agent decisions and responses"
    echo "  AUTO_REPLY - Auto-reply events and decisions"
    echo "  WORKFLOW   - Workflow execution"
    echo "  MEMORY     - Memory operations"
    echo "  APP        - Application lifecycle"
    exit 0
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -c|--category)
                CATEGORY="$2"
                shift 2
                ;;
            -n|--number)
                LINES="$2"
                shift 2
                ;;
            -f|--follow)
                FOLLOW=true
                shift
                ;;
            -s|--search)
                SEARCH="$2"
                shift 2
                ;;
            -h|--help)
                show_help
                ;;
            *)
                echo "Unknown option: $1"
                show_help
                ;;
        esac
    done
}

parse_args "$@"

# Check if log file exists
if [ ! -f "$LOG_FILE" ]; then
    echo "Error: Log file not found at $LOG_FILE"
    echo "Make sure sybil is running and the logs directory exists."
    exit 1
fi

# Build the command
CMD="tail -n $LINES $LOG_FILE"

# Add category filter
if [ -n "$CATEGORY" ]; then
    CMD="$CMD | grep \"$CATEGORY\""
fi

# Add search filter
if [ -n "$SEARCH" ]; then
    if [ -n "$CATEGORY" ]; then
        CMD="$CMD | grep \"$SEARCH\""
    else
        CMD="$CMD | grep \"$SEARCH\""
    fi
fi

# Add colorized output
if [ "$FOLLOW" = true ]; then
    CMD="$CMD | while IFS= read -r line; do
        if echo \"\$line\" | grep -q '\[ERROR\]'; then
            echo \"\$line\" | sed 's/\[ERROR\]/\x1b[31m[ERROR]\x1b[0m/'
        elif echo \"\$line\" | grep -q '\[WARN \]'; then
            echo \"\$line\" | sed 's/\[WARN \]/\x1b[33m[WARN]\x1b[0m/'
        elif echo \"\$line\" | grep -q '\[DEBUG\]'; then
            echo \"\$line\" | sed 's/\[DEBUG\]/\x1b[90m[DEBUG]\x1b[0m/'
        elif echo \"\$line\" | grep -q '\[INFO \]'; then
            echo \"\$line\" | sed 's/\[INFO \]/\x1b[32m[INFO]\x1b[0m/'
        else
            echo \"\$line\"
        fi
    done"
    CMD="$CMD | tail -f"
fi

# Execute
eval "$CMD"
