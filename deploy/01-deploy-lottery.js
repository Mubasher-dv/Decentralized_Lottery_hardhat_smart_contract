const { network, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../helper-harhdat-config")
require("dotenv").config()

const {verify} = require("../utils/verify")

const VRF_SUB_FUND_AMOUNT = ethers.utils.parseEther("30")

module.exports = async function ({getNamedAccounts, deployments})
{
    const {deploy, logs} = deployments
    const {deployer} = await getNamedAccounts()
    const chainId = network.config.chainId
    let vrfCoordinatorV2Address , subscriptionId


    if(developmentChains.includes(network.name)){
        const VRFCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
        vrfCoordinatorV2Address = VRFCoordinatorV2Mock.address
        const transactionResponse = await VRFCoordinatorV2Mock.createSubscription()
        const transactionReciept = await transactionResponse.wait()
        subscriptionId = transactionReciept.events[0].args.subId

        await VRFCoordinatorV2Mock.fundSubscription(subscriptionId, VRF_SUB_FUND_AMOUNT)
    }
    else {
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"]
        subscriptionId = networkConfig[chainId]["subscriptionId"]
    }

    const lotteryEntrenceFee = networkConfig[chainId]["lotteryEntrenceFee"]
    const gasLane = networkConfig[chainId]["gasLane"]
    const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"]
    const interval = networkConfig[chainId]["interval"]

    const arguments = [vrfCoordinatorV2Address, subscriptionId, gasLane, interval, lotteryEntrenceFee, callbackGasLimit]

    const lottery = await deploy("Lottery", {
        from: deployer,
        args: arguments,
        log: true,
        waitConfirmation: network.config.blockConfirmations || 1, 
    })

     // Verify the deployment
     if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        console.log("Verifying...")
        await verify(lottery.address, arguments)
    }
    console.log("-----------------------------------------------")
}

module.exports.tags = ["all","lottery"]