'use client'
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useMemo, useEffect } from 'react'
import { TokenInfo } from '@/hooks/useLaunchpad'
import { BuyForm } from './BuyForm'
import { formatEther, createPublicClient, http, parseAbiItem } from 'viem'
import type { Address } from 'viem'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { robinhoodTestnet, LAUNCH_FACTORY_ADDRESS, explorerAddressUrl } from '@/lib/config'
import LaunchFactoryABI from '@/lib/abi/LaunchFactory.json'

function TokenLogo({ token }: { token: TokenInfo }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [token.address, token.logo])
  if (token.logo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={token.logo} alt={token.name} loading="lazy"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover" />
    )
  }
  return (
    <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-slate-200 to-slate-500">
      {(token.symbol?.[0] ?? '?').toUpperCase()}
    </span>
  )
}

function PhaseBadge({ phase }: { phase: number }) {
  const map: Record<number, { text: string; cls: string }> = {
    0: { text: 'Bonding Curve', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    1: { text: 'Filled, pending pool', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    2: { text: 'Graduated', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    3: { text: 'Cancelled', cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  }
  const info = map[phase] ?? { text: 'Unknown', cls: 'bg-slate-500/10 text-slate-400 border-slate-500/20' }
  return <div className={`px-2.5 py-1 rounded-md text-xs font-semibold border whitespace-nowrap ${info.cls}`}>{info.text}</div>
}

const publicClient = createPublicClient({ chain: robinhoodTestnet, transport: http() })

function TradeHistory({ curve }: { curve: Address }) {
  const [trades, setTrades] = useState<{ hash: string; kind: string; who: string; amount: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const latest = await publicClient.getBlockNumber()
      const from = latest > BigInt(200000) ? latest - BigInt(200000) : BigInt(0)
      const buys = await publicClient.getLogs({
        address: curve,
        event: parseAbiItem('event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)'),
        fromBlock: from, toBlock: latest,
      })
      const sells = await publicClient.getLogs({
        address: curve,
        event: parseAbiItem('event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)'),
        fromBlock: from, toBlock: latest,
      })
      const all = [
        ...buys.map((l) => ({
          hash: l.transactionHash ?? '', kind: 'BUY',
          who: String((l.args as { buyer: string }).buyer),
          amount: `${formatEther((l.args as { quoteIn: bigint }).quoteIn)} ETH → ${formatEther((l.args as { tokensOut: bigint }).tokensOut).slice(0, 10)} tok`,
        })),
        ...sells.map((l) => ({
          hash: l.transactionHash ?? '', kind: 'SELL',
          who: String((l.args as { seller: string }).seller),
          amount: `${formatEther((l.args as { tokensIn: bigint }).tokensIn).slice(0, 10)} tok → ${formatEther((l.args as { quoteOut: bigint }).quoteOut)} ETH`,
        })),
      ]
      setTrades(all.slice(-10).reverse())
    } catch (e) { console.warn(e) }
    setLoading(false)
  }

  return (
    <div className="pt-2">
      <button onClick={() => { setOpen(!open); if (!open && trades.length === 0) load() }}
        className="text-xs text-blue-400 hover:underline">
        {open ? 'Sembunyikan riwayat' : 'Lihat riwayat CurveBuy/CurveSell'}
      </button>
      {open && (
        <div className="mt-2 space-y-1 text-xs max-h-40 overflow-auto">
          {loading && <p className="text-slate-500">Memuat…</p>}
          {!loading && trades.length === 0 && <p className="text-slate-500">Belum ada trade (atau di luar 200k blok terakhir).</p>}
          {trades.map((t, i) => (
            <div key={i} className="flex justify-between gap-2 bg-black/30 px-2 py-1 rounded border border-white/5">
              <span className={t.kind === 'BUY' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>{t.kind}</span>
              <span className="font-mono text-slate-300 truncate">{t.amount}</span>
              <span className="font-mono text-slate-500">{t.who.slice(0, 6)}…</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GraduateButton({ token, onDone }: { token: TokenInfo; onDone: () => void }) {
  const { isConnected, chainId } = useAccount()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash })
  useEffect(() => { if (isSuccess) onDone() }, [isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps
  if (token.phase !== 1) return null
  const ok = isConnected && chainId === robinhoodTestnet.id
  return (
    <div className="pt-2">
      <button disabled={!ok || isPending || isLoading}
        onClick={() => writeContract({ address: LAUNCH_FACTORY_ADDRESS, abi: LaunchFactoryABI, functionName: 'createGraduatedPool', args: [token.address] })}
        className={`w-full py-2 rounded-lg text-sm font-bold ${!ok || isPending || isLoading ? 'bg-slate-700 text-slate-500' : 'bg-amber-600 hover:bg-amber-500 text-white'}`}>
        {isPending ? 'Konfirmasi di wallet…' : isLoading ? 'Pending…' : 'Finish graduation → create pool'}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{(error as Error).message.slice(0, 160)}</p>}
    </div>
  )
}

export function TokenList({ tokens, loading, refreshing, error, refetch, lastUpdated }: {
  tokens: TokenInfo[]; loading: boolean; refreshing: boolean; error: string | null; refetch: () => void; lastUpdated: Date | null
}) {
  const [selected, setSelected] = useState<TokenInfo | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'newest' | 'progress' | 'priceAsc' | 'priceDesc'>('newest')
  const [phaseFilter, setPhaseFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = tokens.filter((t) => {
      if (phaseFilter !== 'all' && String(t.phase) !== phaseFilter) return false
      if (!q) return true
      return t.name.toLowerCase().includes(q) || t.symbol.toLowerCase().includes(q) || t.address.toLowerCase().includes(q)
    })
    if (sort === 'progress') list = [...list].sort((a, b) => b.progress - a.progress)
    if (sort === 'priceAsc' || sort === 'priceDesc') {
      const priceWei = (t: TokenInfo) => {
        if (t.tokenReserve <= BigInt(0)) return BigInt(0)
        return (t.quoteReserve * BigInt(10 ** 18)) / t.tokenReserve
      }
      list = [...list].sort((a, b) => {
        const pa = priceWei(a), pb = priceWei(b)
        return sort === 'priceAsc' ? (pa < pb ? -1 : 1) : (pa > pb ? -1 : 1)
      })
    }
    return list
  }, [tokens, query, sort, phaseFilter])

  // Sinkronkan token terpilih dengan data terbaru (langkah 8: daftar ikut update).
  useEffect(() => {
    if (selected) {
      const fresh = tokens.find((t) => t.address.toLowerCase() === selected.address.toLowerCase())
      if (fresh && fresh !== selected) setSelected(fresh)
    }
  }, [tokens]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
        <p>Loading tokens…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-red-300 bg-red-950/20 rounded-xl border border-red-900/50">
        <p className="mb-1 font-semibold">Gagal memuat daftar token</p>
        <p className="mb-4 text-sm text-red-400/80 max-w-lg text-center break-words">{error}</p>
        <button onClick={refetch} className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors">Coba lagi</button>
      </div>
    )
  }

  if (tokens.length === 0) {
    return (
      <div className="text-center p-12 text-slate-400 bg-slate-900/50 rounded-xl border border-slate-800">
        <p className="font-semibold text-slate-200">Daftar kosong</p>
        <p className="text-sm mt-1">Belum ada token ETH-pair yang ditemukan dari event.</p>
        <button onClick={refetch} className="mt-4 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm border border-white/10">Refresh</button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Launched Tokens ({filtered.length})</h2>
            <p className="text-xs text-slate-500 mt-1">
              {refreshing ? 'Memperbarui…' : lastUpdated ? `Update: ${lastUpdated.toLocaleTimeString()}` : ''} · auto-refresh 20 dtk · hanya pair ETH
            </p>
          </div>
          <button onClick={refetch} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium border border-white/10">
            {refreshing ? '…' : 'Refresh'}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search nama / simbol / alamat…"
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500/50" />
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}
            className="bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none">
            <option value="newest">Terbaru</option>
            <option value="progress">Progres tertinggi</option>
            <option value="priceAsc">Harga terendah</option>
            <option value="priceDesc">Harga tertinggi</option>
          </select>
          <select value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none">
            <option value="all">Semua phase</option>
            <option value="0">Phase 0 (curve)</option>
            <option value="1">Phase 1 (filled)</option>
            <option value="2">Phase 2 (graduated)</option>
            <option value="3">Phase 3 (cancelled)</option>
          </select>
        </div>

        {filtered.length === 0 && (
          <div className="text-center p-8 text-slate-400 bg-white/[0.02] rounded-xl border border-white/5 text-sm">
            Tidak cocok dengan pencarian/filter.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(token => {
            const isSelected = selected?.address === token.address
            return (
              <div key={token.address}
                onClick={() => setSelected(token)}
                className={`p-5 rounded-2xl border cursor-pointer transition-all duration-300 hover:-translate-y-1 ${isSelected ? 'border-blue-500/50 bg-blue-900/10 shadow-[0_8px_32px_-4px_rgba(59,130,246,0.2)]' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10'} backdrop-blur-xl relative overflow-hidden`}>
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center overflow-hidden shrink-0 border border-white/10">
                    <TokenLogo token={token} />
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <h3 className="font-bold text-lg truncate text-white" title={token.name}>{token.name}</h3>
                    <p className="text-sm text-blue-400 font-medium">${token.symbol}</p>
                    <a href={explorerAddressUrl(token.address)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                      className="text-[11px] font-mono text-slate-500 hover:text-blue-400">{token.address.slice(0, 10)}…{token.address.slice(-8)}</a>
                  </div>
                  <PhaseBadge phase={token.phase} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-400">Price</span>
                    <span className="font-mono text-slate-200 bg-slate-900/50 px-2 py-0.5 rounded border border-white/5">{token.price}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Collected</span>
                    <span className="font-mono">{formatEther(token.realQuoteReserve).slice(0, 8)} / {formatEther(token.graduationThreshold).slice(0, 8)} ETH</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Graduation</span>
                    <span className="text-emerald-400 font-semibold">{token.progress.toFixed(2)}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-900/80 rounded-full overflow-hidden border border-white/5">
                    <div className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 rounded-full transition-all duration-700" style={{ width: `${token.progress}%` }} />
                  </div>
                  {token.description && <p className="text-xs text-slate-500 line-clamp-2 pt-1">{token.description}</p>}
                  <div onClick={(e) => e.stopPropagation()}>
                    <TradeHistory curve={token.curve} />
                    <GraduateButton token={token} onDone={refetch} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="lg:col-span-1">
        <div className="sticky top-24">
          {selected ? (
            <BuyForm token={selected} onSuccess={refetch} />
          ) : (
            <div className="p-8 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-xl flex flex-col items-center justify-center min-h-[400px] text-center">
              <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-4 text-2xl border border-blue-500/20">✨</div>
              <h3 className="text-xl font-bold text-white mb-2">Pilih token</h3>
              <p className="text-slate-400 text-sm max-w-[220px]">Klik salah satu token untuk beli / jual.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
