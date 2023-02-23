const { network, ethers, getNamedAccounts } = require("hardhat")
const {developmentChains} = require("../helper-harhdat-config")

const BASE_FEE = ethers.utils.parseEther("0.25") // 0.25LINK is the Coordinator Flat Fee
const GAS_PRICE_LINK = 1e9 // gas per link. it is the calculated value based on the gas price of the Chain.

module.exports = async ({getNamedAccounts, deployments}) => {
    const {deploy, log} = deployments
    const {deployer} = await getNamedAccounts()
    //const chainId = network.config.chainId

    if(developmentChains.includes(network.name)){
        console.log("local network detected! deploying mocks..")
        // deploy a mock vrfCoordinator
        await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            log: true,
            args: [BASE_FEE, GAS_PRICE_LINK],
        })
        log("Mocks deployed..........")
        log("---------------------------------------------------------- ")
    }
}

module.exports.tags = ["all","mocks"]