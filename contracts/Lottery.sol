/*
 Enter the lottery( paying some random amount)
 Pick a random number (verifiably random)
 winner to be selected every X minutes -> complete automate
 Chainlink oracle -> Randomness, Automated Execution (Chainlink Keepers)

*/

//SPDX-License-Identifier: MIT

pragma solidity ^0.8.8;

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";

error Lottery__NotEnoughETHEntered();
error Lottery__TransferFailed();
error Lottery__NotOpen();
error Lottery__upKeepNotNeeded(uint256 currentBalance, uint256 numPlayer, uint256 lotteryState);

/**
 * @title A sample Lottery Contract
 * @author Muhammad Mubasher Khan
 * @notice This contract is for creating an untemperable decentralized smart contract.
 * @dev this implements Chainlink VRF v2 and Chainlink Keepers
 */

contract Lottery is VRFConsumerBaseV2, KeeperCompatibleInterface {

    // TYPE Declaration
    enum LotteryState { OPEN, CALCULATING }

    // State Variables 
    uint256 private immutable i_entrenceFee;
    address payable[] private s_players;
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint16 private constant REQUEST_CONFIRMATION = 3;
    uint32 private immutable i_callbackGasLimit;
    uint32 private constant NUM_WORDS = 1;

    //Lottery Winner
    address private s_recentWinner;
    LotteryState private s_lotteryState;
    uint256 private s_lastTimeStamp;
    uint256 private immutable i_interval;

    // Events
    event LotteryEnter(address indexed player);
    event RequestLotteryWinner(uint256 indexed requestId);
    event PickedWinner(address indexed winner);

    // Functions 

    constructor (address vrfCoordinatorV2,
    uint64 subscriptionId,
    bytes32 gasLane,
    uint256 interval,
    uint256 entrenceFee,
    uint32 callbackGasLimit
    ) VRFConsumerBaseV2(vrfCoordinatorV2)
    {
        i_entrenceFee = entrenceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_lotteryState = LotteryState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }

    function enterLottery () public payable 
    {
        if(msg.value < i_entrenceFee)
        {
            revert Lottery__NotEnoughETHEntered();
        }
        if(s_lotteryState != LotteryState.OPEN){
            revert Lottery__NotOpen();
        }
        s_players.push(payable(msg.sender));
        // emit an event when we update a dynamic array or mapping
        // Named events with the function name reversed
        emit LotteryEnter(msg.sender);
    }

    /**
     *  @dev this is the function that the chainlink keepers nodes call 
     * they look for the `upkeepNeeded` to return true.
     * the following should be true in order to return true.
     * 1. out time interval should have passed
     * 2. our lottery must have some 1 player and some ETH.
     * 3. our subscription is funded with LINK.
     * 4. the lottery should be an open state.
    */

   function checkUpkeep(
    bytes memory /* checkdata*/
    )
    public
    override
    returns (
        bool upkeepNeeded, 
        bytes memory /* performData */
        )  
    {
    bool isOpen = (LotteryState.OPEN == s_lotteryState);
    bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
    bool hasPlayers = (s_players.length > 0);
    bool hasBalance = address(this).balance > 0;
    upkeepNeeded = (isOpen && timePassed && hasPlayers && hasBalance);
   }

    function performUpkeep(bytes calldata /* performData */) external override {
        //Request a random number
        //Once we get it, do something with it
        //2 transaction process

        (bool upkeepNeeded, ) = checkUpkeep("");
        if(!upkeepNeeded){
            revert Lottery__upKeepNotNeeded(address(this).balance,s_players.length, uint256(s_lotteryState));
        }

        s_lotteryState = LotteryState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane, //gasLane
            i_subscriptionId,
            REQUEST_CONFIRMATION,
            i_callbackGasLimit,
            NUM_WORDS
        );

        emit RequestLotteryWinner(requestId);
    }

    function fulfillRandomWords(uint256 /* requestId */, uint256[] memory randomWords) internal override 
    {
        uint256 indexOfWinner = randomWords[0] % s_players.length;
        address payable recentWinner = s_players[indexOfWinner];
        s_recentWinner = recentWinner;

        s_lotteryState = LotteryState.OPEN;
        s_players = new address payable[](0);
        s_lastTimeStamp = block.timestamp;
        (bool success, ) = recentWinner.call{value: address(this).balance}("");
        if(!success){
            revert Lottery__TransferFailed();
        }
        emit PickedWinner(recentWinner);
    }

    // View / Pure Functions

    function getEntranceFee() public view returns (uint256){
        return i_entrenceFee;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getRecentWinner() public view returns (address){
        return s_recentWinner;
    }
    function getLotteryState() public view returns (LotteryState){
        return s_lotteryState;
    }
    function getNumWords() public pure returns (uint256) {
        return NUM_WORDS;
    }

    function getNumberOfPlayers() public view returns (uint256) {
        return s_players.length;
    }

    function getLatestTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getRequestConfirmation() public pure returns (uint256) {
        return REQUEST_CONFIRMATION;
    }

    function getInterval() public view returns (uint256){
        return i_interval;
    }
}

