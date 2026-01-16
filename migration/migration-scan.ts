/**
 * $PIZZA Token Migration Scanner
 *
 * This script scans the entire codebase to find all references to the
 * current PIZZA token address and generates a detailed report.
 *
 * USAGE:
 *   npx ts-node migration/migration-scan.ts
 *   # or
 *   bun run migration/migration-scan.ts
 */

import * as fs from "fs";
import * as path from "path";

// Current token address
const OLD_TOKEN_ADDRESS = "0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69";

// Directories to skip
const SKIP_DIRS = [
  "node_modules",
  ".next",
  ".git",
  "out",
  "cache",
  "artifacts",
  "migration/backups",
];

// File extensions to scan
const SCAN_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".sol",
  ".json",
  ".env",
  ".md",
];

interface TokenReference {
  file: string;
  line: number;
  content: string;
  type: "frontend" | "backend" | "contract" | "config" | "docs";
}

function getFileType(
  filePath: string
): "frontend" | "backend" | "contract" | "config" | "docs" {
  if (filePath.includes("/foundry/") || filePath.endsWith(".sol")) {
    return "contract";
  }
  if (filePath.includes("/api/")) {
    return "backend";
  }
  if (filePath.endsWith(".json") || filePath.includes(".env")) {
    return "config";
  }
  if (filePath.endsWith(".md")) {
    return "docs";
  }
  return "frontend";
}

function scanFile(filePath: string): TokenReference[] {
  const references: TokenReference[] = [];

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    lines.forEach((line, index) => {
      if (line.toLowerCase().includes(OLD_TOKEN_ADDRESS.toLowerCase())) {
        references.push({
          file: filePath,
          line: index + 1,
          content: line.trim().substring(0, 200),
          type: getFileType(filePath),
        });
      }
    });
  } catch (error) {
    // Skip files that can't be read
  }

  return references;
}

function scanDirectory(dirPath: string): TokenReference[] {
  const references: TokenReference[] = [];

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.includes(entry.name)) {
          references.push(...scanDirectory(fullPath));
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (SCAN_EXTENSIONS.includes(ext)) {
          references.push(...scanFile(fullPath));
        }
      }
    }
  } catch (error) {
    // Skip directories that can't be read
  }

  return references;
}

function generateReport(references: TokenReference[]): void {
  console.log("\n========================================");
  console.log("   $PIZZA Token Migration Scan Report");
  console.log("========================================\n");
  console.log(`Scanning for: ${OLD_TOKEN_ADDRESS}\n`);
  console.log(`Total references found: ${references.length}\n`);

  // Group by type
  const byType = references.reduce(
    (acc, ref) => {
      if (!acc[ref.type]) acc[ref.type] = [];
      acc[ref.type].push(ref);
      return acc;
    },
    {} as Record<string, TokenReference[]>
  );

  // Print summary
  console.log("Summary by Type:");
  console.log("-".repeat(40));
  for (const [type, refs] of Object.entries(byType)) {
    console.log(`  ${type.toUpperCase()}: ${refs.length} reference(s)`);
  }
  console.log("");

  // Detailed report by category
  const categories = ["contract", "frontend", "backend", "config", "docs"];

  for (const category of categories) {
    const refs = byType[category];
    if (!refs || refs.length === 0) continue;

    console.log(`\n${"=".repeat(50)}`);
    console.log(`${category.toUpperCase()} FILES`);
    console.log(`${"=".repeat(50)}`);

    // Group by file
    const byFile = refs.reduce(
      (acc, ref) => {
        if (!acc[ref.file]) acc[ref.file] = [];
        acc[ref.file].push(ref);
        return acc;
      },
      {} as Record<string, TokenReference[]>
    );

    for (const [file, fileRefs] of Object.entries(byFile)) {
      // Make path relative to project root
      const relativePath = file.replace(process.cwd() + "/", "");
      console.log(`\n  File: ${relativePath}`);
      console.log(`  ${"─".repeat(46)}`);

      for (const ref of fileRefs) {
        console.log(`    Line ${ref.line}: ${ref.content.substring(0, 80)}...`);
      }
    }
  }

  // Migration action items
  console.log("\n\n========================================");
  console.log("   MIGRATION ACTION ITEMS");
  console.log("========================================\n");

  if (byType["contract"]?.length > 0) {
    console.log("SMART CONTRACTS (Highest Priority):");
    console.log("  - Contracts require admin function calls OR redeployment");
    console.log("  - Check for adminSetPizzaToken() or similar functions");
    console.log("  - Verify burn() function exists on new token contract");
    console.log("");
  }

  if (byType["frontend"]?.length > 0 || byType["backend"]?.length > 0) {
    console.log("CODE FILES:");
    console.log("  - Run: ./migration/token-migration.sh --execute <NEW_ADDRESS>");
    console.log("  - This will update all hardcoded addresses in TS/TSX files");
    console.log("");
  }

  if (byType["config"]?.length > 0) {
    console.log("CONFIG FILES:");
    console.log("  - Manually review and update configuration files");
    console.log("  - Check environment variables");
    console.log("");
  }

  console.log("\nAdditional Checks:");
  console.log("  [ ] Verify new token has 18 decimals");
  console.log("  [ ] Verify burn() function signature matches IBurnable interface");
  console.log("  [ ] Update EIP-712 permit domain if token name changed");
  console.log("  [ ] Ensure liquidity exists on DEX for price feeds");
  console.log("  [ ] Fund treasury wallet with new tokens");
  console.log("  [ ] Fund staking rewards wallet with new tokens");
  console.log(
    "  [ ] Review stake limits (currently 1M PIZZA max per user)\n"
  );
}

// Main execution
const projectRoot = process.cwd();
console.log(`Scanning project: ${projectRoot}`);

const references = scanDirectory(projectRoot);
generateReport(references);

// Save report to file
const reportPath = path.join(projectRoot, "migration", "scan-report.txt");
const originalLog = console.log;
let reportContent = "";
console.log = (...args) => {
  reportContent += args.join(" ") + "\n";
  originalLog(...args);
};

// Re-run to capture output
generateReport(references);

fs.writeFileSync(reportPath, reportContent);
console.log = originalLog;
console.log(`\nReport saved to: ${reportPath}`);
