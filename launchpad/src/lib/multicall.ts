import { Address } from 'viem'

export const multicall3Address = '0xcA11bde05977b3631167028862bE2a173976CA11' as const

export const multicall3Abi = [
  {
    type: 'function',
    name: 'aggregate3',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        internalType: 'struct Multicall3.Call3[]',
        components: [
          { name: 'target', type: 'address', internalType: 'address' },
          { name: 'allowFailure', type: 'bool', internalType: 'bool' },
          { name: 'callData', type: 'bytes', internalType: 'bytes' },
        ],
      },
    ],
    outputs: [
      {
        name: 'returnData',
        type: 'tuple[]',
        internalType: 'struct Multicall3.Result[]',
        components: [
          { name: 'success', type: 'bool', internalType: 'bool' },
          { name: 'returnData', type: 'bytes', internalType: 'bytes' },
        ],
      },
    ],
    stateMutability: 'payable',
  },
] as const

export type MulticallCall = {
  target: Address
  allowFailure: boolean
  callData: `0x${string}`
}

export type MulticallResult = readonly {
  success: boolean
  returnData: `0x${string}`
}[]

export function decodeMulticallResult<T>(
  results: MulticallResult,
  decoder: (index: number, result: { success: boolean; returnData: `0x${string}` }) => T,
): T[] {
  return results.map((result, index) => decoder(index, result))
}
