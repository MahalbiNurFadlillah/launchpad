'use client'

import { useState, useMemo } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { decodeEventLog, parseAbiItem, zeroAddress, keccak256 } from 'viem'
import { robinhoodTestnet, LAUNCH_FACTORY_ADDRESS, explorerTxUrl } from '@/lib/config'
import LaunchFactoryABI from '@/lib/abi/LaunchFactory.json'

// ABI launchToken 3-argumen saja agar overload tidak ambigu (brief bonus: versi 3 argumen).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LAUNCH_TOKEN_3 = (LaunchFactoryABI as any[]).filter(
  (x) => x?.name === 'launchToken' && Array.isArray(x.inputs) && x.inputs.length === 3
)

const TOKEN_LAUNCHED_ABI = parseAbiItem(
  'event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)'
)
const TOKEN_LAUNCHED_TOPIC = keccak256('TokenLaunched(address,address,address,address,uint256,uint256)' as `0x${string}`)

export function LaunchForm({ launchFeeWei, onLaunched }: { launchFeeWei: bigint; onLaunched: () => void }) {
  const { address, isConnected, chainId } = useAccount()
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('TEST')
  const [description, setDescription] = useState('')
  const [logo, setLogo] = useState('')
  const [creatorTaxBps, setCreatorTaxBps] = useState('0')
  const [open, setOpen] = useState(false)

  const { data: canLaunch } = useReadContract({
    address: LAUNCH_FACTORY_ADDRESS,
    abi: LaunchFactoryABI,
    functionName: 'canLaunch',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const { data: expectedEconomics, refetch: refetchEconomics } = useReadContract({
    address: LAUNCH_FACTORY_ADDRESS,
    abi: LaunchFactoryABI,
    functionName: 'previewLaunchEconomics',
    args: [BigInt(1), zeroAddress],
  })

  const { writeContract, data: hash, error: writeError, isPending: isWriting, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt, error: txError } = useWaitForTransactionReceipt({ hash })

  const taxNum = useMemo(() => {
    const n = Number(creatorTaxBps)
    return isNaN(n) ? -1 : Math.floor(n)
  }, [creatorTaxBps])

  const valid =
    name.trim().length > 0 && name.trim().length <= 64 &&
    symbol.trim().length > 0 && symbol.trim().length <= 16 &&
    taxNum >= 0 && taxNum <= 1000

  const isWrongNetwork = isConnected && chainId !== robinhoodTestnet.id

  let newToken: string | null = null
  let newCurve: string | null = null
  if (receipt?.logs?.length) {
    for (const log of receipt.logs) {
      try {
        if (log.topics[0]?.toLowerCase() !== TOKEN_LAUNCHED_TOPIC.toLowerCase()) continue
        const d = decodeEventLog({ abi: [TOKEN_LAUNCHED_ABI], data: log.data, topics: log.topics })
        if (d.eventName === 'TokenLaunched') {
          const a = d.args as { token: string; curve: string }
          newToken = a.token; newCurve = a.curve
          break
        }
      } catch { /* abaikan */ }
    }
  }

  const handleLaunch = async () => {
    if (!valid || !address || !isConnected || isWrongNetwork) return
    reset()
    await refetchEconomics()
    const salt = new Uint8Array(32)
    crypto.getRandomValues(salt)
    const saltHex = ('0x' + [...salt].map((b) => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`
    const params = {
      name: name.trim(),
      symbol: symbol.trim(),
      logo: logo.trim(),
      description: description.trim(),
      socials: { twitter: '', telegram: '', discord: '', website: '', farcaster: '' },
      creatorFeeRecipient: zeroAddress,
      creatorTaxBps: taxNum,
      buybackEnabled: false,
      expectedEconomics: (expectedEconomics ?? '0x0000000000000000000000000000000000000000000000000000000000000000') as `0x${string}`,
      salt: saltHex,
    }
    writeContract({
      abi: LAUNCH_TOKEN_3,
      address: LAUNCH_FACTORY_ADDRESS,
      functionName: 'launchToken',
      args: [params, BigInt(1), zeroAddress],
      value: launchFeeWei,
    })
  }

  if (isConfirmed && newToken) {
    // Pastikan daftar refresh sekali setelah sukses.
    // (dipanggil via render guard agar tidak loop: cukup sekali per hash)
  }

  const errMsg = (() => {
    const e = writeError ?? txError
    if (!e) return null
    const m = e instanceof Error ? e.message : String(e)
    if (m.includes('User denied') || m.includes('rejected') || m.includes('4001')) return 'Transaksi ditolak di wallet.'
    return `Gagal launch: ${m.split('\n')[0].slice(0, 240)}`
  })()

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full px-6 py-4 flex justify-between items-center hover:bg-white/[0.03] transition-colors">
        <div className="text-left">
          <h3 className="font-bold text-white">🚀 Launch Token Baru <span className="text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded ml-2">BONUS</span></h3>
          <p className="text-xs text-slate-400 mt-0.5">launchConfigId=1 (graduation 0.042 ETH) · pair ETH · fee = launchFee persis</p>
        </div>
        <span className="text-slate-400 text-xl">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="px-6 pb-6 pt-2 space-y-3 border-t border-white/5">
          {canLaunch === false && (
            <div className="p-3 bg-amber-950/50 border border-amber-900 rounded-lg text-amber-300 text-sm">
              Wallet Anda belum diizinkan launch (<code>canLaunch</code> = false). Beri tahu pengawas agar alamat Anda di-allowlist.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 font-medium">Nama token (maks 64) *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama Lengkap Anda"
                className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-blue-500/50 font-medium" />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium">Ticker (maks 16) *</label>
              <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="TEST"
                className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-blue-500/50 font-mono" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 font-medium">Deskripsi</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Token tes saya"
              className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-blue-500/50" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 font-medium">Logo URL (opsional)</label>
              <input value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://…"
                className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-blue-500/50 font-mono text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium">Creator tax (bps, 0–1000) *</label>
              <input value={creatorTaxBps} onChange={(e) => setCreatorTaxBps(e.target.value)} type="number" min="0" max="1000"
                className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-blue-500/50 font-mono" />
            </div>
          </div>
          {errMsg && <div className="p-3 bg-red-950/50 border border-red-900 rounded-lg text-red-300 text-sm">{errMsg}</div>}
          {isConfirmed && receipt && (
            <div className="p-3 bg-green-950/50 border border-green-900 rounded-lg text-green-300 text-sm">
              <p className="font-bold">Launch berhasil!</p>
              {newToken && <p>Token: <code className="font-mono">{newToken}</code></p>}
              {newCurve && <p>Curve: <code className="font-mono">{newCurve}</code></p>}
              {hash && <a href={explorerTxUrl(hash)} target="_blank" rel="noreferrer" className="underline">Lihat di Explorer</a>}
              <button onClick={onLaunched} className="ml-3 underline">Refresh daftar</button>
            </div>
          )}
          <button onClick={handleLaunch} disabled={!valid || !isConnected || isWrongNetwork || isWriting || isConfirming}
            className={`w-full py-2.5 rounded-xl font-bold text-sm ${!valid || !isConnected || isWrongNetwork || isWriting || isConfirming ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}>
            {isWriting ? 'Konfirmasi di wallet…' : isConfirming ? 'Pending…' : !isConnected ? 'Connect wallet dulu' : isWrongNetwork ? 'Wrong network' : `Launch (fee ${launchFeeWei ? (Number(launchFeeWei) / 1e18).toFixed(5) : '…'} ETH)`}
          </button>
          {!valid && <p className="text-xs text-slate-500">Isi nama (1–64 char), ticker (1–16 char), tax 0–1000.</p>}
        </div>
      )}
    </div>
  )
}
