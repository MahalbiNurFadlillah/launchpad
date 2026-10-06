import { useState, useEffect, useCallback, useRef } from 'react'
/* eslint-disable react-hooks/set-state-in-effect */
import { createPublicClient, http, parseAbiItem, Address, formatEther, decodeFunctionResult, encodeFunctionData } from 'viem'
import { formatTinyEthPerToken } from '@/lib/format'
import { robinhoodTestnet, LAUNCH_FACTORY_ADDRESS, FACTORY_DEPLOY_BLOCK } from '@/lib/config'
import LaunchFactoryABI from '@/lib/abi/LaunchFactory.json'
import BondingCurveABI from '@/lib/abi/BondingCurve.json'
import LauncherTokenABI from '@/lib/abi/LauncherToken.json'

const publicClient = createPublicClient({
  chain: robinhoodTestnet,
  transport: http(),
})

export type TokenInfo = {
  address: Address
  curve: Address
  deployer: Address
  name: string
  symbol: string
  logo: string
  description: string
  price: string
  progress: number
  phase: number
  quoteReserve: bigint
  tokenReserve: bigint
  realQuoteReserve: bigint
  graduationThreshold: bigint
  feeBps: bigint
  creatorTaxBps: bigint
}

const multicall3Address = '0xcA11bde05977b3631167028862bE2a173976CA11'

