// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title SphereAgentWallet — Budget escrow for AI agent execution
contract SphereAgentWallet {
    using SafeERC20 for IERC20;

    address public owner;
    address public agent;
    bool public isActive;

    mapping(address => uint256) public budgets;    // token => funded amount
    mapping(address => uint256) public spent;      // token => spent amount

    event Funded(address indexed token, uint256 amount);
    event Spent(address indexed token, address indexed to, uint256 amount);
    event Refunded(address indexed token, address indexed to, uint256 amount);
    event AgentSet(address indexed agent);
    event SessionStarted();
    event SessionStopped();

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAgent() {
        require(msg.sender == agent, "Not agent");
        _;
    }

    modifier onlyActive() {
        require(isActive, "Session not active");
        _;
    }

    constructor(address _owner) {
        owner = _owner;
    }

    /// @notice Set the authorized agent address
    function setAgent(address _agent) external onlyOwner {
        agent = _agent;
        emit AgentSet(_agent);
    }

    /// @notice Fund the agent wallet with a budget
    function fund(address token, uint256 amount) external onlyOwner {
        require(amount > 0, "Zero amount");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        budgets[token] += amount;
        emit Funded(token, amount);
    }

    /// @notice Start an agent session
    function startSession() external onlyOwner {
        require(agent != address(0), "No agent set");
        isActive = true;
        emit SessionStarted();
    }

    /// @notice Agent spends from budget
    function spend(
        address token,
        uint256 amount,
        address to
    ) external onlyAgent onlyActive {
        uint256 remaining = budgets[token] - spent[token];
        require(amount <= remaining, "Exceeds budget");

        spent[token] += amount;
        IERC20(token).safeTransfer(to, amount);

        emit Spent(token, to, amount);
    }

    /// @notice Stop session and refund unspent budget to owner
    function stopAndRefund() external onlyOwner {
        isActive = false;
        emit SessionStopped();
    }

    /// @notice Refund remaining budget for a specific token
    function refund(address token) external onlyOwner {
        uint256 remaining = budgets[token] - spent[token];
        require(remaining > 0, "Nothing to refund");

        budgets[token] = spent[token]; // Set budget to spent amount
        IERC20(token).safeTransfer(owner, remaining);

        emit Refunded(token, owner, remaining);
    }

    /// @notice Get remaining budget for a token
    function remainingBudget(address token) external view returns (uint256) {
        return budgets[token] - spent[token];
    }

    /// @notice Get total spent for a token
    function totalSpent(address token) external view returns (uint256) {
        return spent[token];
    }
}
