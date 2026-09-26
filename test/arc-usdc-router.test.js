const { expect } = require("chai");
const { ethers } = require("hardhat");

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
    const Factory = await ethers.getContractFactory("ArcFlowV25Factory");
    const factory = await Factory.deploy(owner.address);
    const LiquidityRouter = await ethers.getContractFactory("ArcFlowV25LiquidityRouter");
    const liquidityRouter = await LiquidityRouter.deploy(await factory.getAddress(), await usdc.getAddress());
    const SwapRouter = await ethers.getContractFactory("ArcFlowV25SwapRouter");
    const swapRouter = await SwapRouter.deploy(await factory.getAddress(), await usdc.getAddress());

    await taxToken.setTaxExempt(await liquidityRouter.getAddress(), true);
    await taxToken.approve(await liquidityRouter.getAddress(), MAX);
    await usdc.approve(await liquidityRouter.getAddress(), MAX);
    await liquidityRouter.addLiquidityUSDC(
      await taxToken.getAddress(), TAX_LIQUIDITY, USDC_LIQUIDITY, TAX_LIQUIDITY, USDC_LIQUIDITY,
      owner.address, MAX
    );

    const pairAddress = await factory.getPair(await taxToken.getAddress(), await usdc.getAddress());
    const pair = await ethers.getContractAt("ArcFlowV25Pair", pairAddress);
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
    )).to.be.revertedWith("ArcFlowV25SwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");
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

  it("rejects zero-address router dependencies", async function () {
    const [owner] = await ethers.getSigners();
    const Router = await ethers.getContractFactory("ArcFlowV25SwapRouter");
    await expect(Router.deploy(ethers.ZeroAddress, owner.address)).to.be.revertedWith(
      "ArcFlowV25SwapRouter: ZERO_ADDRESS"
    );
  });
});
