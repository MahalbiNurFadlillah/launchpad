'use client'

import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { robinhoodTestnet } from '@/lib/config'
import { formatEther } from 'viem'

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethereum?: { request: (params: { method: string; params?: any }) => Promise<any> }
  }
}

export function ConnectWallet() {
  const { address, isConnected, chainId } = useAccount()
  const { data: balance } = useBalance({
    address,
    query: { refetchInterval: 5000 },
  })
  const { connectors, connect, isPending: isConnecting, error: connectError } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()

  const hasEthereum = typeof window !== 'undefined' && !!window.ethereum

  const isWrongNetwork = isConnected && chainId !== robinhoodTestnet.id

  // Satu tombol: coba switch, kalau chain belum ada di MetaMask (error 4902) langsung add.
  const handleSwitch = async () => {
    try {
      await switchChainAsync({ chainId: robinhoodTestnet.id })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      const code = (e as { code?: number })?.code
      if (code === 4902 || msg.includes('4902') || msg.includes('Unrecognized chain')) {
        try {
          await window.ethereum?.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: `0x${robinhoodTestnet.id.toString(16)}`,
                chainName: robinhoodTestnet.name,
                nativeCurrency: robinhoodTestnet.nativeCurrency,
                rpcUrls: [robinhoodTestnet.rpcUrls.default.http[0]],
                blockExplorerUrls: [robinhoodTestnet.blockExplorers.default.url],
              },
            ],
          })
          await switchChainAsync({ chainId: robinhoodTestnet.id })
        } catch (err) {
          console.warn('add/switch chain failed', err)
        }
      } else {
        // Fallback: coba add juga (beberapa wallet tidak lempar 4902).
        try {
          await window.ethereum?.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: `0x${robinhoodTestnet.id.toString(16)}`,
                chainName: robinhoodTestnet.name,
                nativeCurrency: robinhoodTestnet.nativeCurrency,
                rpcUrls: [robinhoodTestnet.rpcUrls.default.http[0]],
                blockExplorerUrls: [robinhoodTestnet.blockExplorers.default.url],
              },
            ],
          })
        } catch (err) {
          console.warn('add chain failed', err)
        }
      }
    }
  }

  if (!isConnected) {
    // MetaMask / provider tidak ada: arahkan install, bukan tombol mati.
    if (!hasEthereum) {
      return (
        <a
          href="https://metamask.io/download/"
          target="_blank"
          rel="noreferrer"
          className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors"
        >
          Install MetaMask
        </a>
      )
    }
    if (connectors.length === 0) {
      return (
        <div className="text-xs text-red-300 bg-red-950/40 border border-red-900/60 px-3 py-2 rounded-lg">
          Wallet tidak terdeteksi. Install MetaMask lalu refresh.
        </div>
      )
    }
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex gap-2">
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              onClick={() => connect({ connector })}
              disabled={isConnecting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg font-medium transition-colors cursor-pointer"
            >
              {isConnecting ? 'Connecting… (cek popup wallet)' : 'Connect Wallet'}
            </button>
          ))}
        </div>
        {connectError && (
          <p className="text-[11px] text-red-300 max-w-[240px] text-right">
            Gagal connect: {(connectError as Error).message.split('\n')[0].slice(0, 120)}
          </p>
        )}
      </div>
    )
  }

  const ethBalanceFormatted = balance ? formatEther(balance.value) : '0'

  return (
    <div className="flex items-center gap-3 flex-wrap justify-end">
      {isWrongNetwork ? (
        <div className="flex items-center gap-2 bg-red-950/40 border border-red-900/60 px-3 py-2 rounded-lg">
          <span className="text-xs text-red-300 font-medium">Wrong network</span>
          <button
            onClick={handleSwitch}
            disabled={isSwitching}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {isSwitching ? 'Switching...' : 'Switch to Robinhood Testnet'}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 bg-slate-800/80 px-4 py-2 rounded-lg border border-white/10">
          <div className="text-sm font-medium" title={ethBalanceFormatted}>
            {Number(ethBalanceFormatted).toFixed(4)} ETH
          </div>
          <div className="w-px h-4 bg-slate-600"></div>
          <div className="text-sm font-mono text-slate-300" title={address}>
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </div>
        </div>
      )}
      <button
        onClick={() => disconnect()}
        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
      >
        Disconnect
      </button>
    </div>
  )
}
