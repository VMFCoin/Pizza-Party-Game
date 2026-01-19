#!/bin/bash

# =============================================================================
# $PIZZA Supply Migration Script
# =============================================================================
# Updates all token amount constants from 10M supply to 100B supply
#
# MULTIPLIER: 10,000x (to maintain same % of total supply)
#
# USAGE:
#   ./supply-migration.sh              # Dry run (shows what would change)
#   ./supply-migration.sh --execute    # Actually perform the changes
#
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   \$PIZZA Supply Migration Script${NC}"
echo -e "${BLUE}   10 Million → 100 Billion${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Parse arguments
DRY_RUN=true
if [[ "$1" == "--execute" ]]; then
    DRY_RUN=false
fi

if [[ "$DRY_RUN" == true ]]; then
    echo -e "${YELLOW}Mode:${NC} DRY RUN (no changes will be made)"
else
    echo -e "${GREEN}Mode:${NC} EXECUTE (files will be modified)"
fi
echo ""

# =============================================================================
# SMART CONTRACT CHANGES
# =============================================================================

STAKING_CONTRACT="$PROJECT_ROOT/foundry/src/PizzaStakingV1Upgradeable.sol"

echo -e "${CYAN}=== Smart Contract: PizzaStakingV1Upgradeable.sol ===${NC}"
echo ""

echo -e "${YELLOW}Changes to be made:${NC}"
echo ""
echo "  MIN_STAKE_FALLBACK:  100 PIZZA       →  10,000 PIZZA (use last entry as better fallback)"
echo "  MAX_STAKE:           1,000,000 PIZZA →  10,000,000,000 PIZZA (10% of 100B supply)"
echo "  TIER1_THRESHOLD:     50,000 PIZZA    →  500,000,000 PIZZA (0.5% of supply)"
echo "  TIER2_THRESHOLD:     200,000 PIZZA   →  2,000,000,000 PIZZA (2% of supply)"
echo "  TIER3_THRESHOLD:     500,000 PIZZA   →  5,000,000,000 PIZZA (5% of supply)"
echo ""

if [[ -f "$STAKING_CONTRACT" ]]; then
    echo -e "  ${GREEN}[FOUND]${NC} foundry/src/PizzaStakingV1Upgradeable.sol"
else
    echo -e "  ${RED}[MISSING]${NC} foundry/src/PizzaStakingV1Upgradeable.sol"
fi

echo ""

# =============================================================================
# FRONTEND CHANGES
# =============================================================================

STAKING_PAGE="$PROJECT_ROOT/app/components/StakingPage.tsx"

echo -e "${CYAN}=== Frontend: StakingPage.tsx ===${NC}"
echo ""

echo -e "${YELLOW}Changes to be made:${NC}"
echo ""
echo "  Tier 1 (Oven Operator):  50,000 PIZZA    →  500,000,000 PIZZA"
echo "  Tier 2 (Pie Boss):       200,000 PIZZA   →  2,000,000,000 PIZZA"
echo "  Tier 3 (Pizza Tycoon):   500,000 PIZZA   →  5,000,000,000 PIZZA"
echo "  MIN_STAKE_FALLBACK:      100 PIZZA       →  10,000 PIZZA"
echo "  _MAX_STAKE:              1,000,000 PIZZA →  10,000,000,000 PIZZA"
echo ""

if [[ -f "$STAKING_PAGE" ]]; then
    echo -e "  ${GREEN}[FOUND]${NC} app/components/StakingPage.tsx"
else
    echo -e "  ${RED}[MISSING]${NC} app/components/StakingPage.tsx"
fi

echo ""

# =============================================================================
# EXECUTE CHANGES
# =============================================================================

