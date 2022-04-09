import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import {
  IUniswapV2Router02,
  IUniswapV2Router02__factory,
  TrustLessLock,
  TrustLessLock__factory,
} from "../typechain";
import { IERC20__factory } from "../typechain/factories/IERC20__factory";
import { IERC20 } from "../typechain/IERC20";

const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const ROUTER = "0x7a250d5630b4cf539739df2c5dacb4c659f2488d";

const delay = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

describe("TrustLock", () => {

  let trustLessLock: TrustLessLock;
  let daiToken: IERC20;
  let users: SignerWithAddress[];
  let uniswap_router: IUniswapV2Router02;

  beforeEach(async () => {
    users = await ethers.getSigners();
    daiToken = IERC20__factory.connect(DAI, ethers.provider);
    const TrustLessLockFactory = await ethers.getContractFactory(
      "TrustLessLock"
    );
    trustLessLock = await TrustLessLockFactory.deploy();
    await trustLessLock.deployed();

    uniswap_router = IUniswapV2Router02__factory.connect(
      ROUTER,
      ethers.provider
    );
  });

  it("Swap token", async () => {
    const depositAmount = ethers.utils.parseEther("1000");
    const amounts = await uniswap_router.getAmountsOut(depositAmount, [
      WETH,
      DAI,
    ]);
    await expect(
      trustLessLock
        .connect(users[1])
        .swapETHToToken(DAI, users[2].address, { value: depositAmount })
    ).to.emit(trustLessLock, "NewSwap");

    const customToken = await daiToken.balanceOf(trustLessLock.address);
    expect(ethers.utils.formatEther(customToken)).to.equal(
      ethers.utils.formatEther(amounts[1])
    );
  });

  it("Unlock Swap", async () => {
    //Swap
    const depositAmount = ethers.utils.parseEther("1000");
    const amounts = await uniswap_router.getAmountsOut(depositAmount, [
      WETH,
      DAI,
    ]);

    await expect(
      trustLessLock
        .connect(users[1])
        .swapETHToToken(DAI, users[2].address, { value: depositAmount })
    ).to.emit(trustLessLock, "NewSwap");

    const customToken = await daiToken.balanceOf(trustLessLock.address);
    expect(ethers.utils.formatEther(customToken)).to.equal(
      ethers.utils.formatEther(amounts[1])
    );

    let swaps = await trustLessLock.getSwaps(users[1].address, DAI);
    expect(swaps.length).to.equal(1);
    expect(swaps[0].unlocker).to.equal(users[2].address);
    expect(swaps[0].isUnlocked).to.equal(false);

    await expect(
      trustLessLock.connect(users[2]).unlockSwap(users[1].address, DAI, 0)
    ).to.emit(trustLessLock, "Unlocked");

    swaps = await trustLessLock.getSwaps(users[1].address, DAI);
    expect(swaps[0].isUnlocked).to.equal(true);
  });

  it("revert UnlockSwap by unknown Unlocker", async () => {
    //Swap
    const depositAmount = ethers.utils.parseEther("1000");
    const amounts = await uniswap_router.getAmountsOut(depositAmount, [
      WETH,
      DAI,
    ]);
    await expect(
      trustLessLock
        .connect(users[1])
        .swapETHToToken(DAI, users[2].address, { value: depositAmount })
    ).to.emit(trustLessLock, "NewSwap");
    const customToken = await daiToken.balanceOf(trustLessLock.address);
    expect(ethers.utils.formatEther(customToken)).to.equal(
      ethers.utils.formatEther(amounts[1])
    );

    let swaps = await trustLessLock.getSwaps(users[1].address, DAI);
    expect(swaps.length).to.equal(1);
    expect(swaps[0].unlocker).to.equal(users[2].address);
    expect(swaps[0].isUnlocked).to.equal(false);
    await expect(
      trustLessLock.unlockSwap(users[1].address, DAI, 0)
    ).to.revertedWith("TrustLessLock: Have no authorization!");
  });

  it("Withdraw fund", async () => {
    //Swap
    const depositAmount = ethers.utils.parseEther("1000");
    const amounts = await uniswap_router.getAmountsOut(depositAmount, [
      WETH,
      DAI,
    ]);
    await trustLessLock
      .connect(users[1])
      .swapETHToToken(DAI, users[2].address, { value: depositAmount });
    const customToken = await daiToken.balanceOf(trustLessLock.address);
    expect(ethers.utils.formatEther(customToken)).to.equal(
      ethers.utils.formatEther(amounts[1])
    );

    //Unlock
    let swaps = await trustLessLock.getSwaps(users[1].address, DAI);
    expect(swaps.length).to.equal(1);
    expect(swaps[0].unlocker).to.equal(users[2].address);
    expect(swaps[0].isUnlocked).to.equal(false);
    await trustLessLock.connect(users[2]).unlockSwap(users[1].address, DAI, 0);

    //Withdraw
    await trustLessLock.connect(users[1]).withdrawForExcutor(DAI, amounts[1]);
    expect(await daiToken.balanceOf(users[1].address)).to.equal(amounts[1]);
  });

  it("revert Withdraw fund before timeout without unlock", async () => {
    //Swap
    const depositAmount = ethers.utils.parseEther("1000");
    const amounts = await uniswap_router.getAmountsOut(depositAmount, [
      WETH,
      DAI,
    ]);
    await trustLessLock
      .connect(users[1])
      .swapETHToToken(DAI, users[2].address, { value: depositAmount });
    const customToken = await daiToken.balanceOf(trustLessLock.address);
    expect(ethers.utils.formatEther(customToken)).to.equal(
      ethers.utils.formatEther(amounts[1])
    );

    ///Withdraw
    await expect(
      trustLessLock.connect(users[1]).withdrawForExcutor(DAI, amounts[1])
    ).to.revertedWith("TrustLessLock: invalid withdraw amount");
  });

  it("Withdraw fund after timeout", async () => {
    //Swap
    const depositAmount = ethers.utils.parseEther("1000");
    const amounts = await uniswap_router.getAmountsOut(depositAmount, [
      WETH,
      DAI,
    ]);
    await trustLessLock
      .connect(users[3])
      .swapETHToToken(DAI, users[2].address, { value: depositAmount });
    let daiAmount = await daiToken.balanceOf(trustLessLock.address);
    expect(ethers.utils.formatEther(daiAmount)).to.equal(
      ethers.utils.formatEther(amounts[1])
    );

    const timeout = await trustLessLock.lockInterval();
    //added additional delay to avoid transaction fail because of block.timestamp error;
    await delay((+timeout.toString() + 1) * 1000);
    ///Withdraw
    await expect(
      trustLessLock.connect(users[3]).withdrawForExcutor(DAI, amounts[1])
    ).to.emit(trustLessLock, "UserWithdraw");
    daiAmount = await daiToken.balanceOf(users[3].address);
    expect(ethers.utils.formatEther(daiAmount)).to.equal(
      ethers.utils.formatEther(amounts[1])
    );
  });

  it("Withdraw fund by Unlocker before timeout", async () => {
    //Swap
    const depositAmount = ethers.utils.parseEther("1000");
    const amounts = await uniswap_router.getAmountsOut(depositAmount, [
      WETH,
      DAI,
    ]);
    await expect(
      trustLessLock
        .connect(users[3])
        .swapETHToToken(DAI, users[2].address, { value: depositAmount })
    ).to.emit(trustLessLock, "NewSwap");

    let daiAmount = await daiToken.balanceOf(trustLessLock.address);
    expect(ethers.utils.formatEther(daiAmount)).to.equal(
      ethers.utils.formatEther(amounts[1])
    );

    ///Withdraw
    await expect(
      trustLessLock
        .connect(users[2])
        .withdrawForUnlocker(users[3].address, DAI, amounts[1])
    ).to.emit(trustLessLock, "UnlockerWithdraw");

    daiAmount = await daiToken.balanceOf(users[2].address);
    expect(ethers.utils.formatEther(daiAmount)).to.equal(
      ethers.utils.formatEther(amounts[1])
    );
  });

  it("revert Withdraw after Withdraw by Unlocker ", async () => {
    //Swap
    const depositAmount = ethers.utils.parseEther("1000");
    const amounts = await uniswap_router.getAmountsOut(depositAmount, [
      WETH,
      DAI,
    ]);
    await trustLessLock
      .connect(users[4])
      .swapETHToToken(DAI, users[5].address, { value: depositAmount });
    let daiAmount = await daiToken.balanceOf(trustLessLock.address);
    expect(ethers.utils.formatEther(daiAmount)).to.equal(
      ethers.utils.formatEther(amounts[1])
    );

    ///Withdraw
    await trustLessLock
      .connect(users[5])
      .withdrawForUnlocker(users[4].address, DAI, amounts[1]);
    daiAmount = await daiToken.balanceOf(users[5].address);
    expect(ethers.utils.formatEther(daiAmount)).to.equal(
      ethers.utils.formatEther(amounts[1])
    );
    await expect(
      trustLessLock.connect(users[4]).withdrawForExcutor(DAI, amounts[1])
    ).to.revertedWith("TrustLessLock: invalid withdraw amount for Executor");
  });

  it("revert Withdraw by Unknown Unlocker before timeout", async () => {
    //Swap
    const depositAmount = ethers.utils.parseEther("1000");
    const amounts = await uniswap_router.getAmountsOut(depositAmount, [
      WETH,
      DAI,
    ]);
    await trustLessLock
      .connect(users[4])
      .swapETHToToken(DAI, users[5].address, { value: depositAmount });
    let daiAmount = await daiToken.balanceOf(trustLessLock.address);
    expect(ethers.utils.formatEther(daiAmount)).to.equal(
      ethers.utils.formatEther(amounts[1])
    );

    ///Withdraw
    await expect(
      trustLessLock
        .connect(users[3])
        .withdrawForUnlocker(users[4].address, DAI, amounts[1])
    ).to.revertedWith("TrustLessLock: invalid withdraw amount for Unlocker");
  });
});
