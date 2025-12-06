#!/usr/bin/env bash
#
# Bash Command Validator Hook for Droid
#
# This PreToolUse hook validates bash commands before execution,
# blocking potentially dangerous operations and providing feedback.
#
# Exit codes:
#   0 - Allow the command
#   2 - Block the command (with feedback to Droid)
#
# Usage:
#   Register this script as a PreToolUse hook with matcher "Bash"
#

set -euo pipefail

# Read the JSON input from stdin
INPUT=$(cat)

# Extract the command using jq
COMMAND=$(printf '%s\n' "$INPUT" | jq -r '.tool_input.command // empty')

if [[ -z "$COMMAND" ]]; then
    exit 0
fi

# Define blocked patterns (customize these for your needs)
BLOCKED_PATTERNS=(
    # Dangerous file operations
    'rm -rf /'
    'rm -rf ~'
    'rm -rf [*]'
    'rm -rf /[*]'
    '> /dev/sda'
    'mkfs\.'
    'dd if=.* of=/dev/'
    
    # Fork bombs and resource exhaustion
    ':\(\)\{.*\}:'
    'fork bomb'
    
    # Privilege escalation without explicit approval
    'chmod 777'
    'chmod -R 777'
    
    # Network exfiltration patterns
    'curl .* \| bash'
    'wget .* \| bash'
    'curl .* \| sh'
    'wget .* \| sh'
    
    # Sensitive file access
    '/etc/shadow'
    '/etc/passwd'
    '\.ssh/id_'
    
    # History/credential manipulation
    'history -c'
    'export.*PASSWORD'
    'export.*SECRET'
    'export.*API_KEY'
)

# Define warning patterns (allow but notify)
WARNING_PATTERNS=(
    'sudo'
    'su -'
    'chmod'
    'chown'
    'kill -9'
    'pkill'
    'killall'
)

# Check for blocked patterns
for pattern in "${BLOCKED_PATTERNS[@]}"; do
    if printf '%s\n' "$COMMAND" | grep -qiE "$pattern"; then
        echo "BLOCKED: Command matches dangerous pattern: $pattern"
        echo "Command was: $COMMAND"
        echo ""
        echo "If this command is necessary, please modify it to be safer or request manual execution."
        exit 2
    fi
done

# Check for warning patterns (log but allow)
for pattern in "${WARNING_PATTERNS[@]}"; do
    if printf '%s\n' "$COMMAND" | grep -qiE "$pattern"; then
        echo "WARNING: Command uses potentially sensitive operation: $pattern" >&2
        # Continue execution but log the warning
    fi
done

# Command passed validation
exit 0