const multicallAbi = [
  {
    "inputs": [
      {
        "components": [
          { "internalType": "address", "name": "target", "type": "address" },
          { "internalType": "bool", "name": "allowFailure", "type": "bool" },
          { "internalType": "bytes", "name": "callData", "type": "bytes" }
        ],
        "internalType": "struct Multicall3.Call3[]",
        "name": "calls",
        "type": "tuple[]"
      }
    ],
    "name": "aggregate3",
    "outputs": [
      {
        "components": [
          { "internalType": "bool", "name": "success", "type": "bool" },
          { "internalType": "bytes", "name": "returnData", "type": "bytes" }
        ],
        "internalType": "struct Multicall3.Result[]",
        "name": "returnData",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  }
] as const

const TOKEN_LAUNCHED_EVENT = parseAbiItem('event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)')
const ZERO = '0x0000000000000000000000000000000000000000'
// RPC menolak eth_getLogs > 50.000 blok, pakai 50.000 per request (inklusif).
const CHUNK = BigInt(50000)

export function useLaunchpad(pollMs = 20000) {
  const [tokens, setTokens] = useState<TokenInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [launchFee, setLaunchFee] = useState<string>('0')
  const [launchFeeWei, setLaunchFeeWei] = useState<bigint>(BigInt(0))
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const firstLoad = useRef(true)

  const fetchTokens = useCallback(async () => {
    try {
      if (firstLoad.current) setLoading(true)
      else setRefreshing(true)
      setError(null)

      const fee = await publicClient.readContract({
        address: LAUNCH_FACTORY_ADDRESS,
        abi: LaunchFactoryABI,
        functionName: 'launchFee'
      })
      setLaunchFeeWei(fee as bigint)
      setLaunchFee(formatEther(fee as bigint))

      const latestBlock = await publicClient.getBlockNumber()
      let currentBlock = FACTORY_DEPLOY_BLOCK

      const launchedTokens: { token: Address; curve: Address; deployer: Address }[] = []
      const seen = new Set<string>()

      while (currentBlock <= latestBlock) {
        let toBlock = currentBlock + CHUNK - BigInt(1)
        if (toBlock > latestBlock) toBlock = latestBlock

        const logs = await publicClient.getLogs({
          address: LAUNCH_FACTORY_ADDRESS,
          event: TOKEN_LAUNCHED_EVENT,
          fromBlock: currentBlock,
          toBlock: toBlock
        })

        for (const log of logs) {
          const a = log.args as unknown as { token: Address; curve: Address; deployer: Address; pairToken: Address }
          // Hanya token yang dipasangkan dengan ETH (pairToken == address(0)).
          // Token pair lain disaring; dijelaskan di README.
          if (a.pairToken?.toLowerCase() === ZERO) {
            const key = (a.token as string).toLowerCase()
            if (!seen.has(key)) {
              seen.add(key)
              launchedTokens.push({ token: a.token, curve: a.curve, deployer: a.deployer })
            }
          }
        }

        currentBlock = toBlock + BigInt(1)
      }

      if (launchedTokens.length === 0) {
        setTokens([])
        setLastUpdated(new Date())
        setLoading(false)
        setRefreshing(false)
        firstLoad.current = false
        return
      }

      const calls = launchedTokens.flatMap(t => [
        { target: t.token, allowFailure: true, callData: encodeFunctionData({ abi: LauncherTokenABI, functionName: 'name' }) },
        { target: t.token, allowFailure: true, callData: encodeFunctionData({ abi: LauncherTokenABI, functionName: 'symbol' }) },
        { target: t.token, allowFailure: true, callData: encodeFunctionData({ abi: LauncherTokenABI, functionName: 'logo' }) },
        { target: t.token, allowFailure: true, callData: encodeFunctionData({ abi: LauncherTokenABI, functionName: 'description' }) },
        { target: t.curve, allowFailure: true, callData: encodeFunctionData({ abi: BondingCurveABI, functionName: 'getReserves' }) },
        { target: t.curve, allowFailure: true, callData: encodeFunctionData({ abi: BondingCurveABI, functionName: 'realQuoteReserve' }) },
        { target: t.curve, allowFailure: true, callData: encodeFunctionData({ abi: BondingCurveABI, functionName: 'graduationThreshold' }) },
        { target: t.curve, allowFailure: true, callData: encodeFunctionData({ abi: BondingCurveABI, functionName: 'feeBps' }) },
        { target: t.curve, allowFailure: true, callData: encodeFunctionData({ abi: BondingCurveABI, functionName: 'creatorTaxBps' }) },
        { target: LAUNCH_FACTORY_ADDRESS, allowFailure: true, callData: encodeFunctionData({ abi: LaunchFactoryABI, functionName: 'getLaunchedToken', args: [t.token] }) }
      ])

      const results = await publicClient.readContract({
        address: multicall3Address,
        abi: multicallAbi,
        functionName: 'aggregate3',
        args: [calls]
      }) as { success: boolean, returnData: `0x${string}` }[]

      const parsedTokens: TokenInfo[] = []

      for (let i = 0; i < launchedTokens.length; i++) {
        const offset = i * 10
        const t = launchedTokens[i]

        try {
          const name = results[offset].success ? decodeFunctionResult({ abi: LauncherTokenABI, functionName: 'name', data: results[offset].returnData }) as string : 'Unknown'
          const symbol = results[offset + 1].success ? decodeFunctionResult({ abi: LauncherTokenABI, functionName: 'symbol', data: results[offset + 1].returnData }) as string : 'UNK'
          const logo = results[offset + 2].success ? decodeFunctionResult({ abi: LauncherTokenABI, functionName: 'logo', data: results[offset + 2].returnData }) as string : ''
          const description = results[offset + 3].success ? decodeFunctionResult({ abi: LauncherTokenABI, functionName: 'description', data: results[offset + 3].returnData }) as string : ''

          let quoteReserve = BigInt(0), tokenReserve = BigInt(0)
          if (results[offset + 4].success) {
            const res = decodeFunctionResult({ abi: BondingCurveABI, functionName: 'getReserves', data: results[offset + 4].returnData }) as [bigint, bigint]
            quoteReserve = res[0]
            tokenReserve = res[1]
          }

          const realQuoteReserve = results[offset + 5].success ? decodeFunctionResult({ abi: BondingCurveABI, functionName: 'realQuoteReserve', data: results[offset + 5].returnData }) as bigint : BigInt(0)
          const gradThresh = results[offset + 6].success ? decodeFunctionResult({ abi: BondingCurveABI, functionName: 'graduationThreshold', data: results[offset + 6].returnData }) as bigint : BigInt(1)
          const feeBps = results[offset + 7].success ? BigInt(decodeFunctionResult({ abi: BondingCurveABI, functionName: 'feeBps', data: results[offset + 7].returnData }) as bigint | number) : BigInt(0)
          const creatorTaxBps = results[offset + 8].success ? BigInt(decodeFunctionResult({ abi: BondingCurveABI, functionName: 'creatorTaxBps', data: results[offset + 8].returnData }) as bigint | number) : BigInt(0)

          let phase = 0
          if (results[offset + 9].success) {
            const info = decodeFunctionResult({ abi: LaunchFactoryABI, functionName: 'getLaunchedToken', data: results[offset + 9].returnData }) as { phase: number }
            phase = Number(info.phase)
          }

          const price = formatTinyEthPerToken(quoteReserve, tokenReserve)

          // Progres basis poin dengan bigint, cap 100%.
          const progressBp = gradThresh > BigInt(0)
            ? (realQuoteReserve * BigInt(10000)) / gradThresh
            : BigInt(0)
          const progress = Math.min(100, Number(progressBp) / 100)

          parsedTokens.push({
            address: t.token,
            curve: t.curve,
            deployer: t.deployer,
            name,
            symbol,
            logo,
            description,
            price,
            progress,
            phase,
            quoteReserve,
            tokenReserve,
            realQuoteReserve,
            graduationThreshold: gradThresh,
            feeBps,
            creatorTaxBps,
          })
        } catch (e) {
          console.error("Error parsing token", t.token, e)
        }
      }

      // Terbaru di atas.
      setTokens(parsedTokens.reverse())
      setLastUpdated(new Date())
      setLoading(false)
      setRefreshing(false)
      firstLoad.current = false
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Failed to fetch tokens'
      setError(msg)
      setLoading(false)
      setRefreshing(false)
      firstLoad.current = false
    }
  }, [])

  useEffect(() => {
    fetchTokens()
  }, [fetchTokens])

  // Polling agar token yang di-launch setelah halaman dibuka ikut muncul (langkah 3).
  useEffect(() => {
    if (pollMs <= 0) return
    const id = setInterval(() => { fetchTokens() }, pollMs)
    return () => clearInterval(id)
  }, [fetchTokens, pollMs])

  return { tokens, loading, refreshing, error, refetch: fetchTokens, launchFee, launchFeeWei, lastUpdated }
}
