# How to run project
after download, make .env file based on .env.example. 
Input any infura service main net Link to MAINNET_URL. (tested with Alchemy)
Try running some of the following tasks:

```shell
yarn install
npx hardhat compile
npx hardhat test
```

# Context
- Support ETH to Any ERC20 Token (supported token by Uniswap poolV2.)
- Assume user don't swap 1000+ with same token without withdraw. 

# Environment 
Test is running in local network forked from mainnet. 

