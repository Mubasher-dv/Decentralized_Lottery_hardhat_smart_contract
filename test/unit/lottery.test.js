const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers, getChainId } = require("hardhat")
const { developmentChains, networkConfig} = require("../../helper-harhdat-config")

!developmentChains.includes(network.name) ? describe.skip : describe("Lottery unit test", function() {
    let lottery , VRFCoordinatorV2Mock, lotteryEntrenceFee, deployer , interval
    const chainId = network.config.chainId

    beforeEach(async function() {
        deployer = (await getNamedAccounts()).deployer
        await deployments.fixture(["all"])
        lottery = await ethers.getContract("Lottery", deployer)
        VRFCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock",deployer)
        lotteryEntrenceFee = await lottery.getEntranceFee()
        interval = await lottery.getInterval()
    })

    describe("constructor", async function() {
        it("initializes the constructor correctly", async function() {
            // ideally we make our test have just set 1 assert per it
            const lotteryState = await lottery.getLotteryState()
            assert.equal(lotteryState.toString(), "0")
            assert.equal(interval.toString(),networkConfig[chainId]["interval"])
        })
    })

    describe("enterRaffle",  function(){
        it("reverts when you don't pay enough", async function(){
            await expect(lottery.enterLottery()).to.be.revertedWith("Lottery__NotEnoughETHEntered")
        })
        it("records player when they enter", async function(){
            await lottery.enterLottery({value: lotteryEntrenceFee})
            const playerFromContract = await lottery.getPlayer(0)
            assert.equal(playerFromContract, deployer)
        })
        it("emits event on enter", async function(){
            await expect(lottery.enterLottery({value: lotteryEntrenceFee})).to.emit(
                lottery,
                "LotteryEnter")
        })
        it("doesn't allow entrance when lottery is calculating", async function(){
            await lottery.enterLottery({value: lotteryEntrenceFee})
            await network.provider.send("evm_increaseTime",[interval.toNumber() + 1])
            await network.provider.send("evm_mine",[])
            // we pretend to be a chainlink Keepers
            await lottery.performUpkeep([]) 
            
            await expect(lottery.enterLottery({ value: lotteryEntrenceFee})).to.be.revertedWith("Lottery__NotOpen")
        })
    })

    describe("checkUpKeep", function(){
        it("return false if people haven't send enough ETH", async function(){
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine",[])
            const {upkeepNeeded} = await lottery.callStatic.checkUpkeep([])
            assert(!upkeepNeeded)
        })
        it("return false if lottery isn't open", async function(){
            await lottery.enterLottery({value: lotteryEntrenceFee})
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine",[])
            await lottery.performUpkeep([])
            const lotteryState = await lottery.getLotteryState()
            const {upkeepNeeded} = await lottery.callStatic.checkUpkeep([])
            assert.equal(lotteryState.toString(), "1")
            assert.equal(upkeepNeeded, false) 
        })
        it("returns false if enough time hasn't passed", async () => {
            await lottery.enterLottery({ value: lotteryEntrenceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() - 2]) // use a higher number here if this test fails
            await network.provider.request({ method: "evm_mine", params: [] })
            const { upkeepNeeded } = await lottery.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
            assert(!upkeepNeeded)
        })
        it("returns true if enough time has passed, has players, eth, and is open", async () => {
            await lottery.enterLottery({ value: lotteryEntrenceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.request({ method: "evm_mine", params: [] })
            const { upkeepNeeded } = await lottery.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
            assert(upkeepNeeded)
        })
    })
    describe("performUpKeep", function(){
        it("it can only run if checkUpKeep is true", async function(){
            await lottery.enterLottery({value: lotteryEntrenceFee})
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine",[])
            const tx = await lottery.performUpkeep([])
            assert(tx)
        })
        it("revert if checkUpkeep is false", async function(){
            await expect(lottery.performUpkeep([])).to.be.revertedWith("Lottery__upKeepNotNeeded")
        })
        it("updates the lottery state, emits the event and call the vrf Coordinator", async function(){
            await lottery.enterLottery({value: lotteryEntrenceFee})
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine",[])
            const txResponse = await lottery.performUpkeep([])
            const txReciept = await txResponse.wait(1)
            const requestId = await txReciept.events[1].args.requestId
            const lotteryState = await lottery.getLotteryState()
            assert(requestId.toNumber() > 0)
            assert.equal(lotteryState, "1")
        })
    })
    describe("fullfilRandomWords", function(){
        beforeEach(async function(){
            await lottery.enterLottery({value: lotteryEntrenceFee})
            await network.provider.send("evm_increaseTime",[interval.toNumber() + 1])
            await network.provider.send("evm_mine",[])
        })
        it("can only be called after performUpKeep",async function(){
            await expect(VRFCoordinatorV2Mock.fulfillRandomWords(0, lottery.address)).to.be.revertedWith("nonexistent request")
            await expect(VRFCoordinatorV2Mock.fulfillRandomWords(1, lottery.address)).to.be.revertedWith("nonexistent request")
        })

        it("picks a winner, resets the lottery, and sends money", async function(){
            const additionalEntrants = 3
            const startingAccountIndex = 1
            const accounts = await ethers.getSigners()
            for(let i = startingAccountIndex; i< startingAccountIndex + additionalEntrants; i++){
                const accountConnectRaffle = lottery.connect(accounts[i])
                await accountConnectRaffle.enterLottery({value: lotteryEntrenceFee})
            }
            const startingTimeStamp = await lottery.getLatestTimeStamp()

            //performUpKeep (mock being chainlink keepers)
            // fulfillRandom Words (mock being the chainlink VRF)
            // we will have to wait for the randomWords to be called
            await new Promise(async (resolve, reject) => {
                lottery.once("PickedWinner", async () => {
                    console.log("found an event")
                    try{
                        const recentWinner = await lottery.getRecentWinner()
                        const lotteryState = await lottery.getLotteryState()
                        const endingTimeStamp = await lottery.getLatestTimeStamp()  
                        const numPlayers = await lottery.getNumberOfPlayers()
                        const winnerEndingBalance = await accounts[1].getBalance()

                        assert.equal(numPlayers.toString(), "0")
                        assert.equal(lotteryState.toString(),"0")
                        assert(endingTimeStamp > startingTimeStamp)

                        assert.equal(winnerEndingBalance.toString(), 
                            winnerStartingBalance.add(lotteryEntrenceFee
                            .mul(additionalEntrants)
                            .add(lotteryEntrenceFee)
                            .toString()))

                    }catch(e) {
                        reject(e)
                    }
                    resolve()
                })

                // settting up the listeners

                // below , we will fire the event, and the listeners will pack it up and resolve
                const tx = await lottery.performUpkeep([])
                const txReciept = await tx.wait(1)
                const winnerStartingBalance = await accounts[1].getBalance()
                await VRFCoordinatorV2Mock.fulfillRandomWords(txReciept.events[1].args.requestId, lottery.address)
            } )
        })
    })
})