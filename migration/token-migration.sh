#!/bin/bash

# =============================================================================
# $PIZZA Token Migration Script
# =============================================================================
# This script updates all hardcoded token addresses in the codebase.
#
# USAGE:
#   ./token-migration.sh                          # Dry run (shows what would change)
#   ./token-migration.sh --execute NEW_ADDRESS    # Actually perform the migration
#
# EXAMPLE:
#   ./token-migration.sh --execute 0x1234567890abcdef1234567890abcdef12345678
#
# =============================================================================

set -e

# Current token address (DO NOT CHANGE THIS - it's what we're searching for)
# Note: We search case-insensitively since address appears in different cases
OLD_TOKEN_ADDRESS="0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69"
OLD_TOKEN_LOWERCASE="0xbd0e3768b9a7c3d53e7b92edc4c38728e2fa9b69"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   \$PIZZA Token Migration Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Parse arguments
DRY_RUN=true
NEW_TOKEN_ADDRESS=""

if [[ "$1" == "--execute" ]]; then
    DRY_RUN=false
    NEW_TOKEN_ADDRESS="$2"

    if [[ -z "$NEW_TOKEN_ADDRESS" ]]; then
        echo -e "${RED}ERROR: --execute requires a new token address${NC}"
        echo "Usage: ./token-migration.sh --execute 0x..."
        exit 1
    fi

    # Validate address format
    if [[ ! "$NEW_TOKEN_ADDRESS" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
        echo -e "${RED}ERROR: Invalid Ethereum address format${NC}"
        echo "Address must be 42 characters starting with 0x"
        exit 1
    fi
fi

echo -e "${YELLOW}Current Token Address:${NC} $OLD_TOKEN_ADDRESS"
if [[ "$DRY_RUN" == true ]]; then
    echo -e "${YELLOW}Mode:${NC} DRY RUN (no changes will be made)"
else
    echo -e "${GREEN}New Token Address:${NC} $NEW_TOKEN_ADDRESS"
    echo -e "${YELLOW}Mode:${NC} EXECUTE (files will be modified)"
fi
echo ""

# Files to update (frontend/backend - the main runtime code)
FILES_TO_UPDATE=(
    "app/lib/constants/index.tsx"
    "app/api/cron/settle-game/route.ts"
    "app/api/cron/settle-weekly/route.ts"
    "app/api/price/route.ts"
    "app/components/game/index.tsx"
)

# Solidity deployment scripts (update for future deployments, not runtime critical)
SOLIDITY_SCRIPTS=(
    "foundry/script/DeployPizzaStaking.s.sol"
    "foundry/script/DeployV2System.s.sol"
    "foundry/script/AddToDailyJackpot.s.sol"
    "foundry/script/UpgradeStakingWithWallet.s.sol"
    "foundry/script/UpgradeFixPizzaToken.s.sol"
    "foundry/script/MigratePizzaToken.s.sol"
)

# Test files (optional - only needed if running tests)
TEST_FILES=(
    "foundry/test/PizzaStakingComprehensive.t.sol"
    "foundry/test/PizzaStakingSecurityTest.t.sol"
    "foundry/test/PizzaStakingEdgeCases.t.sol"
)

echo -e "${BLUE}Files that will be updated:${NC}"
echo ""

# Check each file (case-insensitive search)
for file in "${FILES_TO_UPDATE[@]}"; do
    filepath="$PROJECT_ROOT/$file"
    if [[ -f "$filepath" ]]; then
        # Count occurrences (case-insensitive)
        count=$(grep -ci "$OLD_TOKEN_ADDRESS" "$filepath" 2>/dev/null || echo "0")
        if [[ "$count" -gt 0 ]]; then
            echo -e "  ${GREEN}[FOUND]${NC} $file ($count occurrence(s))"

            # Show the lines that will be changed
            echo -e "    ${YELLOW}Lines containing old address:${NC}"
            grep -ni "$OLD_TOKEN_ADDRESS" "$filepath" | while read -r line; do
                echo "      $line"
            done
            echo ""
        else
            echo -e "  ${YELLOW}[SKIP]${NC} $file (no occurrences found)"
        fi
    else
        echo -e "  ${RED}[MISSING]${NC} $file"
    fi
done

echo ""
echo -e "${BLUE}Solidity deployment scripts (will also be updated):${NC}"
for file in "${SOLIDITY_SCRIPTS[@]}"; do
    filepath="$PROJECT_ROOT/$file"
    if [[ -f "$filepath" ]]; then
        count=$(grep -c "$OLD_TOKEN_ADDRESS" "$filepath" 2>/dev/null || echo "0")
        if [[ "$count" -gt 0 ]]; then
            echo -e "  ${GREEN}[FOUND]${NC} $file ($count occurrence(s))"
        fi
    fi
done

echo ""
echo -e "${BLUE}Test files (will also be updated):${NC}"
for file in "${TEST_FILES[@]}"; do
    filepath="$PROJECT_ROOT/$file"
    if [[ -f "$filepath" ]]; then
        count=$(grep -c "$OLD_TOKEN_ADDRESS" "$filepath" 2>/dev/null || echo "0")
        if [[ "$count" -gt 0 ]]; then
            echo -e "  ${GREEN}[FOUND]${NC} $file ($count occurrence(s))"
        fi
    fi
done

echo ""

# Additional search for any missed occurrences (case-insensitive)
echo -e "${BLUE}Scanning entire codebase for additional references...${NC}"
additional=$(grep -ri --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.sol" \
    -l "$OLD_TOKEN_ADDRESS" "$PROJECT_ROOT" 2>/dev/null | \
    grep -v "node_modules" | \
    grep -v ".next" | \
    grep -v "migration/" || true)

if [[ -n "$additional" ]]; then
    echo -e "${YELLOW}Additional files found with token address:${NC}"
    echo "$additional" | while read -r file; do
        relpath="${file#$PROJECT_ROOT/}"
        echo "  - $relpath"
    done
fi

echo ""

# Execute if not dry run
if [[ "$DRY_RUN" == false ]]; then
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}   EXECUTING MIGRATION${NC}"
    echo -e "${YELLOW}========================================${NC}"
    echo ""

    # Create backup
    BACKUP_DIR="$SCRIPT_DIR/backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    echo -e "${BLUE}Creating backups in: $BACKUP_DIR${NC}"

    # Update all file categories
    ALL_FILES=("${FILES_TO_UPDATE[@]}" "${SOLIDITY_SCRIPTS[@]}" "${TEST_FILES[@]}")

    for file in "${ALL_FILES[@]}"; do
        filepath="$PROJECT_ROOT/$file"
        if [[ -f "$filepath" ]]; then
            # Check if file contains old address (case-insensitive)
            if grep -qi "$OLD_TOKEN_ADDRESS" "$filepath" 2>/dev/null; then
                # Create directory structure in backup
                mkdir -p "$BACKUP_DIR/$(dirname "$file")"
                cp "$filepath" "$BACKUP_DIR/$file"

                # Perform replacement (both cases)
                if [[ "$OSTYPE" == "darwin"* ]]; then
                    # macOS - replace both checksum and lowercase versions
                    sed -i '' "s/$OLD_TOKEN_ADDRESS/$NEW_TOKEN_ADDRESS/g" "$filepath"
                    sed -i '' "s/$OLD_TOKEN_LOWERCASE/$NEW_TOKEN_ADDRESS/g" "$filepath"
                else
                    # Linux - replace both checksum and lowercase versions
                    sed -i "s/$OLD_TOKEN_ADDRESS/$NEW_TOKEN_ADDRESS/g" "$filepath"
                    sed -i "s/$OLD_TOKEN_LOWERCASE/$NEW_TOKEN_ADDRESS/g" "$filepath"
                fi

                echo -e "${GREEN}[UPDATED]${NC} $file"
            fi
        fi
    done

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}   MIGRATION COMPLETE${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "Backups saved to: $BACKUP_DIR"
    echo ""
    echo -e "${YELLOW}IMPORTANT: Don't forget to:${NC}"
    echo "  1. Update smart contracts via admin functions or redeployment"
    echo "  2. Update EIP-712 permit domain if token name changed"
    echo "  3. Test all functionality before deploying to production"
    echo "  4. Verify price feeds work for new token address"
else
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}   DRY RUN COMPLETE${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo "To execute the migration, run:"
    echo -e "${GREEN}  ./token-migration.sh --execute <NEW_TOKEN_ADDRESS>${NC}"
    echo ""
    echo "Example:"
    echo "  ./token-migration.sh --execute 0x1234567890abcdef1234567890abcdef12345678"
fi
