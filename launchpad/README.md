# Robinhood Testnet Launchpad

Frontend launchpad di **Robinhood Chain Testnet (chain ID 46630)**: menampilkan daftar token bonding curve dan memungkinkan user **membeli** (plus bonus: **sell**, **launch**, **graduation**, search/sort, riwayat trade).

## Cara Menjalankan

```bash
# 1. Masuk folder project
cd launchpad

# 2. Install dependencies
npm install

# 3. Jalankan dev server
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) dengan Chrome + MetaMask.

**Persiapan wallet (sesuai brief):**
1. Buat wallet MetaMask baru khusus tes ini.
2. Connect → kalau network salah, klik **"Switch to Robinhood Testnet"** (otomatis add chain kalau belum ada: RPC `https://robinhood-sepolia-rpc.publicnode.com`, explorer `https://explorer.testnet.chain.robinhood.com`).
3. Ambil ETH testnet di faucet `https://faucet.testnet.chain.robinhood.com/` (target ≥ 0,05 ETH). Kalau faucet macet, minta ke pengawas.

**Cek produksi:**

```bash
npm run build
npm start
```

## Pemetaan Langkah Brief → Kode

| Langkah | Status | Implementasi |
| --- | --- | --- |
| 1. Setup + network + `launchFee()` | ✅ | `src/lib/config.ts` (chain 46630, Multicall3), header di `src/app/page.tsx` menampilkan launchFee dari `useLaunchpad` |
| 2. Connect/disconnect, saldo, switch+add network | ✅ | `src/components/ConnectWallet.tsx` — satu tombol switch yang fallback ke `wallet_addEthereumChain` (error 4902) |
| 3. Daftar token dari `TokenLaunched` per 50.000 blok + token baru | ✅ | `src/hooks/useLaunchpad.ts` — chunk 50.000 blok dari `FACTORY_DEPLOY_BLOCK`, polling tiap 20 detik + tombol Refresh |
| 4. Data tiap token + harga + progres via Multicall3 | ✅ | 10 call/token dalam 1 `aggregate3(allowFailure)`: `name/symbol/logo/description`, `getReserves`, `realQuoteReserve`, `graduationThreshold`, `feeBps`, `creatorTaxBps`, `getLaunchedToken.phase`. Harga `quoteReserve/tokenReserve` format subscript (`0.0₅…`), progres `realQuote/threshold` basis-poin bigint cap 100% |
| 5. Daftar token + 3 state + responsif | ✅ | `src/components/TokenList.tsx` — kartu (logo/nama/simbol/harga/progress/phase), placeholder logo + fallback `onError`, state loading/kosong/gagal+retry, grid 1→2 kolom, panel trade sticky |
| 6. Form beli + estimasi + slippage | ✅ | `src/components/BuyForm.tsx` — rumus `fee/tax/net/tokensOut` bigint persis, `parseEther` (tolak >18 desimal), preset slippage 0.5/1/2/5 + custom, `minTokensOut`, tombol nonaktif sesuai 6 kondisi brief |
| 7. Tx `buy` + 5 state + error mapping | ✅ | `value == quoteIn`, `recipient = wallet`, `tokensOut` aktual dari event `CurveBuy` di receipt; state: konfirmasi-wallet / pending+explorer / sukses+jumlah+explorer / reject / revert; `SlippageExceeded` & `CurveGraduated` diterjemahkan |
| 8. Refresh setelah tx | ✅ | `onSuccess → refetch` + refetch saldo ETH & token; token terpilih disinkronkan ke data terbaru; daftar ikut update tanpa reload |
| 9. README + demo | ✅ | File ini + folder `/demo` |
| Bonus utama: launch `TEST` | ✅ | `src/components/LaunchForm.tsx` — overload 3-argumen, `launchConfigId=1`, `pairToken=0x0`, `value=launchFee` persis, `expectedEconomics=previewLaunchEconomics(1,0)` fresh, `salt` acak 32 byte, validasi nama ≤64 / simbol ≤16 / tax 0–1000, cek `canLaunch`, alamat baru dari event `TokenLaunched` |
| Bonus: sell | ✅ | Tab Sell di `BuyForm`: estimasi `gross=tin*qR/(tR+tin)` minus fee+tax, flow `approve` → `sell(tokensIn,minQuoteOut,recipient)`, `quoteOut` aktual dari event `CurveSell` |
| Bonus: detail + riwayat | ✅ | Deskripsi, deployer, alamat explorer, reserve, fee, riwayat `CurveBuy`/`CurveSell` (200k blok terakhir) per kartu |
| Bonus: sort/search | ✅ | Search nama/simbol/alamat, sort terbaru/progres/harga, filter phase |
| Bonus: graduation | ✅ | Tombol `createGraduatedPool(token)` muncul untuk phase 1 |

