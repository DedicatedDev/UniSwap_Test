//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;
import "./UniswapV2Library.sol";
import "./interfaces/IUniswapV2Router02.sol";
import "./interfaces/IUniswapV2Factory.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

contract TrustLessLock is Ownable {
    address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address private constant FACTORY =
        0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;
    address private constant ROUTER =
        0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;

    struct TrustSwap {
        address unlocker;
        bool isUnlocked;
        address token;
        uint256 amount;
        uint256 deadline;
    }

    ///@notice swaps save all swap status with mapping. It containes array. assum array.lenght does not over 1000.
    mapping(address => mapping(address => TrustSwap[])) public swaps;

    uint256 public lockInterval = 5;
    event NewSwap(address user, TrustSwap swap);
    event Unlocked(address user, TrustSwap swap);
    event UserWithdraw(address user, address token, uint256 amount);
    event UnlockerWithdraw(
        address unlocker,
        address user,
        address token,
        uint256 amount
    );

    function swapETHToToken(address token, address _unlocker) external payable {
        require(msg.value > 0, "TrustLessLock: invalid fund");
        address[] memory path = new address[](2);
        path[0] = WETH;
        path[1] = token;

        uint256[] memory amountsOut = UniswapV2Library.getAmountsOut(
            FACTORY,
            msg.value,
            path
        );

        IUniswapV2Router02(ROUTER)
            .swapExactETHForTokensSupportingFeeOnTransferTokens{
            value: msg.value
        }(amountsOut[1], path, address(this), block.timestamp + 60);
        TrustSwap memory newSwap = TrustSwap(
            _unlocker,
            false,
            token,
            amountsOut[1],
            block.timestamp + lockInterval
        );
        TrustSwap[] storage currentSwaps = swaps[msg.sender][token];
        currentSwaps.push(newSwap);
        swaps[msg.sender][token] = currentSwaps;
        emit NewSwap(msg.sender, newSwap);
    }

    function unlockSwap(
        address user,
        address token,
        uint256 id
    ) external {
        require(
            msg.sender == swaps[user][token][id].unlocker,
            "TrustLessLock: Have no authorization!"
        );
        swaps[user][token][id].isUnlocked = true;
        emit Unlocked(user,swaps[user][token][id]);
    }

    function withdrawForExcutor(address token, uint256 amount) external {
        (uint256 balance, ) = getBalance(msg.sender, token);
        require(
            balance >= amount,
            "TrustLessLock: invalid withdraw amount for Executor"
        );
        _updateLedger(msg.sender, token, amount, true);
        _withdraw(token, amount);
        emit UserWithdraw(msg.sender, token, amount);
    }

    function withdrawForUnlocker(
        address user,
        address token,
        uint256 amount
    ) external {
        (, uint256 unlockBalance) = getBalance(user, token);
        require(
            unlockBalance >= amount,
            "TrustLessLock: invalid withdraw amount for Unlocker"
        );
        _updateLedger(user, token, amount, false);
        _withdraw(token, amount);
        emit UnlockerWithdraw(msg.sender, user, token, amount);
    }

    function _updateLedger(
        address user,
        address _token,
        uint256 _amount,
        bool _isExcutor
    ) private {
        TrustSwap[] storage mySwaps = swaps[user][_token];
        uint256 reward = _amount;
        for (uint256 i = mySwaps.length; i > 0; i--) {
            if (reward < 0) {
                break;
            }
            TrustSwap memory swap = mySwaps[i - 1];
            bool cond = (swap.deadline < block.timestamp) || swap.isUnlocked;
            if (!_isExcutor) {
                cond = !cond;
            }
            if (cond) {
                if (swap.amount > reward) {
                    swap.amount -= reward;
                    mySwaps[i - 1] = swap;
                } else {
                    reward -= swap.amount;
                    delete mySwaps[i - 1];
                }
            }
        }
        swaps[user][_token] = mySwaps;
    }

    function _withdraw(address _token, uint256 _amount) private {
        IERC20 userToken = IERC20(_token);
        userToken.approve(address(this), _amount);
        userToken.transferFrom(address(this), msg.sender, _amount);
    }

    function getBalance(address user, address _token)
        public
        view
        returns (uint256 _myBalance, uint256 _unlockBalance)
    {
        TrustSwap[] storage mySwaps = swaps[user][_token];
        for (uint256 i = 0; i < mySwaps.length; i++) {
            if (
                mySwaps[i].deadline < block.timestamp || mySwaps[i].isUnlocked
            ) {
                _myBalance += mySwaps[i].amount;
            } else {
                if (msg.sender == mySwaps[i].unlocker) {
                    _unlockBalance += mySwaps[i].amount;
                }
            }
        }

        (_myBalance, _unlockBalance);
    }

    function getSwaps(address user, address _token)
        public
        view
        returns (TrustSwap[] memory _mySwaps)
    {
        _mySwaps = swaps[user][_token];
    }

    ///@dev simple goverance :)
    function setLockTime(uint256 _lockTime) external onlyOwner {
        require(_lockTime > 0, "TrustLessLock: try to set invalid lockTime!");
        lockInterval = _lockTime;
    }
}
