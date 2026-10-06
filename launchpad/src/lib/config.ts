import { createConfig, http } from 'wagmi'
import { defineChain } from 'viem'
import { injected } from 'wagmi/connectors'

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: ['https://robinhood-sepolia-rpc.publicnode.com'] },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://explorer.testnet.chain.robinhood.com' },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 1,
    },
  },
})

export const config = createConfig({
  chains: [robinhoodTestnet],
  connectors: [injected()],
  transports: {
    [robinhoodTestnet.id]: http(),
  },
})

export const LAUNCH_FACTORY_ADDRESS = '0x533cE670f1372cb402D49866608b92e7bc2b4493' as const

export const FACTORY_DEPLOY_BLOCK = BigInt(129157568)

export const EXPLORER_BASE = 'https://explorer.testnet.chain.robinhood.com'

export const explorerTxUrl = (hash: string) => `${EXPLORER_BASE}/tx/${hash}`

export const explorerAddressUrl = (address: string) => `${EXPLORER_BASE}/address/${address}`
