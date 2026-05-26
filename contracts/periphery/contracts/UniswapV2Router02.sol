pragma solidity =0.6.6;

import '../../core/contracts/interfaces/IArcFlowV25Factory.sol';
import './libraries/TransferHelper.sol';

import './interfaces/IArcFlowV25Router02.sol';
import './libraries/ArcFlowV25Library.sol';
import './libraries/SafeMath.sol';
import './interfaces/IERC20.sol';
import './interfaces/IWUSDC.sol';

contract ArcFlowV25Router02 is IArcFlowV25Router02 {
    using SafeMath for uint;

    address public immutable override factory;
    address public immutable override WUSDC;

    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, 'ArcFlowV25Router: EXPIRED');
        _;
    }

    constructor(address _factory, address _WUSDC) public {
        factory = _factory;
        WUSDC = _WUSDC;
    }

    receive() external payable {
        assert(msg.sender == WUSDC); // only accept USDC via fallback from the WUSDC contract
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
        if (IArcFlowV25Factory(factory).getPair(tokenA, tokenB) == address(0)) {
            IArcFlowV25Factory(factory).createPair(tokenA, tokenB);
        }
        (uint reserveA, uint reserveB) = ArcFlowV25Library.getReserves(factory, tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint amountBOptimal = ArcFlowV25Library.quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, 'ArcFlowV25Router: INSUFFICIENT_B_AMOUNT');
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint amountAOptimal = ArcFlowV25Library.quote(amountBDesired, reserveB, reserveA);
                assert(amountAOptimal <= amountADesired);
                require(amountAOptimal >= amountAMin, 'ArcFlowV25Router: INSUFFICIENT_A_AMOUNT');
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
        address pair = ArcFlowV25Library.pairFor(factory, tokenA, tokenB);
        TransferHelper.safeTransferFrom(tokenA, msg.sender, pair, amountA);
        TransferHelper.safeTransferFrom(tokenB, msg.sender, pair, amountB);
        liquidity = IArcFlowV25Pair(pair).mint(to);
    }
    function addLiquidityUSDC(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountUSDCMin,
        address to,
        uint deadline
    ) external virtual override payable ensure(deadline) returns (uint amountToken, uint amountUSDC, uint liquidity) {
        (amountToken, amountUSDC) = _addLiquidity(
            token,
            WUSDC,
            amountTokenDesired,
            msg.value,
            amountTokenMin,
            amountUSDCMin
        );
        address pair = ArcFlowV25Library.pairFor(factory, token, WUSDC);
        TransferHelper.safeTransferFrom(token, msg.sender, pair, amountToken);
        IWUSDC(WUSDC).deposit{value: amountUSDC}();
        assert(IWUSDC(WUSDC).transfer(pair, amountUSDC));
        liquidity = IArcFlowV25Pair(pair).mint(to);
        // refund dust eth, if any
        if (msg.value > amountUSDC) TransferHelper.safeTransferUSDC(msg.sender, msg.value - amountUSDC);
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
        address pair = ArcFlowV25Library.pairFor(factory, tokenA, tokenB);
        IArcFlowV25Pair(pair).transferFrom(msg.sender, pair, liquidity); // send liquidity to pair
        (uint amount0, uint amount1) = IArcFlowV25Pair(pair).burn(to);
        (address token0,) = ArcFlowV25Library.sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, 'ArcFlowV25Router: INSUFFICIENT_A_AMOUNT');
        require(amountB >= amountBMin, 'ArcFlowV25Router: INSUFFICIENT_B_AMOUNT');
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
            WUSDC,
            liquidity,
            amountTokenMin,
            amountUSDCMin,
            address(this),
            deadline
        );
        TransferHelper.safeTransfer(token, to, amountToken);
        IWUSDC(WUSDC).withdraw(amountUSDC);
        TransferHelper.safeTransferUSDC(to, amountUSDC);
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
        address pair = ArcFlowV25Library.pairFor(factory, tokenA, tokenB);
        uint value = approveMax ? uint(-1) : liquidity;
        IArcFlowV25Pair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
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
        address pair = ArcFlowV25Library.pairFor(factory, token, WUSDC);
        uint value = approveMax ? uint(-1) : liquidity;
        IArcFlowV25Pair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
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
        (, amountUSDC) = removeLiquidity(
            token,
            WUSDC,
            liquidity,
            amountTokenMin,
            amountUSDCMin,
            address(this),
            deadline
        );
        TransferHelper.safeTransfer(token, to, IERC20(token).balanceOf(address(this)));
        IWUSDC(WUSDC).withdraw(amountUSDC);
        TransferHelper.safeTransferUSDC(to, amountUSDC);
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
        address pair = ArcFlowV25Library.pairFor(factory, token, WUSDC);
        uint value = approveMax ? uint(-1) : liquidity;
        IArcFlowV25Pair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
        amountUSDC = removeLiquidityUSDCSupportingFeeOnTransferTokens(
            token, liquidity, amountTokenMin, amountUSDCMin, to, deadline
        );
    }

    // **** SWAP ****
    // requires the initial amount to have already been sent to the first pair
    function _swap(uint[] memory amounts, address[] memory path, address _to) internal virtual {
        for (uint i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = ArcFlowV25Library.sortTokens(input, output);
            uint amountOut = amounts[i + 1];
            (uint amount0Out, uint amount1Out) = input == token0 ? (uint(0), amountOut) : (amountOut, uint(0));
            address to = i < path.length - 2 ? ArcFlowV25Library.pairFor(factory, output, path[i + 2]) : _to;
            IArcFlowV25Pair(ArcFlowV25Library.pairFor(factory, input, output)).swap(
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
        require(path.length >= 2, 'ArcFlowV25Router: INVALID_PATH_LENGTH');
        amounts = ArcFlowV25Library.getAmountsOut(factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, 'ArcFlowV25Router: INSUFFICIENT_OUTPUT_AMOUNT');
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, ArcFlowV25Library.pairFor(factory, path[0], path[1]), amounts[0]
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
        require(path.length >= 2, 'ArcFlowV25Router: INVALID_PATH_LENGTH');
        amounts = ArcFlowV25Library.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= amountInMax, 'ArcFlowV25Router: EXCESSIVE_INPUT_AMOUNT');
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, ArcFlowV25Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, to);
    }
    function swapExactUSDCForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline)
        external
        virtual
        override
        payable
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(path.length >= 2, 'ArcFlowV25Router: INVALID_PATH_LENGTH');
        require(path[0] == WUSDC, 'ArcFlowV25Router: INVALID_PATH');
        amounts = ArcFlowV25Library.getAmountsOut(factory, msg.value, path);
        require(amounts[amounts.length - 1] >= amountOutMin, 'ArcFlowV25Router: INSUFFICIENT_OUTPUT_AMOUNT');
        IWUSDC(WUSDC).deposit{value: amounts[0]}();
        assert(IWUSDC(WUSDC).transfer(ArcFlowV25Library.pairFor(factory, path[0], path[1]), amounts[0]));
        _swap(amounts, path, to);
    }
    function swapTokensForExactUSDC(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline)
        external
        virtual
        override
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(path.length >= 2, 'ArcFlowV25Router: INVALID_PATH_LENGTH');
        require(path[path.length - 1] == WUSDC, 'ArcFlowV25Router: INVALID_PATH');
        amounts = ArcFlowV25Library.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= amountInMax, 'ArcFlowV25Router: EXCESSIVE_INPUT_AMOUNT');
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, ArcFlowV25Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, address(this));
        IWUSDC(WUSDC).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferUSDC(to, amounts[amounts.length - 1]);
    }
    function swapExactTokensForUSDC(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)
        external
        virtual
        override
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(path.length >= 2, 'ArcFlowV25Router: INVALID_PATH_LENGTH');
        require(path[path.length - 1] == WUSDC, 'ArcFlowV25Router: INVALID_PATH');
        amounts = ArcFlowV25Library.getAmountsOut(factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, 'ArcFlowV25Router: INSUFFICIENT_OUTPUT_AMOUNT');
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, ArcFlowV25Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, address(this));
        IWUSDC(WUSDC).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferUSDC(to, amounts[amounts.length - 1]);
    }
    function swapUSDCForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline)
        external
        virtual
        override
        payable
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(path[0] == WUSDC, 'ArcFlowV25Router: INVALID_PATH');
        amounts = ArcFlowV25Library.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= msg.value, 'ArcFlowV25Router: EXCESSIVE_INPUT_AMOUNT');
        IWUSDC(WUSDC).deposit{value: amounts[0]}();
        assert(IWUSDC(WUSDC).transfer(ArcFlowV25Library.pairFor(factory, path[0], path[1]), amounts[0]));
        _swap(amounts, path, to);
        // refund dust eth, if any
        if (msg.value > amounts[0]) TransferHelper.safeTransferUSDC(msg.sender, msg.value - amounts[0]);
    }

    // **** SWAP (supporting fee-on-transfer tokens) ****
    // requires the initial amount to have already been sent to the first pair
    function _swapSupportingFeeOnTransferTokens(address[] memory path, address _to) internal virtual {
        for (uint i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = ArcFlowV25Library.sortTokens(input, output);
            IArcFlowV25Pair pair = IArcFlowV25Pair(ArcFlowV25Library.pairFor(factory, input, output));
            uint amountInput;
            uint amountOutput;
            { // scope to avoid stack too deep errors
            (uint reserve0, uint reserve1,) = pair.getReserves();
            (uint reserveInput, uint reserveOutput) = input == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
            amountInput = IERC20(input).balanceOf(address(pair)).sub(reserveInput);
            amountOutput = ArcFlowV25Library.getAmountOut(amountInput, reserveInput, reserveOutput);
            }
            (uint amount0Out, uint amount1Out) = input == token0 ? (uint(0), amountOutput) : (amountOutput, uint(0));
            address to = i < path.length - 2 ? ArcFlowV25Library.pairFor(factory, output, path[i + 2]) : _to;
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
            path[0], msg.sender, ArcFlowV25Library.pairFor(factory, path[0], path[1]), amountIn
        );
        uint balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, to);
        require(
            IERC20(path[path.length - 1]).balanceOf(to).sub(balanceBefore) >= amountOutMin,
            'ArcFlowV25Router: INSUFFICIENT_OUTPUT_AMOUNT'
        );
    }
    function swapExactUSDCForTokensSupportingFeeOnTransferTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    )
        external
        virtual
        override
        payable
        ensure(deadline)
    {
        require(path[0] == WUSDC, 'ArcFlowV25Router: INVALID_PATH');
        uint amountIn = msg.value;
        IWUSDC(WUSDC).deposit{value: amountIn}();
        assert(IWUSDC(WUSDC).transfer(ArcFlowV25Library.pairFor(factory, path[0], path[1]), amountIn));
        uint balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, to);
        require(
            IERC20(path[path.length - 1]).balanceOf(to).sub(balanceBefore) >= amountOutMin,
            'ArcFlowV25Router: INSUFFICIENT_OUTPUT_AMOUNT'
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
        require(path[path.length - 1] == WUSDC, 'ArcFlowV25Router: INVALID_PATH');
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, ArcFlowV25Library.pairFor(factory, path[0], path[1]), amountIn
        );
        _swapSupportingFeeOnTransferTokens(path, address(this));
        uint amountOut = IERC20(WUSDC).balanceOf(address(this));
        require(amountOut >= amountOutMin, 'ArcFlowV25Router: INSUFFICIENT_OUTPUT_AMOUNT');
        IWUSDC(WUSDC).withdraw(amountOut);
        TransferHelper.safeTransferUSDC(to, amountOut);
    }

    // **** LIBRARY FUNCTIONS ****
    function quote(uint amountA, uint reserveA, uint reserveB) public pure virtual override returns (uint amountB) {
        return ArcFlowV25Library.quote(amountA, reserveA, reserveB);
    }

    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut)
        public
        pure
        virtual
        override
        returns (uint amountOut)
    {
        return ArcFlowV25Library.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut)
        public
        pure
        virtual
        override
        returns (uint amountIn)
    {
        return ArcFlowV25Library.getAmountIn(amountOut, reserveIn, reserveOut);
    }

    function getAmountsOut(uint amountIn, address[] memory path)
        public
        view
        virtual
        override
        returns (uint[] memory amounts)
    {
        return ArcFlowV25Library.getAmountsOut(factory, amountIn, path);
    }

    function getAmountsIn(uint amountOut, address[] memory path)
        public
        view
        virtual
        override
        returns (uint[] memory amounts)
    {
        return ArcFlowV25Library.getAmountsIn(factory, amountOut, path);
    }
}
