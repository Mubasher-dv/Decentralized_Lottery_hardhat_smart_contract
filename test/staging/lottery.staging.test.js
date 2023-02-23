const { assert, expect } = require("chai")
const { network, getNamedAccounts, ethers } = require("hardhat")
const { developmentChains} = require("../../helper-harhdat-config")

developmentChains.includes(network.name) ? describe.skip : describe("Lottery staging test", function() {
    let lottery , lotteryEntrenceFee, deployer

    beforeEach(async function() {
        deployer = (await getNamedAccounts()).deployer
        lottery = await ethers.getContract("Lottery", deployer)
        lotteryEntrenceFee = await lottery.getEntranceFee()
    })

    describe("fulfillRandomWords", function(){
        it("work with live chainlink keepers and chainlink VRF, we get a random winner", async function(){
            // enter the raffle
            console.log("Setting up test...")
            const startingTimeStamp = await lottery.getLatestTimeStamp()
            const accounts = await ethers.getSigners()
            
            console.log("setting Up listener...")
            await new Promise(async (resolve,reject) => {
                // setup listener before we enter the raffle
                // Just in case the blockchain moves REALLY fast
                lottery.once("PickedWinner", async () => {
                    console.log("Winner Picked event fired..") 
                    try {
                        //add our assert here
                        const recentWinner = await lottery.getRecentWinner()
                        const lotteryState = await lottery.getLotteryState()
                        const winnerEndingBalance = await accounts[0].getBalance()
                        const endingTimeStamp = await lottery.getLatestTimeStamp()

                        await expect(lottery.getPlayer(0)).to.be.reverted
                        assert.equal(recentWinner.toString(),accounts[0].address)
                        assert.equal(lotteryState, 0)
                        assert.equal(winnerEndingBalance.toString(), 
                            winnerStartingBalance.add(lotteryEntrenceFee).toString())

                        assert(endingTimeStamp > startingTimeStamp)
                        resolve()
                    }catch(e){
                        console.log(e)
                        reject(e)
                    }
                })
                
                console.log("Entering Raffle...")
                const tx = await lottery.enterLottery({ value: lotteryEntrenceFee })
                await tx.wait(1)
                console.log("Ok, time to wait...")
                const winnerStartingBalance = await accounts[0].getBalance()
                // this code won't complete until our listener has finished listening 
            })

            // set up the listener we before we enter the raffle
                // just in case our blockchain moves realy fast
        })
    })
})