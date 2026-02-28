// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title SphereSwapRouter — Simplified Uniswap V2 constant-product AMM
contract SphereSwapRouter {
    using SafeERC20 for IERC20;

    struct Pool {
        uint256 reserveA;
        uint256 reserveB;
        address tokenA;
        address tokenB;
        bool exists;
    }

    mapping(bytes32 => Pool) public pools;

    event LiquidityAdded(
        address indexed tokenA,
        address indexed tokenB,
        uint256 amountA,
        uint256 amountB
    );

    event Swap(
        address indexed sender,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    /// @notice Get canonical pool key (sorted by address)
    function _poolKey(address tokenA, address tokenB) internal pure returns (bytes32) {
        (address t0, address t1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        return keccak256(abi.encodePacked(t0, t1));
    }

    /// @notice Add liquidity to a pool (creates it if it doesn't exist)
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB
    ) external {
        require(tokenA != tokenB, "Identical tokens");
        require(amountA > 0 && amountB > 0, "Zero amounts");

        bytes32 key = _poolKey(tokenA, tokenB);
        Pool storage pool = pools[key];

        IERC20(tokenA).safeTransferFrom(msg.sender, address(this), amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, address(this), amountB);

        if (!pool.exists) {
            (address t0, address t1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
            (uint256 a0, uint256 a1) = tokenA < tokenB ? (amountA, amountB) : (amountB, amountA);
            pool.tokenA = t0;
            pool.tokenB = t1;
            pool.reserveA = a0;
            pool.reserveB = a1;
            pool.exists = true;
        } else {
            if (tokenA == pool.tokenA) {
                pool.reserveA += amountA;
                pool.reserveB += amountB;
            } else {
                pool.reserveA += amountB;
                pool.reserveB += amountA;
            }
        }

        emit LiquidityAdded(tokenA, tokenB, amountA, amountB);
    }

    /// @notice Get output amount for a swap (constant product: x * y = k)
    function getAmountOut(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) public view returns (uint256 amountOut) {
        bytes32 key = _poolKey(tokenIn, tokenOut);
        Pool storage pool = pools[key];
        require(pool.exists, "Pool does not exist");

        (uint256 reserveIn, uint256 reserveOut) = tokenIn == pool.tokenA
            ? (pool.reserveA, pool.reserveB)
            : (pool.reserveB, pool.reserveA);

        require(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");

        // 0.3% fee
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /// @notice Execute a swap
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) external returns (uint256 amountOut) {
        amountOut = getAmountOut(tokenIn, tokenOut, amountIn);
        require(amountOut >= minAmountOut, "Slippage exceeded");

        bytes32 key = _poolKey(tokenIn, tokenOut);
        Pool storage pool = pools[key];

        // Transfer tokenIn from sender
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Update reserves
        if (tokenIn == pool.tokenA) {
            pool.reserveA += amountIn;
            pool.reserveB -= amountOut;
        } else {
            pool.reserveB += amountIn;
            pool.reserveA -= amountOut;
        }

        // Transfer tokenOut to sender
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);

        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    /// @notice Get pool reserves
    function getReserves(address tokenA, address tokenB)
        external
        view
        returns (uint256 reserveA, uint256 reserveB)
    {
        bytes32 key = _poolKey(tokenA, tokenB);
        Pool storage pool = pools[key];
        require(pool.exists, "Pool does not exist");

        if (tokenA == pool.tokenA) {
            return (pool.reserveA, pool.reserveB);
        } else {
            return (pool.reserveB, pool.reserveA);
        }
    }
}
