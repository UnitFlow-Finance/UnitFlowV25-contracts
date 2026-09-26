pragma solidity =0.6.6;

import '../../core/contracts/interfaces/IUnitFlowV25Factory.sol';
import './libraries/TransferHelper.sol';

import './interfaces/IUnitFlowV25Router02.sol';
import './libraries/UnitFlowV25Library.sol';
import './libraries/SafeMath.sol';
import './interfaces/IERC20.sol';

contract UnitFlowV25Router02 is IUnitFlowV25Router02 {
    using SafeMath for uint;

    address public immutable override factory;
    address public immutable override USDC;

    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, 'UnitFlowV25Router: EXPIRED');
        _;
    }

    constructor(address _factory, address _USDC) public {
        require(_factory != address(0) && _USDC != address(0), 'UnitFlowV25Router: ZERO_ADDRESS');
        factory = _factory;
        USDC = _USDC;
    }

    // **** ADD LIQUIDITY ****
    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin
    ) internal virtual returns (uint amountA, uint amountB) {
        // create the pair if it doesn't exist yet
        if (IUnitFlowV25Factory(factory).getPair(tokenA, tokenB) == address(0)) {
            IUnitFlowV25Factory(factory).createPair(tokenA, tokenB);
        }
        (uint reserveA, uint reserveB) = UnitFlowV25Library.getReserves(factory, tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint amountBOptimal = UnitFlowV25Library.quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, 'UnitFlowV25Router: INSUFFICIENT_B_AMOUNT');
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint amountAOptimal = UnitFlowV25Library.quote(amountBDesired, reserveB, reserveA);
                assert(amountAOptimal <= amountADesired);
                require(amountAOptimal >= amountAMin, 'UnitFlowV25Router: INSUFFICIENT_A_AMOUNT');
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external virtual override ensure(deadline) returns (uint amountA, uint amountB, uint liquidity) {
        (amountA, amountB) = _addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
        address pair = UnitFlowV25Library.pairFor(factory, tokenA, tokenB);
        TransferHelper.safeTransferFrom(tokenA, msg.sender, pair, amountA);
        TransferHelper.safeTransferFrom(tokenB, msg.sender, pair, amountB);
        liquidity = IUnitFlowV25Pair(pair).mint(to);
    }
    function addLiquidityUSDC(
        address token,
        uint amountTokenDesired,
        uint amountUSDCDesired,
        uint amountTokenMin,
        uint amountUSDCMin,
        address to,
        uint deadline
    ) external virtual override ensure(deadline) returns (uint amountToken, uint amountUSDC, uint liquidity) {
        (amountToken, amountUSDC) = _addLiquidity(
            token,
            USDC,
            amountTokenDesired,
            amountUSDCDesired,
            amountTokenMin,
            amountUSDCMin
        );
        address pair = UnitFlowV25Library.pairFor(factory, token, USDC);
        TransferHelper.safeTransferFrom(token, msg.sender, pair, amountToken);
        TransferHelper.safeTransferFrom(USDC, msg.sender, pair, amountUSDC);
        liquidity = IUnitFlowV25Pair(pair).mint(to);
    }

    // **** REMOVE LIQUIDITY ****
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) public virtual override ensure(deadline) returns (uint amountA, uint amountB) {
        address pair = UnitFlowV25Library.pairFor(factory, tokenA, tokenB);
        IUnitFlowV25Pair(pair).transferFrom(msg.sender, pair, liquidity); // send liquidity to pair
        (uint amount0, uint amount1) = IUnitFlowV25Pair(pair).burn(to);
        (address token0,) = UnitFlowV25Library.sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, 'UnitFlowV25Router: INSUFFICIENT_A_AMOUNT');
        require(amountB >= amountBMin, 'UnitFlowV25Router: INSUFFICIENT_B_AMOUNT');
    }
    function removeLiquidityUSDC(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountUSDCMin,
        address to,
        uint deadline
    ) public virtual override ensure(deadline) returns (uint amountToken, uint amountUSDC) {
        (amountToken, amountUSDC) = removeLiquidity(
            token,
            USDC,
            liquidity,
            amountTokenMin,
            amountUSDCMin,
            address(this),
            deadline
        );
        TransferHelper.safeTransfer(token, to, amountToken);
        TransferHelper.safeTransfer(USDC, to, amountUSDC);
    }
    function removeLiquidityWithPermit(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external virtual override returns (uint amountA, uint amountB) {
        address pair = UnitFlowV25Library.pairFor(factory, tokenA, tokenB);
        uint value = approveMax ? uint(-1) : liquidity;
        IUnitFlowV25Pair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
        (amountA, amountB) = removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline);
    }
    function removeLiquidityUSDCWithPermit(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountUSDCMin,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external virtual override returns (uint amountToken, uint amountUSDC) {
        address pair = UnitFlowV25Library.pairFor(factory, token, USDC);
        uint value = approveMax ? uint(-1) : liquidity;
        IUnitFlowV25Pair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
        (amountToken, amountUSDC) = removeLiquidityUSDC(token, liquidity, amountTokenMin, amountUSDCMin, to, deadline);
    }

    // **** REMOVE LIQUIDITY (supporting fee-on-transfer tokens) ****
    function removeLiquidityUSDCSupportingFeeOnTransferTokens(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountUSDCMin,
        address to,
        uint deadline
    ) public virtual override ensure(deadline) returns (uint amountUSDC) {
        uint tokenBalanceBefore = IERC20(token).balanceOf(address(this));
        (, amountUSDC) = removeLiquidity(
            token,
            USDC,
            liquidity,
            0,
            amountUSDCMin,
            address(this),
            deadline
        );
        uint tokenAmount = IERC20(token).balanceOf(address(this)).sub(tokenBalanceBefore);
        uint recipientBalanceBefore = IERC20(token).balanceOf(to);
        TransferHelper.safeTransfer(token, to, tokenAmount);
        require(
            IERC20(token).balanceOf(to).sub(recipientBalanceBefore) >= amountTokenMin,
            'UnitFlowV25Router: INSUFFICIENT_TOKEN_AMOUNT'
        );
        TransferHelper.safeTransfer(USDC, to, amountUSDC);
    }
    function removeLiquidityUSDCWithPermitSupportingFeeOnTransferTokens(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountUSDCMin,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external virtual override returns (uint amountUSDC) {
        address pair = UnitFlowV25Library.pairFor(factory, token, USDC);
        uint value = approveMax ? uint(-1) : liquidity;
        IUnitFlowV25Pair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
        amountUSDC = removeLiquidityUSDCSupportingFeeOnTransferTokens(
            token, liquidity, amountTokenMin, amountUSDCMin, to, deadline
        );
    }

    // **** SWAP ****
    // requires the initial amount to have already been sent to the first pair
    function _swap(uint[] memory amounts, address[] memory path, address _to) internal virtual {
        for (uint i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = UnitFlowV25Library.sortTokens(input, output);
            uint amountOut = amounts[i + 1];
            (uint amount0Out, uint amount1Out) = input == token0 ? (uint(0), amountOut) : (amountOut, uint(0));
            address to = i < path.length - 2 ? UnitFlowV25Library.pairFor(factory, output, path[i + 2]) : _to;
            IUnitFlowV25Pair(UnitFlowV25Library.pairFor(factory, input, output)).swap(
                amount0Out, amount1Out, to, new bytes(0)
            );
        }
    }
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual override ensure(deadline) returns (uint[] memory amounts) {
        amounts = UnitFlowV25Library.getAmountsOut(factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, 'UnitFlowV25Router: INSUFFICIENT_OUTPUT_AMOUNT');
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, UnitFlowV25Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, to);
    }
    function swapTokensForExactTokens(
        uint amountOut,
        uint amountInMax,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual override ensure(deadline) returns (uint[] memory amounts) {
        amounts = UnitFlowV25Library.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= amountInMax, 'UnitFlowV25Router: EXCESSIVE_INPUT_AMOUNT');
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, UnitFlowV25Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, to);
    }
    function swapExactUSDCForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)
        external
        virtual
        override
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(path[0] == USDC, 'UnitFlowV25Router: INVALID_PATH');
        amounts = UnitFlowV25Library.getAmountsOut(factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, 'UnitFlowV25Router: INSUFFICIENT_OUTPUT_AMOUNT');
        TransferHelper.safeTransferFrom(USDC, msg.sender, UnitFlowV25Library.pairFor(factory, path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }
    function swapTokensForExactUSDC(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline)
        external
        virtual
        override
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(path[path.length - 1] == USDC, 'UnitFlowV25Router: INVALID_PATH');
        amounts = UnitFlowV25Library.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= amountInMax, 'UnitFlowV25Router: EXCESSIVE_INPUT_AMOUNT');
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, UnitFlowV25Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, to);
    }
    function swapExactTokensForUSDC(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)
        external
        virtual
        override
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(path[path.length - 1] == USDC, 'UnitFlowV25Router: INVALID_PATH');
        amounts = UnitFlowV25Library.getAmountsOut(factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, 'UnitFlowV25Router: INSUFFICIENT_OUTPUT_AMOUNT');
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, UnitFlowV25Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, to);
    }
    function swapUSDCForExactTokens(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline)
        external
        virtual
        override
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(path[0] == USDC, 'UnitFlowV25Router: INVALID_PATH');
        amounts = UnitFlowV25Library.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= amountInMax, 'UnitFlowV25Router: EXCESSIVE_INPUT_AMOUNT');
        TransferHelper.safeTransferFrom(USDC, msg.sender, UnitFlowV25Library.pairFor(factory, path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    // **** SWAP (supporting fee-on-transfer tokens) ****
    // requires the initial amount to have already been sent to the first pair
    function _swapSupportingFeeOnTransferTokens(address[] memory path, address _to) internal virtual {
        for (uint i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = UnitFlowV25Library.sortTokens(input, output);
            IUnitFlowV25Pair pair = IUnitFlowV25Pair(UnitFlowV25Library.pairFor(factory, input, output));
            uint amountInput;
            uint amountOutput;
            { // scope to avoid stack too deep errors
            (uint reserve0, uint reserve1,) = pair.getReserves();
            (uint reserveInput, uint reserveOutput) = input == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
            amountInput = IERC20(input).balanceOf(address(pair)).sub(reserveInput);
            amountOutput = UnitFlowV25Library.getAmountOut(amountInput, reserveInput, reserveOutput);
            }
            (uint amount0Out, uint amount1Out) = input == token0 ? (uint(0), amountOutput) : (amountOutput, uint(0));
            address to = i < path.length - 2 ? UnitFlowV25Library.pairFor(factory, output, path[i + 2]) : _to;
            pair.swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual override ensure(deadline) {
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, UnitFlowV25Library.pairFor(factory, path[0], path[1]), amountIn
        );
        uint balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, to);
        require(
            IERC20(path[path.length - 1]).balanceOf(to).sub(balanceBefore) >= amountOutMin,
            'UnitFlowV25Router: INSUFFICIENT_OUTPUT_AMOUNT'
        );
    }
    function swapExactUSDCForTokensSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    )
        external
        virtual
        override
        ensure(deadline)
    {
        require(path[0] == USDC, 'UnitFlowV25Router: INVALID_PATH');
        TransferHelper.safeTransferFrom(USDC, msg.sender, UnitFlowV25Library.pairFor(factory, path[0], path[1]), amountIn);
        uint balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, to);
        require(
            IERC20(path[path.length - 1]).balanceOf(to).sub(balanceBefore) >= amountOutMin,
            'UnitFlowV25Router: INSUFFICIENT_OUTPUT_AMOUNT'
        );
    }
    function swapExactTokensForUSDCSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    )
        external
        virtual
        override
        ensure(deadline)
    {
        require(path[path.length - 1] == USDC, 'UnitFlowV25Router: INVALID_PATH');
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, UnitFlowV25Library.pairFor(factory, path[0], path[1]), amountIn
        );
        uint balanceBefore = IERC20(USDC).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, to);
        require(
            IERC20(USDC).balanceOf(to).sub(balanceBefore) >= amountOutMin,
            'UnitFlowV25Router: INSUFFICIENT_OUTPUT_AMOUNT'
        );
    }

    // **** LIBRARY FUNCTIONS ****
    function quote(uint amountA, uint reserveA, uint reserveB) public pure virtual override returns (uint amountB) {
        return UnitFlowV25Library.quote(amountA, reserveA, reserveB);
    }

    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut)
        public
        pure
        virtual
        override
        returns (uint amountOut)
    {
        return UnitFlowV25Library.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut)
        public
        pure
        virtual
        override
        returns (uint amountIn)
    {
        return UnitFlowV25Library.getAmountIn(amountOut, reserveIn, reserveOut);
    }

    function getAmountsOut(uint amountIn, address[] memory path)
        public
        view
        virtual
        override
        returns (uint[] memory amounts)
    {
        return UnitFlowV25Library.getAmountsOut(factory, amountIn, path);
    }

    function getAmountsIn(uint amountOut, address[] memory path)
        public
        view
        virtual
        override
        returns (uint[] memory amounts)
    {
        return UnitFlowV25Library.getAmountsIn(factory, amountOut, path);
    }
}
