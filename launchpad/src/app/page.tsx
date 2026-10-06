'use client'

import { ConnectWallet } from '@/components/ConnectWallet'
import { TokenList } from '@/components/TokenList'
import { LaunchForm } from '@/components/LaunchForm'
import { useLaunchpad } from '@/hooks/useLaunchpad'

export default function Home() {
  const { tokens, loading, refreshing, error, refetch, launchFee, launchFeeWei, lastUpdated } = useLaunchpad(20000)

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-emerald-600/20 rounded-full blur-[120px] pointer-events-none" />

      <header className="border-b border-white/5 bg-white/5 sticky top-0 z-50 backdrop-blur-xl supports-[backdrop-filter]:bg-black/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-400 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
                🚀
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-300 to-emerald-300">
                Robinhood Launchpad
              </h1>
            </div>
            {launchFee !== '0' && (
              <div className="hidden sm:flex items-center gap-2 text-sm text-slate-300 bg-white/5 px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Launch Fee: <span className="font-mono font-medium">{launchFee} ETH</span>
              </div>
            )}
          </div>
          <ConnectWallet />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 relative z-10 space-y-6">
        <TokenList
          tokens={tokens}
          loading={loading}
          refreshing={refreshing}
          error={error}
          refetch={refetch}
          lastUpdated={lastUpdated}
        />
        <LaunchForm launchFeeWei={launchFeeWei} onLaunched={refetch} />
        <footer className="text-center text-xs text-slate-500 pt-4">
          Robinhood Chain Testnet (46630) · pair ETH saja · data dari event TokenLaunched + Multicall3 aggregate3
        </footer>
      </main>
    </div>
  )
}