## Keputusan Teknis Penting

- **Next.js + wagmi v3 + viem v2 + Tailwind 4.** wagmi/viem dipilih karena typing ABI yang kuat dan `bigint` native — semua hitung uang tetap `bigint`, tidak pernah via `Number` sebelum selesai (kecuali untuk display).
- **Chunk `getLogs` 50.000 blok inklusif** (`from + 49999`), loop sampai `latestBlock`. Dedup berdasarkan alamat token lowercase.
- **Satu `aggregate3` untuk semua token** (10 call × N token). `allowFailure=true` agar satu token rusak tidak menggagalkan semuanya; decode per index dengan try/catch.
- **Estimasi 100% client-side** (tanpa RPC saat mengetik) memakai `feeBps`/`creatorTaxBps`/`reserves` yang sudah di-fetch.
- **Sell estimate** memakai rumus simetris buy (`gross − fee − tax`); diberi label "est." karena kontrak bisa punya pembulatan/internal tambahan.
- **Logo eksternal memakai `<img>` biasa** (bukan `next/image`) karena URL logo arbitrer dari kontrak; selalu ada placeholder huruf + fallback `onError`.
- **Token non-ETH (`pairToken != address(0)`) disaring** dan dijelaskan di sini (brief membolehkan saring + jelaskan). Alasan: rumus harga/estimasi dan `buy(value)` hanya valid untuk pair ETH.

## Apa yang Belum Selesai / Keterbatasan

- Tidak ada pagination virtual — dengan ratusan token, daftar akan panjang (multicall tetap 1 request, render bisa berat). Solusi lanjutan: virtualized list.
- Riwayat trade dibatasi 200k blok terakhir per curve (agar `getLogs` tidak kena limit 50k × banyak chunk saat dibuka).
- Estimasi sell adalah aproksimasi simetris; angka final tetap dari event `CurveSell`.
- `phaseLabel` hanya menampilkan 4 phase dari brief; phase tak dikenal → "Unknown".

## Bagian yang Dibantu AI

- Kerangka awal hook `useLaunchpad` (loop chunk `getLogs`, batching `aggregate3`) dan pola decode `decodeFunctionResult` per index.
- Rumus estimasi buy/sell dan konversi basis-poin.
- Pola error-mapping viem (`SlippageExceeded`, `CurveGraduated`, reject 4001) dan parsing event dari receipt.
- Desain Tailwind (kartu, progress bar, layout responsif). Semua kode direview dan disesuaikan manual ke ABI aktual (`feeBps`/`creatorTaxBps` sebagai `uint256`, overload `launchToken` 3-argumen).

## Masalah pada Brief / Kontrak

- Tidak ada masalah mayor. Brief konsisten dengan ABI terlampir (`LaunchFactory.json`, `BondingCurve.json`, `LauncherToken.json`).
- Catatan kecil: `feeBps()`/`creatorTaxBps()` di ABI bertipe `uint256` (bukan `uint16`), jadi decode harus tahan kedua tipe — ditangani dengan `BigInt(...)`.
- Harga FRESH saat verifikasi sangat kecil (quoteReserve ~0.02 ETH vs 800jt token) sehingga format subscript wajib — implementasi tidak pernah menampilkan `0.00` sesuai brief.

## Demo

Lihat folder [`/demo`](./demo/) — isi dengan screenshot/video hasil jalan sebelum submit:
- `demo/list.png` — daftar 5 token contoh,
- `demo/buy.png` — form beli + estimasi,
- `demo/tx-success.png` — sukses + link explorer.

> Catatan: screenshot diambil dari `npm run dev` + MetaMask di Robinhood Chain Testnet pada saat sesi.
