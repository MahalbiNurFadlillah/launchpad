'use client'
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useMemo } from 'react'
import { TokenInfo } from '@/hooks/useLaunchpad'
import { useAccount, useBalance, useConnect, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, formatEther, decodeEventLog, parseAbiItem, keccak256 } from 'viem'
import { robinhoodTestnet, explorerTxUrl, explorerAddressUrl } from '@/lib/config'
import { formatTokenAmount } from '@/lib/format'
import BondingCurveABI from '@/lib/abi/BondingCurve.json'
import LauncherTokenABI from '@/lib/abi/LauncherToken.json'

const CURVE_BUY_ABI = parseAbiItem(
  'event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)'
)
const CURVE_SELL_ABI = parseAbiItem(
  'event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)'
)
const CURVE_BUY_TOPIC = keccak256('CurveBuy(address,address,uint256,uint256,uint256,uint256)' as `0x${string}`)
const CURVE_SELL_TOPIC = keccak256('CurveSell(address,address,uint256,uint256,uint256,uint256)' as `0x${string}`)

function friendlyError(err: unknown): string | null {
  if (!err) return null
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('SlippageExceeded') || message.includes('MinimumOutputRequired') || message.includes('InsufficientOutputAmount')) {
    return 'SlippageExceeded: harga bergerak melebihi toleransi. Naikkan slippage lalu coba lagi.'
  }
  if (message.includes('CurveGraduated') || message.includes('AlreadyGraduated')) {
    return 'CurveGraduated: token sudah tidak dijual di curve (graduate/cancelled).'
  }
  if (message.includes('InsufficientInputAmount') || message.includes('ZeroAmount')) {
    return 'Jumlah tidak valid (nol). Masukkan jumlah lebih dari 0.'
  }
  if (message.includes('InsufficientLiquidity') || message.includes('InsufficientOutputAmount')) {
    return 'Likuiditas curve tidak cukup untuk jumlah ini. Kecilkan jumlah.'
  }
  if (
    message.includes('User denied') || message.includes('User rejected') ||
    message.includes('rejected') || message.includes('denied') || message.includes('4001')
  ) {
    return 'Transaksi ditolak di wallet. Form sudah bisa dipakai lagi.'
  }
  if (message.includes('insufficient funds') || message.includes('exceeds balance')) {
    return 'Saldo tidak cukup untuk jumlah + gas.'
  }
  const short = message.split('\n')[0].slice(0, 220)
  return `Transaksi gagal: ${short}`
}

