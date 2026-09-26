pragma solidity =0.5.16;

import '../libraries/SafeMath.sol';

contract TaxToken {
    using SafeMath for uint;

    string public constant name = 'Tax Token';
    string public constant symbol = 'TAX';
    uint8 public constant decimals = 18;

    address public owner;
    address public taxCollector;
    uint public taxBasisPoints;
    uint public totalSupply;

    mapping(address => uint) public balanceOf;
    mapping(address => mapping(address => uint)) public allowance;
    mapping(address => bool) public isTaxExempt;

    event Approval(address indexed owner, address indexed spender, uint value);
    event Transfer(address indexed from, address indexed to, uint value);
    event TaxExemptionSet(address indexed account, bool exempt);

    constructor(uint supply, uint _taxBasisPoints, address _taxCollector) public {
        require(_taxBasisPoints <= 2_000, 'TaxToken: TAX_TOO_HIGH');
        require(_taxCollector != address(0), 'TaxToken: ZERO_COLLECTOR');
        owner = msg.sender;
        taxCollector = _taxCollector;
        taxBasisPoints = _taxBasisPoints;
        isTaxExempt[msg.sender] = true;
        totalSupply = supply;
        balanceOf[msg.sender] = supply;
        emit Transfer(address(0), msg.sender, supply);
    }

    function setTaxExempt(address account, bool exempt) external {
        require(msg.sender == owner, 'TaxToken: FORBIDDEN');
        isTaxExempt[account] = exempt;
        emit TaxExemptionSet(account, exempt);
    }

    function approve(address spender, uint value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint value) external returns (bool) {
        _transfer(msg.sender, to, value, msg.sender);
        return true;
    }

    function transferFrom(address from, address to, uint value) external returns (bool) {
        if (allowance[from][msg.sender] != uint(-1)) {
            allowance[from][msg.sender] = allowance[from][msg.sender].sub(value);
        }
        _transfer(from, to, value, msg.sender);
        return true;
    }

    function _transfer(address from, address to, uint value, address operator) private {
        require(to != address(0), 'TaxToken: ZERO_RECIPIENT');
        balanceOf[from] = balanceOf[from].sub(value);
        uint tax = isTaxExempt[from] || isTaxExempt[to] || isTaxExempt[operator]
            ? 0
            : value.mul(taxBasisPoints) / 10_000;
        uint received = value.sub(tax);
        balanceOf[to] = balanceOf[to].add(received);
        emit Transfer(from, to, received);
        if (tax > 0) {
            balanceOf[taxCollector] = balanceOf[taxCollector].add(tax);
            emit Transfer(from, taxCollector, tax);
        }
    }
}
