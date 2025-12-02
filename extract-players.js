const fs = require("fs");

// Read the CSV file
const csv = fs.readFileSync("export-0x5432260CfcAc5C45773449089EA603a6e5Dc7DA7.csv", "utf-8");
const lines = csv.split("\n");

// Extract unique player addresses from the "From" column (index 5)
const players = new Set();
lines.forEach((line, index) => {
  if (index === 0) return; // Skip header
  if (!line.trim()) return;
  
  const parts = line.split(",");
  if (parts.length > 5) {
    const address = parts[5].trim().replace(/"/g, "");
    // Check if it's a valid address format
    if (address.startsWith("0x") && address.length === 42) {
      players.add(address);
    }
  }
});

const playerArray = Array.from(players).sort();
console.log(`Found ${playerArray.length} unique players\n`);
console.log("Player addresses:");
playerArray.forEach((p) => console.log(`  ${p}`));

console.log("\n📋 Copy this array into migrate-stats.ts:\n");
console.log("const playerAddresses = [");
playerArray.forEach((p) => console.log(`  "${p}",`));
console.log("];");

// Also save to file for easy reference
fs.writeFileSync("players-to-migrate.json", JSON.stringify(playerArray, null, 2));
console.log("\n✅ Saved to players-to-migrate.json");
