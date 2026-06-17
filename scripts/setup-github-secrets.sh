#!/bin/bash
# Setup GitHub Actions Secrets for auto-deploy
# Prerequisite: gh auth login (run once)
set -euo pipefail

REPO="tutusiji/ai-engineering-agent"
SERVER_IP="115.190.193.230"
SSH_KEY_PATH="${HOME}/.ssh/id_ed25519"

echo "🔐 Setting up GitHub Actions Secrets for $REPO..."
echo ""

# Verify gh auth
if ! gh auth status &>/dev/null; then
  echo "❌ gh not authenticated. Run: gh auth login"
  exit 1
fi

# Verify SSH key exists
if [ ! -f "$SSH_KEY_PATH" ]; then
  echo "❌ SSH key not found at $SSH_KEY_PATH"
  echo "   Generate one: ssh-keygen -t ed25519 -C 'github-actions'"
  exit 1
fi

echo "📋 Configuring secrets..."

# SSH Host
gh secret set SSH_HOST --body "$SERVER_IP" --repo "$REPO"
echo "  ✅ SSH_HOST"

# SSH User
gh secret set SSH_USER --body "root" --repo "$REPO"
echo "  ✅ SSH_USER"

# SSH Port
gh secret set SSH_PORT --body "22" --repo "$REPO"
echo "  ✅ SSH_PORT"

# SSH Private Key
gh secret set SSH_PRIVATE_KEY < "$SSH_KEY_PATH" --repo "$REPO"
echo "  ✅ SSH_PRIVATE_KEY"

# SSH Known Hosts
KNOWN_HOSTS=$(ssh-keyscan "$SERVER_IP" 2>/dev/null)
gh secret set SSH_KNOWN_HOSTS --body "$KNOWN_HOSTS" --repo "$REPO"
echo "  ✅ SSH_KNOWN_HOSTS"

echo ""
echo "🎉 All secrets configured! Try: git push origin main"
echo "   Check: https://github.com/$REPO/actions"
