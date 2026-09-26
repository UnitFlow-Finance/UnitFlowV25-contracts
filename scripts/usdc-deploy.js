const hre = require("hardhat");

async function main() {
  const ethers = hre.ethers;

  console.log("🔍 Checking Arc's system USDC ERC-20...");
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId);

  const usdcAddress = "0x3600000000000000000000000000000000000000";
  const usdc = new ethers.Contract(usdcAddress, [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
  ], ethers.provider);
  const [name, symbol, decimals] = await Promise.all([usdc.name(), usdc.symbol(), usdc.decimals()]);
  if (!new Set(["USDC", "USD Coin"]).has(name) || symbol !== "USDC" || decimals !== 6n) {
    throw new Error(`Unexpected Arc USDC metadata: ${name}/${symbol}/${decimals}`);
  }
  console.log("✅ Arc system USDC is available at", usdcAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