if [[ "$DRY_RUN" == false ]]; then
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}   EXECUTING SUPPLY MIGRATION${NC}"
    echo -e "${YELLOW}========================================${NC}"
    echo ""

    # Create backup
    BACKUP_DIR="$SCRIPT_DIR/backups/supply_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    echo -e "${BLUE}Creating backups in: $BACKUP_DIR${NC}"
    echo ""

    # Backup and update smart contract
    if [[ -f "$STAKING_CONTRACT" ]]; then
        cp "$STAKING_CONTRACT" "$BACKUP_DIR/PizzaStakingV1Upgradeable.sol"

        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS sed
            sed -i '' 's/MIN_STAKE_FALLBACK = 100 \* 1e18/MIN_STAKE_FALLBACK = 10_000 * 1e18/g' "$STAKING_CONTRACT"
            sed -i '' 's/MAX_STAKE = 1_000_000 \* 1e18/MAX_STAKE = 10_000_000_000 * 1e18/g' "$STAKING_CONTRACT"
            sed -i '' 's/TIER1_THRESHOLD = 50_000 \* 1e18/TIER1_THRESHOLD = 500_000_000 * 1e18/g' "$STAKING_CONTRACT"
            sed -i '' 's/TIER2_THRESHOLD = 200_000 \* 1e18/TIER2_THRESHOLD = 2_000_000_000 * 1e18/g' "$STAKING_CONTRACT"
            sed -i '' 's/TIER3_THRESHOLD = 500_000 \* 1e18/TIER3_THRESHOLD = 5_000_000_000 * 1e18/g' "$STAKING_CONTRACT"
        else
            # Linux sed
            sed -i 's/MIN_STAKE_FALLBACK = 100 \* 1e18/MIN_STAKE_FALLBACK = 1_000_000 * 1e18/g' "$STAKING_CONTRACT"
            sed -i 's/MAX_STAKE = 1_000_000 \* 1e18/MAX_STAKE = 10_000_000_000 * 1e18/g' "$STAKING_CONTRACT"
            sed -i 's/TIER1_THRESHOLD = 50_000 \* 1e18/TIER1_THRESHOLD = 500_000_000 * 1e18/g' "$STAKING_CONTRACT"
            sed -i 's/TIER2_THRESHOLD = 200_000 \* 1e18/TIER2_THRESHOLD = 2_000_000_000 * 1e18/g' "$STAKING_CONTRACT"
            sed -i 's/TIER3_THRESHOLD = 500_000 \* 1e18/TIER3_THRESHOLD = 5_000_000_000 * 1e18/g' "$STAKING_CONTRACT"
        fi

        echo -e "${GREEN}[UPDATED]${NC} PizzaStakingV1Upgradeable.sol"
    fi

    # Backup and update frontend
    if [[ -f "$STAKING_PAGE" ]]; then
        cp "$STAKING_PAGE" "$BACKUP_DIR/StakingPage.tsx"

        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS sed
            sed -i '' 's/minStake: 50_000,/minStake: 500_000_000,/g' "$STAKING_PAGE"
            sed -i '' 's/minStake: 200_000,/minStake: 2_000_000_000,/g' "$STAKING_PAGE"
            sed -i '' 's/minStake: 500_000,/minStake: 5_000_000_000,/g' "$STAKING_PAGE"
            sed -i '' 's/MIN_STAKE_FALLBACK = 100/MIN_STAKE_FALLBACK = 1_000_000/g' "$STAKING_PAGE"
            sed -i '' 's/_MAX_STAKE = 1_000_000/_MAX_STAKE = 10_000_000_000/g' "$STAKING_PAGE"
        else
            # Linux sed
            sed -i 's/minStake: 50_000,/minStake: 500_000_000,/g' "$STAKING_PAGE"
            sed -i 's/minStake: 200_000,/minStake: 2_000_000_000,/g' "$STAKING_PAGE"
            sed -i 's/minStake: 500_000,/minStake: 5_000_000_000,/g' "$STAKING_PAGE"
            sed -i 's/MIN_STAKE_FALLBACK = 100/MIN_STAKE_FALLBACK = 1_000_000/g' "$STAKING_PAGE"
            sed -i 's/_MAX_STAKE = 1_000_000/_MAX_STAKE = 10_000_000_000/g' "$STAKING_PAGE"
        fi

        echo -e "${GREEN}[UPDATED]${NC} StakingPage.tsx"
    fi

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}   SUPPLY MIGRATION COMPLETE${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "Backups saved to: $BACKUP_DIR"
    echo ""
    echo -e "${YELLOW}IMPORTANT NEXT STEPS:${NC}"
    echo "  1. Review the changes in the modified files"
    echo "  2. Run Foundry tests: cd foundry && forge test"
    echo "  3. Deploy new staking implementation and upgrade proxy"
    echo "  4. Deploy frontend changes"
    echo ""
    echo -e "${RED}NOTE: Smart contract constants require redeployment!${NC}"
    echo "  The staking contract uses 'constant' values, so you must:"
    echo "  1. Deploy a new implementation with updated constants"
    echo "  2. Upgrade the UUPS proxy to the new implementation"
else
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}   DRY RUN COMPLETE${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo "To execute the supply migration, run:"
    echo -e "${GREEN}  ./supply-migration.sh --execute${NC}"
    echo ""
    echo -e "${YELLOW}This will modify:${NC}"
    echo "  - foundry/src/PizzaStakingV1Upgradeable.sol (5 constants)"
    echo "  - app/components/StakingPage.tsx (5 values)"
fi
