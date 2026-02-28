// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title SphereYieldVault — Simple yield vault with mock yield accrual
contract SphereYieldVault {
    using SafeERC20 for IERC20;

    struct Deposit {
        uint256 amount;
        uint256 shares;
        uint256 depositBlock;
        bool active;
    }

    IERC20 public immutable asset;
    uint256 public totalShares;
    uint256 public totalDeposited;

    // Mock yield rate: basis points per block (1 = 0.01% per block)
    uint256 public yieldRateBps = 1;

    mapping(address => Deposit) public deposits;

    event Deposited(address indexed user, uint256 amount, uint256 shares);
    event Withdrawn(address indexed user, uint256 amount, uint256 shares);
    event Harvested(address indexed user, address indexed to, uint256 yield_);

    constructor(address _asset) {
        asset = IERC20(_asset);
    }

    /// @notice Deposit tokens into the vault
    function deposit(uint256 amount) external returns (uint256 shares) {
        require(amount > 0, "Zero amount");

        // If user has existing deposit, harvest first
        if (deposits[msg.sender].active) {
            _harvest(msg.sender, msg.sender);
        }

        asset.safeTransferFrom(msg.sender, address(this), amount);

        // 1:1 share ratio for simplicity
        shares = amount;
        totalShares += shares;
        totalDeposited += amount;

        Deposit storage d = deposits[msg.sender];
        d.amount += amount;
        d.shares += shares;
        d.depositBlock = block.number;
        d.active = true;

        emit Deposited(msg.sender, amount, shares);
    }

    /// @notice Withdraw all deposited tokens + accrued yield
    function withdraw() external returns (uint256 totalReturn) {
        Deposit storage d = deposits[msg.sender];
        require(d.active, "No active deposit");

        uint256 yield_ = _calculateYield(msg.sender);
        totalReturn = d.amount + yield_;

        uint256 shares = d.shares;
        totalShares -= shares;
        totalDeposited -= d.amount;

        d.amount = 0;
        d.shares = 0;
        d.active = false;

        // Mint yield (testnet only — vault mints to cover yield)
        if (yield_ > 0) {
            // In production this would come from actual yield strategies
            // For testnet, we just transfer what we have (yield is simulated)
        }

        asset.safeTransfer(msg.sender, d.amount > 0 ? d.amount : totalReturn);

        emit Withdrawn(msg.sender, totalReturn, shares);
    }

    /// @notice Harvest accrued yield to a specific address
    function harvest(address to) external returns (uint256 yield_) {
        yield_ = _harvest(msg.sender, to);
    }

    /// @notice View accrued yield for a user
    function accruedYield(address user) external view returns (uint256) {
        return _calculateYield(user);
    }

    /// @notice View deposit info
    function getDeposit(address user)
        external
        view
        returns (uint256 amount, uint256 shares, uint256 depositBlock, bool active)
    {
        Deposit storage d = deposits[user];
        return (d.amount, d.shares, d.depositBlock, d.active);
    }

    function _harvest(address user, address to) internal returns (uint256 yield_) {
        Deposit storage d = deposits[user];
        require(d.active, "No active deposit");

        yield_ = _calculateYield(user);
        if (yield_ > 0) {
            d.depositBlock = block.number; // Reset yield calculation
            // Transfer yield (in production, from actual yield; on testnet, from vault balance)
            uint256 vaultBalance = asset.balanceOf(address(this));
            uint256 transferAmount = yield_ > vaultBalance ? vaultBalance : yield_;
            if (transferAmount > 0) {
                asset.safeTransfer(to, transferAmount);
            }
        }

        emit Harvested(user, to, yield_);
    }

    /// @notice Calculate mock yield: amount * yieldRateBps * blocks / 10000
    function _calculateYield(address user) internal view returns (uint256) {
        Deposit storage d = deposits[user];
        if (!d.active || d.amount == 0) return 0;

        uint256 blocksPassed = block.number - d.depositBlock;
        return (d.amount * yieldRateBps * blocksPassed) / 10000;
    }
}