export function BuyForm({ token, onSuccess }: { token: TokenInfo; onSuccess: () => void }) {
  const [tab, setTab] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState('1')

  const { address, isConnected, chainId } = useAccount()
  const { connectors, connect: connectWallet } = useConnect()
  const handleConnect = () => {
    const c = connectors[0]
    if (c) connectWallet({ connector: c })
  }
  const { data: ethBalance, refetch: refetchEth } = useBalance({ address, query: { refetchInterval: 5000 } })
  const { data: tokenBalance, refetch: refetchTokenBal } = useReadContract({
    address: token.address,
    abi: LauncherTokenABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 8000 },
  })
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: token.address,
    abi: LauncherTokenABI,
    functionName: 'allowance',
    args: address ? [address, token.curve] : undefined,
    query: { enabled: !!address && tab === 'sell' },
  })

  const { writeContract, data: hash, error: writeError, isPending: isWriting, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt, error: txError } = useWaitForTransactionReceipt({ hash })

  // Reset form saat ganti token.
  useEffect(() => { setAmount(''); reset() }, [token.address]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isConfirmed) {
      refetchTokenBal(); refetchEth(); refetchAllowance(); onSuccess()
    }
  }, [isConfirmed]) // eslint-disable-line react-hooks/exhaustive-deps

  const slippageBps = useMemo(() => {
    const s = parseFloat(slippage.replace(',', '.'))
    if (isNaN(s) || s < 0 || s > 100) return null
    return Math.floor(s * 100)
  }, [slippage])

  // Estimasi BUY (bigint, sesuai brief langkah 6).
  const buyCalc = useMemo(() => {
    try {
      if (!amount || Number(amount) <= 0) return { valid: false as const }
      if ((amount.split('.')[1] ?? '').length > 18) return { valid: false as const, reason: 'Maksimal 18 desimal.' }
      const quoteIn = parseEther(amount)
      if (quoteIn <= BigInt(0)) return { valid: false as const }
      const fee = (quoteIn * token.feeBps) / BigInt(10000)
      const tax = (quoteIn * token.creatorTaxBps) / BigInt(10000)
      const net = quoteIn - fee - tax
      if (net <= BigInt(0) || token.tokenReserve <= BigInt(0)) return { valid: true as const, quoteIn, tokensOut: BigInt(0) }
      const tokensOut = (net * token.tokenReserve) / (token.quoteReserve + net)
      return { valid: true as const, quoteIn, tokensOut }
    } catch { return { valid: false as const } }
  }, [amount, token])

  // Estimasi SELL: gross = tin*qR/(tR+tin), lalu potong fee+tax.
  const sellCalc = useMemo(() => {
    try {
      if (!amount || Number(amount) <= 0) return { valid: false as const }
      if ((amount.split('.')[1] ?? '').length > 18) return { valid: false as const, reason: 'Maksimal 18 desimal.' }
      const tokensIn = parseEther(amount)
      if (tokensIn <= BigInt(0)) return { valid: false as const }
      if (token.tokenReserve <= BigInt(0)) return { valid: true as const, tokensIn, quoteOut: BigInt(0) }
      const gross = (tokensIn * token.quoteReserve) / (token.tokenReserve + tokensIn)
      const fee = (gross * token.feeBps) / BigInt(10000)
      const tax = (gross * token.creatorTaxBps) / BigInt(10000)
      return { valid: true as const, tokensIn, quoteOut: gross - fee - tax }
    } catch { return { valid: false as const } }
  }, [amount, token])

  const isWrongNetwork = isConnected && chainId !== robinhoodTestnet.id
  const minTokensOut = buyCalc.valid && slippageBps !== null ? (buyCalc.tokensOut * (BigInt(10000) - BigInt(slippageBps))) / BigInt(10000) : BigInt(0)
  const minQuoteOut = sellCalc.valid && slippageBps !== null ? (sellCalc.quoteOut * (BigInt(10000) - BigInt(slippageBps))) / BigInt(10000) : BigInt(0)

  const buyDisabled =
    isWrongNetwork || !buyCalc.valid || slippageBps === null ||
    (buyCalc.valid && ethBalance ? buyCalc.quoteIn > ethBalance.value : false) ||
    token.phase !== 0

  const sellDisabled =
    isWrongNetwork || !sellCalc.valid || slippageBps === null ||
    (sellCalc.valid && typeof tokenBalance === 'bigint' ? sellCalc.tokensIn > tokenBalance : false) ||
    token.phase !== 0

  const needApprove = tab === 'sell' && sellCalc.valid &&
    (typeof allowance !== 'bigint' || allowance < sellCalc.tokensIn)

  const handleBuy = () => {
    if (!buyCalc.valid || !address || buyDisabled) return
    reset()
    writeContract({
      address: token.curve, abi: BondingCurveABI, functionName: 'buy',
      args: [buyCalc.quoteIn, minTokensOut, address], value: buyCalc.quoteIn,
    })
  }

  const handleApprove = () => {
    if (!sellCalc.valid) return
    reset()
    writeContract({
      address: token.address, abi: LauncherTokenABI, functionName: 'approve',
      args: [token.curve, sellCalc.tokensIn],
    })
  }

  const handleSell = () => {
    if (!sellCalc.valid || !address || sellDisabled) return
    reset()
    writeContract({
      address: token.curve, abi: BondingCurveABI, functionName: 'sell',
      args: [sellCalc.tokensIn, minQuoteOut, address],
    })
  }

  const errorMsg = friendlyError(writeError ?? txError)

  let actualOut: string | null = null
  if (receipt?.logs?.length) {
    for (const log of receipt.logs) {
      try {
        const topic = log.topics[0]?.toLowerCase()
        if (topic === CURVE_BUY_TOPIC.toLowerCase()) {
          const d = decodeEventLog({ abi: [CURVE_BUY_ABI], data: log.data, topics: log.topics })
          if (d.eventName === 'CurveBuy') { actualOut = `${formatTokenAmount((d.args as { tokensOut: bigint }).tokensOut)} ${token.symbol}`; break }
        } else if (topic === CURVE_SELL_TOPIC.toLowerCase()) {
          const d = decodeEventLog({ abi: [CURVE_SELL_ABI], data: log.data, topics: log.topics })
          if (d.eventName === 'CurveSell') { actualOut = `${formatEther((d.args as { quoteOut: bigint }).quoteOut)} ETH`; break }
        }
      } catch { /* abaikan log lain */ }
    }
  }

  const balLow = tab === 'buy'
    ? (buyCalc.valid && ethBalance ? buyCalc.quoteIn > ethBalance.value : false)
    : (sellCalc.valid && typeof tokenBalance === 'bigint' ? sellCalc.tokensIn > tokenBalance : false)

  return (
    <div className="p-6 sm:p-7 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-emerald-400" />
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-xl font-bold text-white tracking-tight">Trade {token.symbol}</h3>
        <div className="flex bg-black/40 rounded-lg p-1 border border-white/10 text-sm">
          {(['buy', 'sell'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setAmount(''); reset() }}
              className={`px-4 py-1.5 rounded-md font-semibold capitalize transition-colors ${tab === t ? (t === 'buy' ? 'bg-blue-600 text-white' : 'bg-rose-600 text-white') : 'text-slate-400 hover:text-white'}`}>
              {t === 'buy' ? 'Buy' : 'Sell'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 relative z-10">
        <div>
          <label className="block text-sm text-slate-300 font-medium mb-1.5">
            Amount ({tab === 'buy' ? 'ETH you spend' : `${token.symbol} you sell`})
          </label>
          <div className="relative">
            <input type="number" value={amount} min="0" step="any"
              onChange={e => setAmount(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all font-mono text-lg"
              placeholder="0.0" />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
              {tab === 'buy' ? 'ETH' : token.symbol}
            </div>
          </div>
          {buyCalc.valid === false && sellCalc.valid === false && amount !== '' && (
            <p className="text-rose-400 text-xs mt-1.5">Jumlah tidak valid (harus angka &gt; 0, maks 18 desimal).</p>
          )}
          {balLow && <p className="text-rose-400 text-sm mt-1.5">⚠️ Saldo tidak cukup</p>}
        </div>

        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-sm text-slate-300 font-medium">Slippage tolerance</label>
            <div className="flex gap-1">
              {['0.5', '1', '2', '5'].map(p => (
                <button key={p} onClick={() => setSlippage(p)}
                  className={`px-2 py-0.5 text-xs rounded border ${slippage === p ? 'bg-blue-600 border-blue-500 text-white' : 'border-white/10 text-slate-400 hover:text-white'}`}>
                  {p}%
                </button>
              ))}
            </div>
          </div>
          <input type="number" value={slippage} min="0" max="100" step="0.1"
            onChange={e => setSlippage(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500/50 font-mono"
            placeholder="1" />
          {slippageBps === null && <p className="text-rose-400 text-xs mt-1">Slippage harus 0–100.</p>}
        </div>

        <div className="p-4 bg-black/40 rounded-xl border border-white/5 space-y-2 text-sm">
          {tab === 'buy' ? (
            <>
              <div className="flex justify-between"><span className="text-slate-400">You pay</span><span className="font-semibold">{amount || '0'} ETH</span></div>
              <div className="flex justify-between"><span className="text-slate-400">You get (est.)</span><span className="font-mono text-emerald-400">{buyCalc.valid ? formatTokenAmount(buyCalc.tokensOut) : '0'} {token.symbol}</span></div>
              <div className="flex justify-between text-xs text-slate-500"><span>Min. receive</span><span className="font-mono">{formatTokenAmount(minTokensOut)} {token.symbol}</span></div>
              <div className="flex justify-between text-xs text-slate-500"><span>Fee / creator tax</span><span className="font-mono">{Number(token.feeBps) / 100}% / {Number(token.creatorTaxBps) / 100}%</span></div>
            </>
          ) : (
            <>
              <div className="flex justify-between"><span className="text-slate-400">You sell</span><span className="font-semibold">{amount || '0'} {token.symbol}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">You get (est.)</span><span className="font-mono text-emerald-400">{sellCalc.valid ? formatEther(sellCalc.quoteOut) : '0'} ETH</span></div>
              <div className="flex justify-between text-xs text-slate-500"><span>Min. receive</span><span className="font-mono">{formatEther(minQuoteOut)} ETH</span></div>
              {needApprove && <p className="text-amber-400 text-xs">Butuh approve dulu sebelum sell.</p>}
            </>
          )}
        </div>

        <div className="text-sm flex justify-between items-center px-1">
          <span className="text-slate-400">Your {token.symbol}:</span>
          <span className="font-mono font-bold bg-white/5 px-2 py-0.5 rounded-md">
            {typeof tokenBalance === 'bigint' ? formatTokenAmount(tokenBalance) : '0'}
          </span>
        </div>

        {errorMsg && <div className="p-3 bg-red-950/50 border border-red-900 rounded-lg text-red-300 text-sm">{errorMsg}</div>}

        {isConfirmed && receipt && (
          <div className="p-3 bg-green-950/50 border border-green-900 rounded-lg text-green-300 text-sm">
            <p className="font-bold">Transaksi berhasil!</p>
            <p>Dapat: {actualOut ?? '—'}</p>
            {hash && <a href={explorerTxUrl(hash)} target="_blank" rel="noreferrer" className="underline">Lihat di Explorer</a>}
          </div>
        )}

        {tab === 'buy' ? (
          !isConnected ? (
            <button onClick={handleConnect}
              className="w-full py-3 rounded-xl font-bold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer">
              Connect Wallet untuk Beli
            </button>
          ) : (
          <button onClick={handleBuy} disabled={buyDisabled || isWriting || isConfirming}
            className={`w-full py-3 rounded-xl font-bold transition-all ${buyDisabled || isWriting || isConfirming ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'}`}>
            {isWriting ? 'Konfirmasi di wallet…' : isConfirming ? 'Pending… (menunggu blok)' :
              isWrongNetwork ? 'Wrong Network' :
              token.phase !== 0 ? 'Not Available (bukan phase 0)' : 'Buy Token'}
          </button>
          )
        ) : !isConnected ? (
          <button onClick={handleConnect}
            className="w-full py-3 rounded-xl font-bold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer">
            Connect Wallet untuk Jual
          </button>
        ) : needApprove ? (
          <button onClick={handleApprove} disabled={sellDisabled || isWriting || isConfirming}
            className={`w-full py-3 rounded-xl font-bold ${sellDisabled || isWriting || isConfirming ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-500 text-white'}`}>
            {isWriting ? 'Konfirmasi di wallet…' : isConfirming ? 'Pending…' : `Approve ${token.symbol}`}
          </button>
        ) : (
          <button onClick={handleSell} disabled={sellDisabled || isWriting || isConfirming}
            className={`w-full py-3 rounded-xl font-bold ${sellDisabled || isWriting || isConfirming ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-rose-600 hover:bg-rose-500 text-white cursor-pointer'}`}>
            {isWriting ? 'Konfirmasi di wallet…' : isConfirming ? 'Pending… (menunggu blok)' :
              isWrongNetwork ? 'Wrong Network' :
              token.phase !== 0 ? 'Not Available (bukan phase 0)' : 'Sell Token'}
          </button>
        )}

        {hash && (isConfirming || isConfirmed) && (
          <div className="text-center text-sm">
            <a href={explorerTxUrl(hash)} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Lihat tx di Explorer</a>
            <span className="text-slate-500"> · </span>
            <a href={explorerAddressUrl(token.curve)} target="_blank" rel="noreferrer" className="text-slate-400 hover:underline">Curve</a>
          </div>
        )}
      </div>
    </div>
  )
}
