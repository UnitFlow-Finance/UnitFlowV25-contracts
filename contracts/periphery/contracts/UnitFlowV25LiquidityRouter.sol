pragma solidity =0.6.6;

import '../../core/contracts/interfaces/IUnitFlowV25Factory.sol';
import './libraries/TransferHelper.sol';

import './interfaces/IUnitFlowV25LiquidityRouter.sol';
import './libraries/UnitFlowV25Library.sol';
import './libraries/SafeMath.sol';
import './interfaces/IERC20.sol';

contract UnitFlowV25LiquidityRouter is IUnitFlowV25LiquidityRouter {
    using SafeMath for uint;

    address public immutable override factory;
    address public immutable override USDC;

    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, 'UnitFlowV25LiquidityRouter: EXPIRED');
        _;
    }

    constructor(address _factory, address _USDC) public {
        require(_factory != address(0) && _USDC != address(0), 'UnitFlowV25LiquidityRouter: ZERO_ADDRESS');
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
                require(amountBOptimal >= amountBMin, 'UnitFlowV25LiquidityRouter: INSUFFICIENT_B_AMOUNT');
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint amountAOptimal = UnitFlowV25Library.quote(amountBDesired, reserveB, reserveA);
                assert(amountAOptimal <= amountADesired);
                require(amountAOptimal >= amountAMin, 'UnitFlowV25LiquidityRouter: INSUFFICIENT_A_AMOUNT');
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

    function _transferThroughRouter(address token, address pair, uint requestedAmount)
        internal
        returns (uint pairAmount)
    {
        uint routerBalanceBefore = IERC20(token).balanceOf(address(this));
        TransferHelper.safeTransferFrom(token, msg.sender, address(this), requestedAmount);
        uint routerAmount = IERC20(token).balanceOf(address(this)).sub(routerBalanceBefore);

        uint pairBalanceBefore = IERC20(token).balanceOf(pair);
        TransferHelper.safeTransfer(token, pair, routerAmount);
        pairAmount = IERC20(token).balanceOf(pair).sub(pairBalanceBefore);
        require(
            IERC20(token).balanceOf(address(this)) >= routerBalanceBefore,
            'UnitFlowV25LiquidityRouter: ROUTER_BALANCE_DECREASED'
        );
    }

    function _forwardRouterBalanceDelta(address token, address to, uint routerBalanceBefore)
        internal
        returns (uint recipientAmount)
    {
        uint routerAmount = IERC20(token).balanceOf(address(this)).sub(routerBalanceBefore);
        uint recipientBalanceBefore = IERC20(token).balanceOf(to);
        TransferHelper.safeTransfer(token, to, routerAmount);
        recipientAmount = IERC20(token).balanceOf(to).sub(recipientBalanceBefore);
        require(
            IERC20(token).balanceOf(address(this)) >= routerBalanceBefore,
            'UnitFlowV25LiquidityRouter: ROUTER_BALANCE_DECREASED'
        );
    }

    // These entry points explicitly mediate both legs: sender -> router -> pair. Returned
    // amounts and minimums refer to what the pair receives after both transfers.
    function addLiquiditySupportingFeeOnTransferTokens(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external virtual override ensure(deadline) returns (uint amountA, uint amountB, uint liquidity) {
        (amountA, amountB) = _addLiquidity(
            tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin
        );
        address pair = UnitFlowV25Library.pairFor(factory, tokenA, tokenB);

        amountA = _transferThroughRouter(tokenA, pair, amountA);
        amountB = _transferThroughRouter(tokenB, pair, amountB);

        require(amountA >= amountAMin, 'UnitFlowV25LiquidityRouter: INSUFFICIENT_A_AMOUNT');
        require(amountB >= amountBMin, 'UnitFlowV25LiquidityRouter: INSUFFICIENT_B_AMOUNT');
        liquidity = IUnitFlowV25Pair(pair).mint(to);
    }

    function addLiquidityUSDCSupportingFeeOnTransferTokens(
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

        amountToken = _transferThroughRouter(token, pair, amountToken);
        amountUSDC = _transferThroughRouter(USDC, pair, amountUSDC);

        require(amountToken >= amountTokenMin, 'UnitFlowV25LiquidityRouter: INSUFFICIENT_TOKEN_AMOUNT');
        require(amountUSDC >= amountUSDCMin, 'UnitFlowV25LiquidityRouter: INSUFFICIENT_USDC_AMOUNT');
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
        require(amountA >= amountAMin, 'UnitFlowV25LiquidityRouter: INSUFFICIENT_A_AMOUNT');
        require(amountB >= amountBMin, 'UnitFlowV25LiquidityRouter: INSUFFICIENT_B_AMOUNT');
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

    function removeLiquiditySupportingFeeOnTransferTokens(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) public virtual override ensure(deadline) returns (uint amountA, uint amountB) {
        require(to != address(this), 'UnitFlowV25LiquidityRouter: INVALID_TO');
        uint routerBalanceABefore = IERC20(tokenA).balanceOf(address(this));
        uint routerBalanceBBefore = IERC20(tokenB).balanceOf(address(this));
        removeLiquidity(tokenA, tokenB, liquidity, 0, 0, address(this), deadline);

        amountA = _forwardRouterBalanceDelta(tokenA, to, routerBalanceABefore);
        amountB = _forwardRouterBalanceDelta(tokenB, to, routerBalanceBBefore);

        require(amountA >= amountAMin, 'UnitFlowV25LiquidityRouter: INSUFFICIENT_A_AMOUNT');
        require(amountB >= amountBMin, 'UnitFlowV25LiquidityRouter: INSUFFICIENT_B_AMOUNT');
    }

    function removeLiquidityWithPermitSupportingFeeOnTransferTokens(
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
        (amountA, amountB) = removeLiquiditySupportingFeeOnTransferTokens(
            tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline
        );
    }

    function removeLiquidityUSDCSupportingFeeOnTransferTokens(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountUSDCMin,
        address to,
        uint deadline
    ) public virtual override ensure(deadline) returns (uint amountUSDC) {
        (, amountUSDC) = removeLiquiditySupportingFeeOnTransferTokens(
            token,
            USDC,
            liquidity,
            amountTokenMin,
            amountUSDCMin,
            to,
            deadline
        );
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

    // **** LIBRARY FUNCTIONS ****
    function quote(uint amountA, uint reserveA, uint reserveB) public pure virtual override returns (uint amountB) {
        return UnitFlowV25Library.quote(amountA, reserveA, reserveB);
    }
}
