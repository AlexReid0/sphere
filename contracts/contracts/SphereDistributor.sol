// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title SphereDistributor — Batch payroll / multi-send distribution
contract SphereDistributor {
    using SafeERC20 for IERC20;

    event Distribution(
        address indexed sender,
        address indexed token,
        uint256 totalAmount,
        uint256 recipientCount
    );

    event SingleTransfer(
        address indexed sender,
        address indexed token,
        address indexed recipient,
        uint256 amount
    );

    /// @notice Distribute tokens to multiple recipients in a single transaction
    /// @param token The ERC20 token to distribute
    /// @param recipients Array of recipient addresses
    /// @param amounts Array of amounts (must match recipients length)
    function distribute(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external {
        require(recipients.length == amounts.length, "Length mismatch");
        require(recipients.length > 0, "Empty recipients");

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            require(amounts[i] > 0, "Zero amount");
            require(recipients[i] != address(0), "Zero address");
            totalAmount += amounts[i];
        }

        // Pull total from sender in one transfer
        IERC20(token).safeTransferFrom(msg.sender, address(this), totalAmount);

        // Distribute to each recipient
        for (uint256 i = 0; i < recipients.length; i++) {
            IERC20(token).safeTransfer(recipients[i], amounts[i]);
            emit SingleTransfer(msg.sender, token, recipients[i], amounts[i]);
        }

        emit Distribution(msg.sender, token, totalAmount, recipients.length);
    }

    /// @notice Simple single transfer (convenience)
    function transfer(
        address token,
        address recipient,
        uint256 amount
    ) external {
        require(recipient != address(0), "Zero address");
        require(amount > 0, "Zero amount");

        IERC20(token).safeTransferFrom(msg.sender, recipient, amount);
        emit SingleTransfer(msg.sender, token, recipient, amount);
    }
}
