#!/usr/bin/env python3
"""
Create Standard JSON Input for BaseScan verification
This includes Via IR settings which are required for this contract
"""

import json
import os

# Read the source files
sources = {}
base_path = "foundry/src"

# Main contract
with open(f"{base_path}/PizzaParty.sol", "r") as f:
    sources["foundry/src/PizzaParty.sol"] = {"content": f.read()}

# OpenZeppelin contracts - include all dependencies
oz_paths = [
    "oz/access/Ownable.sol",
    "oz/security/ReentrancyGuard.sol",  # Wrapper
    "oz/utils/ReentrancyGuard.sol",     # Implementation
    "oz/token/ERC20/ERC20.sol",
    "oz/token/ERC20/IERC20.sol",
    "oz/token/ERC20/extensions/IERC20Metadata.sol",
    "oz/token/ERC20/extensions/IERC20Permit.sol",
    "oz/token/ERC20/utils/SafeERC20.sol",
    "oz/utils/Context.sol",
    "oz/utils/Address.sol",
    "oz/utils/Errors.sol",
    "oz/interfaces/IERC1363.sol",
    "oz/interfaces/IERC165.sol",
    "oz/interfaces/draft-IERC6093.sol",
    "oz/utils/introspection/IERC165.sol",
]

for path in oz_paths:
    full_path = f"{base_path}/{path}"
    if os.path.exists(full_path):
        with open(full_path, "r") as f:
            # Key files under the remapped path (foundry/src/oz/...)
            # This matches what the compiler expects after applying the remapping
            contract_key = f"foundry/src/{path}"
            sources[contract_key] = {"content": f.read()}

# Create Standard JSON Input
# Match EXACTLY what was used during deployment (from build artifact)
standard_json = {
    "language": "Solidity",
    "sources": sources,
    "settings": {
        "remappings": [
            "@chainlink/=node_modules/rooster-battle-game/Documents/Pizza-Party-backup/node_modules/@chainlink/",
            "@eth-optimism/=node_modules/rooster-battle-game/Downloads/Pizza-Party-UI-main/node_modules/@chainlink/contracts/node_modules/@eth-optimism/",
            "@openzeppelin/contracts/=foundry/src/oz/",  # CRITICAL - Must match deployment
            "ds-test/=node_modules/rooster-battle-game/Downloads/Ve-governance-script-contracts-main/lib/solmate/lib/ds-test/",
            "ens-contracts/=node_modules/rooster-battle-game/Downloads/Ve-governance-script-contracts-main/lib/ens-contracts/",
            "erc4626-tests/=node_modules/rooster-battle-game/Downloads/Ve-governance-script-contracts-main/lib/openzeppelin-contracts-upgradeable/lib/erc4626-tests/",
            "eth-gas-reporter/=node_modules/rooster-battle-game/Documents/Pizza-Party-backup/node_modules/eth-gas-reporter/",
            "forge-std/=foundry/lib/forge-std/src/",
            "halmos-cheatcodes/=node_modules/rooster-battle-game/Downloads/vmf_staking/lib/openzeppelin-contracts/lib/halmos-cheatcodes/",
            "hardhat/=node_modules/hardhat/",
            "openzeppelin-contracts-upgradeable/=node_modules/rooster-battle-game/Downloads/Ve-governance-script-contracts-main/lib/openzeppelin-contracts-upgradeable/",
            "openzeppelin-contracts/=node_modules/rooster-battle-game/Downloads/Ve-governance-script-contracts-main/lib/openzeppelin-contracts/",
            "openzeppelin-foundry-upgrades/=node_modules/rooster-battle-game/Downloads/Ve-governance-script-contracts-main/lib/openzeppelin-foundry-upgrades/",
            "osx/=node_modules/rooster-battle-game/Downloads/Ve-governance-script-contracts-main/lib/osx/",
            "prb-math/=node_modules/rooster-battle-game/Downloads/vmf_staking/lib/prb-math/",
            "rooster-battle-game/=node_modules/rooster-battle-game/",
            "solady/=node_modules/rooster-battle-game/Documents/VMF-Start Clone/coin-contracts/lib/solady/",
            "solmate/=node_modules/rooster-battle-game/Downloads/Ve-governance-script-contracts-main/lib/solmate/"
        ],
        "optimizer": {
            "enabled": True,
            "runs": 200
        },
        "viaIR": True,  # CRITICAL - Must match deployment
        "evmVersion": "shanghai",
        "metadata": {
            "bytecodeHash": "ipfs"  # Match deployment - no useLiteralContent or appendCBOR
        },
        "outputSelection": {
            "*": {
                "*": [
                    "abi",
                    "evm.bytecode.object",
                    "evm.deployedBytecode.object",
                    "evm.methodIdentifiers"
                ]
            }
        }
    }
}

# Write to file
with open("standard_json_input.json", "w") as f:
    json.dump(standard_json, f, indent=2)

print("✅ Standard JSON Input created: standard_json_input.json")
print(f"   Sources: {len(sources)} files")
print(f"   Via IR: {standard_json['settings']['viaIR']}")
print(f"   Optimizer: {standard_json['settings']['optimizer']['enabled']} ({standard_json['settings']['optimizer']['runs']} runs)")
