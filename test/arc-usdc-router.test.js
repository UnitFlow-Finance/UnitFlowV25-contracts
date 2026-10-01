const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployRouters } = require("../scripts/deploy-routers-existing-factory");

describe("Arc ERC-20 USDC routers", function () {
  const MAX = ethers.MaxUint256;
  const TAX_SUPPLY = ethers.parseEther("1000000");
  const USDC_SUPPLY = ethers.parseUnits("1000000", 6);
  const TAX_LIQUIDITY = ethers.parseEther("10000");
  const USDC_LIQUIDITY = ethers.parseUnits("10000", 6);

  async function deployFixture() {
    const [owner, trader, collector] = await ethers.getSigners();
    const USDC = await ethers.getContractFactory("USDC");
    const usdc = await USDC.deploy(USDC_SUPPLY);
    const TaxToken = await ethers.getContractFactory("TaxToken");
    const taxToken = await TaxToken.deploy(TAX_SUPPLY, 1000, collector.address);
    const Factory = await ethers.getContractFactory("UnitFlowV25Factory");
    const factory = await Factory.deploy(owner.address);
    const LiquidityRouter = await ethers.getContractFactory("UnitFlowV25LiquidityRouter");
    const liquidityRouter = await LiquidityRouter.deploy(await factory.getAddress(), await usdc.getAddress());
    const SwapRouter = await ethers.getContractFactory("UnitFlowV25SwapRouter");
    const swapRouter = await SwapRouter.deploy(await factory.getAddress(), await usdc.getAddress());

    await taxToken.setTaxExempt(await liquidityRouter.getAddress(), true);
    await taxToken.approve(await liquidityRouter.getAddress(), MAX);
    await usdc.approve(await liquidityRouter.getAddress(), MAX);
    await liquidityRouter.addLiquidityUSDC(
      await taxToken.getAddress(), TAX_LIQUIDITY, USDC_LIQUIDITY, TAX_LIQUIDITY, USDC_LIQUIDITY,
      owner.address, MAX
    );

    const pairAddress = await factory.getPair(await taxToken.getAddress(), await usdc.getAddress());
    const pair = await ethers.getContractAt("UnitFlowV25Pair", pairAddress);
    return { owner, trader, collector, usdc, taxToken, factory, liquidityRouter, swapRouter, pair };
  }

  it("adds ERC-20 USDC liquidity without taxing a whitelisted liquidity router", async function () {
    const { collector, usdc, taxToken, liquidityRouter, pair } = await deployFixture();
    expect(await liquidityRouter.USDC()).to.equal(await usdc.getAddress());
    expect(await taxToken.balanceOf(collector.address)).to.equal(0);
    expect(await pair.balanceOf((await ethers.getSigners())[0].address)).to.be.gt(0);
    expect(await usdc.balanceOf(await pair.getAddress())).to.equal(USDC_LIQUIDITY);
    expect(await taxToken.balanceOf(await pair.getAddress())).to.equal(TAX_LIQUIDITY);
  });

  it("mediates fee-on-transfer liquidity through the router in both directions", async function () {
    const [owner, provider, collector] = await ethers.getSigners();
    const USDC = await ethers.getContractFactory("USDC");
    const usdc = await USDC.deploy(USDC_SUPPLY);
    const TaxToken = await ethers.getContractFactory("TaxToken");
    const taxToken = await TaxToken.deploy(TAX_SUPPLY, 1000, collector.address);
    const Factory = await ethers.getContractFactory("UnitFlowV25Factory");
    const factory = await Factory.deploy(owner.address);
    const Router = await ethers.getContractFactory("UnitFlowV25LiquidityRouter");
    const router = await Router.deploy(await factory.getAddress(), await usdc.getAddress());
    const routerAddress = await router.getAddress();

    await taxToken.transfer(provider.address, TAX_LIQUIDITY);
    await usdc.transfer(provider.address, USDC_LIQUIDITY);
    await taxToken.connect(provider).approve(routerAddress, TAX_LIQUIDITY);
    await usdc.connect(provider).approve(routerAddress, USDC_LIQUIDITY);

    const strayTax = ethers.parseEther("100");
    const strayUSDC = ethers.parseUnits("7", 6);
    await taxToken.transfer(routerAddress, strayTax);
    await usdc.transfer(routerAddress, strayUSDC);

    const afterFirstFee = TAX_LIQUIDITY - TAX_LIQUIDITY / 10n;
    const actualTaxDeposit = afterFirstFee - afterFirstFee / 10n;
    const result = await router.connect(provider).addLiquidityUSDCSupportingFeeOnTransferTokens.staticCall(
      await taxToken.getAddress(), TAX_LIQUIDITY, USDC_LIQUIDITY, actualTaxDeposit, USDC_LIQUIDITY,
      provider.address, MAX
    );
    expect(result[0]).to.equal(actualTaxDeposit);
    expect(result[1]).to.equal(USDC_LIQUIDITY);

    const addTransaction = await router.connect(provider).addLiquidityUSDCSupportingFeeOnTransferTokens(
      await taxToken.getAddress(), TAX_LIQUIDITY, USDC_LIQUIDITY, actualTaxDeposit, USDC_LIQUIDITY,
      provider.address, MAX
    );
    const addReceipt = await addTransaction.wait();

    const pairAddress = await factory.getPair(await taxToken.getAddress(), await usdc.getAddress());
    const pair = await ethers.getContractAt("UnitFlowV25Pair", pairAddress);
    const taxTokenAddress = await taxToken.getAddress();
    const addTransfers = addReceipt.logs
      .filter((log) => log.address === taxTokenAddress)
      .map((log) => taxToken.interface.parseLog(log))
      .filter((log) => log && log.name === "Transfer");
    expect(addTransfers.some((log) =>
      log.args.from === provider.address && log.args.to === routerAddress && log.args.value === afterFirstFee
    )).to.equal(true);
    expect(addTransfers.some((log) =>
      log.args.from === routerAddress && log.args.to === pairAddress && log.args.value === actualTaxDeposit
    )).to.equal(true);
    expect(await taxToken.balanceOf(pairAddress)).to.equal(actualTaxDeposit);
    expect(await usdc.balanceOf(pairAddress)).to.equal(USDC_LIQUIDITY);
    expect(await taxToken.balanceOf(collector.address)).to.equal(TAX_LIQUIDITY - actualTaxDeposit);
    expect(await taxToken.balanceOf(routerAddress)).to.equal(strayTax);
    expect(await usdc.balanceOf(routerAddress)).to.equal(strayUSDC);

    const liquidity = await pair.balanceOf(provider.address);
    expect(liquidity).to.be.gt(0);
    await pair.connect(provider).approve(routerAddress, liquidity);
    const providerTaxBefore = await taxToken.balanceOf(provider.address);
    const providerUSDCBefore = await usdc.balanceOf(provider.address);
    const removeTransaction = await router.connect(provider).removeLiquiditySupportingFeeOnTransferTokens(
      await taxToken.getAddress(), await usdc.getAddress(), liquidity, 1, 1, provider.address, MAX
    );
    const removeReceipt = await removeTransaction.wait();
    const removeTransfers = removeReceipt.logs
      .filter((log) => log.address === taxTokenAddress)
      .map((log) => taxToken.interface.parseLog(log))
      .filter((log) => log && log.name === "Transfer");
    expect(removeTransfers.some((log) => log.args.from === pairAddress && log.args.to === routerAddress)).to.equal(true);
    expect(removeTransfers.some((log) =>
      log.args.from === routerAddress && log.args.to === provider.address
    )).to.equal(true);
    expect(await taxToken.balanceOf(provider.address)).to.be.gt(providerTaxBefore);
    expect(await usdc.balanceOf(provider.address)).to.be.gt(providerUSDCBefore);
    expect(await taxToken.balanceOf(routerAddress)).to.equal(strayTax);
    expect(await usdc.balanceOf(routerAddress)).to.equal(strayUSDC);
  });

  it("enforces fee-on-transfer add-liquidity minimums against actual pair receipts", async function () {
    const [owner, provider, collector] = await ethers.getSigners();
    const USDC = await ethers.getContractFactory("USDC");
    const usdc = await USDC.deploy(USDC_SUPPLY);
    const TaxToken = await ethers.getContractFactory("TaxToken");
    const taxToken = await TaxToken.deploy(TAX_SUPPLY, 1000, collector.address);
    const Factory = await ethers.getContractFactory("UnitFlowV25Factory");
    const factory = await Factory.deploy(owner.address);
    const Router = await ethers.getContractFactory("UnitFlowV25LiquidityRouter");
    const router = await Router.deploy(await factory.getAddress(), await usdc.getAddress());

    await taxToken.transfer(provider.address, TAX_LIQUIDITY);
    await usdc.transfer(provider.address, USDC_LIQUIDITY);
    await taxToken.connect(provider).approve(await router.getAddress(), TAX_LIQUIDITY);
    await usdc.connect(provider).approve(await router.getAddress(), USDC_LIQUIDITY);
    await expect(router.connect(provider).addLiquidityUSDCSupportingFeeOnTransferTokens(
      await taxToken.getAddress(), TAX_LIQUIDITY, USDC_LIQUIDITY, TAX_LIQUIDITY, USDC_LIQUIDITY,
      provider.address, MAX
    )).to.be.revertedWith("UnitFlowV25LiquidityRouter: INSUFFICIENT_TOKEN_AMOUNT");
    expect(await factory.getPair(await taxToken.getAddress(), await usdc.getAddress())).to.equal(ethers.ZeroAddress);
    expect(await taxToken.balanceOf(collector.address)).to.equal(0);
  });

  it("supports fee-on-transfer tokens on both sides of the generic liquidity function", async function () {
    const [owner, provider, collector] = await ethers.getSigners();
    const TaxToken = await ethers.getContractFactory("TaxToken");
    const tokenA = await TaxToken.deploy(TAX_SUPPLY, 1000, collector.address);
    const tokenB = await TaxToken.deploy(TAX_SUPPLY, 500, collector.address);
    const Factory = await ethers.getContractFactory("UnitFlowV25Factory");
    const factory = await Factory.deploy(owner.address);
    const Router = await ethers.getContractFactory("UnitFlowV25LiquidityRouter");
    const router = await Router.deploy(await factory.getAddress(), await tokenB.getAddress());
    const amount = ethers.parseEther("10000");

    await tokenA.transfer(provider.address, amount);
    await tokenB.transfer(provider.address, amount);
    await tokenA.connect(provider).approve(await router.getAddress(), amount);
    await tokenB.connect(provider).approve(await router.getAddress(), amount);
    const actualA = amount * 81n / 100n;
    const actualB = amount * 9025n / 10000n;
    await router.connect(provider).addLiquiditySupportingFeeOnTransferTokens(
      await tokenA.getAddress(), await tokenB.getAddress(), amount, amount,
      actualA, actualB, provider.address, MAX
    );

    const pairAddress = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
    const pair = await ethers.getContractAt("UnitFlowV25Pair", pairAddress);
    expect(await tokenA.balanceOf(pairAddress)).to.equal(actualA);
    expect(await tokenB.balanceOf(pairAddress)).to.equal(actualB);
    expect(await tokenA.balanceOf(collector.address)).to.equal(amount - actualA);
    expect(await tokenB.balanceOf(collector.address)).to.equal(amount - actualB);
    expect(await pair.balanceOf(provider.address)).to.be.gt(0);
  });

  it("supports taxed token input swaps and does not sweep stray router USDC", async function () {
    const { owner, trader, collector, usdc, taxToken, swapRouter } = await deployFixture();
    const amountIn = ethers.parseEther("100");
    await taxToken.transfer(trader.address, amountIn);
    await taxToken.connect(trader).approve(await swapRouter.getAddress(), amountIn);
    const stray = ethers.parseUnits("7", 6);
    await usdc.transfer(await swapRouter.getAddress(), stray);
    const before = await usdc.balanceOf(trader.address);
    await swapRouter.connect(trader).swapExactTokensForUSDCSupportingFeeOnTransferTokens(
      amountIn, 1, [await taxToken.getAddress(), await usdc.getAddress()], trader.address, MAX
    );
    expect(await usdc.balanceOf(trader.address)).to.be.gt(before);
    expect(await usdc.balanceOf(await swapRouter.getAddress())).to.equal(stray);
    expect(await taxToken.balanceOf(collector.address)).to.equal(amountIn / 10n);
    expect(await taxToken.balanceOf(owner.address)).to.be.lt(TAX_SUPPLY);
  });

  it("keeps liquidity exempt while taxing swaps through the non-exempt swap router", async function () {
    const { owner, trader, collector, usdc, taxToken, liquidityRouter, swapRouter, pair } = await deployFixture();
    const liquidityRouterAddress = await liquidityRouter.getAddress();
    const swapRouterAddress = await swapRouter.getAddress();

    expect(await taxToken.isTaxExempt(liquidityRouterAddress)).to.equal(true);
    expect(await taxToken.isTaxExempt(swapRouterAddress)).to.equal(false);
    expect(await taxToken.balanceOf(collector.address)).to.equal(0);

    const amountIn = ethers.parseEther("100");
    await taxToken.transfer(trader.address, amountIn);
    await taxToken.connect(trader).approve(swapRouterAddress, amountIn);
    await swapRouter.connect(trader).swapExactTokensForUSDCSupportingFeeOnTransferTokens(
      amountIn, 1, [await taxToken.getAddress(), await usdc.getAddress()], trader.address, MAX
    );
    expect(await taxToken.balanceOf(collector.address)).to.equal(amountIn / 10n);

    const taxAfterSwap = await taxToken.balanceOf(collector.address);
    const liquidity = (await pair.balanceOf(owner.address)) / 10n;
    await pair.approve(liquidityRouterAddress, liquidity);
    await liquidityRouter.removeLiquidityUSDCSupportingFeeOnTransferTokens(
      await taxToken.getAddress(), liquidity, 1, 1, owner.address, MAX
    );
    expect(await taxToken.balanceOf(collector.address)).to.equal(taxAfterSwap);
  });

  it("measures the recipient's post-tax output for USDC-to-tax-token swaps", async function () {
    const { trader, usdc, taxToken, swapRouter } = await deployFixture();
    const amountIn = ethers.parseUnits("100", 6);
    await usdc.transfer(trader.address, amountIn);
    await usdc.connect(trader).approve(await swapRouter.getAddress(), amountIn);
    const quoted = await swapRouter.getAmountsOut(amountIn, [await usdc.getAddress(), await taxToken.getAddress()]);
    await expect(swapRouter.connect(trader).swapExactUSDCForTokensSupportingFeeOnTransferTokens(
      amountIn, quoted[1], [await usdc.getAddress(), await taxToken.getAddress()], trader.address, MAX
    )).to.be.revertedWith("UnitFlowV25SwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");
    const postTaxOutput = quoted[1] - quoted[1] / 10n;
    await swapRouter.connect(trader).swapExactUSDCForTokensSupportingFeeOnTransferTokens(
      amountIn, postTaxOutput, [await usdc.getAddress(), await taxToken.getAddress()], trader.address, MAX
    );
    expect(await taxToken.balanceOf(trader.address)).to.equal(postTaxOutput);
  });

  it("removes liquidity without tax when the liquidity router is whitelisted", async function () {
    const { owner, collector, usdc, taxToken, liquidityRouter, pair } = await deployFixture();
    const liquidity = await pair.balanceOf(owner.address);
    await pair.approve(await liquidityRouter.getAddress(), liquidity);
    const tokenBefore = await taxToken.balanceOf(owner.address);
    const usdcBefore = await usdc.balanceOf(owner.address);
    await liquidityRouter.removeLiquidityUSDCSupportingFeeOnTransferTokens(
      await taxToken.getAddress(), liquidity, 1, 1, owner.address, MAX
    );
    expect(await taxToken.balanceOf(owner.address)).to.be.gt(tokenBefore);
    expect(await usdc.balanceOf(owner.address)).to.be.gt(usdcBefore);
    expect(await taxToken.balanceOf(collector.address)).to.equal(0);
  });

  it("exposes ERC-20-only router APIs and rejects native-token transfers", async function () {
    const { owner, liquidityRouter, swapRouter } = await deployFixture();
    const liquidityFunctions = liquidityRouter.interface.fragments
      .filter((fragment) => fragment.type === "function")
      .map((fragment) => fragment.name);
    const swapFunctions = swapRouter.interface.fragments
      .filter((fragment) => fragment.type === "function")
      .map((fragment) => fragment.name);

    expect(liquidityFunctions.some((name) => name.includes("ETH") || name.includes("Native"))).to.equal(false);
    expect(swapFunctions.some((name) => name.includes("ETH") || name.includes("Native"))).to.equal(false);
    expect(liquidityRouter.interface.fragments.some(
      (fragment) => fragment.type === "function" && fragment.stateMutability === "payable"
    )).to.equal(false);
    expect(swapRouter.interface.fragments.some(
      (fragment) => fragment.type === "function" && fragment.stateMutability === "payable"
    )).to.equal(false);

    await expect(owner.sendTransaction({ to: await liquidityRouter.getAddress(), value: 1n })).to.be.reverted;
    await expect(owner.sendTransaction({ to: await swapRouter.getAddress(), value: 1n })).to.be.reverted;
  });

  it("rejects zero-address router dependencies", async function () {
    const [owner] = await ethers.getSigners();
    const Router = await ethers.getContractFactory("UnitFlowV25SwapRouter");
    await expect(Router.deploy(ethers.ZeroAddress, owner.address)).to.be.revertedWith(
      "UnitFlowV25SwapRouter: ZERO_ADDRESS"
    );
  });

  it("deploys and validates both routers against an existing factory", async function () {
    const [owner] = await ethers.getSigners();
    const USDC = await ethers.getContractFactory("USDC");
    const usdc = await USDC.deploy(USDC_SUPPLY);
    const Factory = await ethers.getContractFactory("UnitFlowV25Factory");
    const factory = await Factory.deploy(owner.address);

    const result = await deployRouters(
      ethers,
      await factory.getAddress(),
      await usdc.getAddress(),
    );
    const liquidityRouter = await ethers.getContractAt(
      "UnitFlowV25LiquidityRouter", result.liquidityRouter.address
    );
    const swapRouter = await ethers.getContractAt("UnitFlowV25SwapRouter", result.swapRouter.address);
    expect(await liquidityRouter.factory()).to.equal(await factory.getAddress());
    expect(await liquidityRouter.USDC()).to.equal(await usdc.getAddress());
    expect(await swapRouter.factory()).to.equal(await factory.getAddress());
    expect(await swapRouter.USDC()).to.equal(await usdc.getAddress());
  });
});
