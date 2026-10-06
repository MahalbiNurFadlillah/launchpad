import { formatEther } from 'viem'

/**
 * Format harga ETH per token yang sangat kecil (spot price bonding curve)
 * tanpa pernah menampilkan "0.00".
 */
export function formatTinyEthPerToken(quoteReserve: bigint, tokenReserve: bigint): string {
  if (tokenReserve <= BigInt(0) || quoteReserve <= BigInt(0)) {
    return '—'
  }

  const pricePer1e18 = (quoteReserve * BigInt(10 ** 18)) / tokenReserve

  if (pricePer1e18 === BigInt(0)) {
    return '<0.000000000000000001 ETH'
  }

  const formatted = formatEther(pricePer1e18)

  if (pricePer1e18 >= BigInt(10 ** 18)) {
    const num = Number(formatEther(pricePer1e18))
    return num.toFixed(6) + ' ETH'
  }

  const decimalIndex = formatted.indexOf('.')
  if (decimalIndex === -1) {
    return formatted.slice(0, 8) + ' ETH'
  }

  const afterDot = formatted.slice(decimalIndex + 1)
  const leadingZeros = afterDot.match(/^0+/)?.[0].length ?? 0

  if (leadingZeros === 0) {
    const num = Number(formatted)
    return num.toFixed(6) + ' ETH'
  }

  const significant = afterDot.slice(leadingZeros, leadingZeros + 4).replace(/0+$/, '') || '0'
  const subscriptDigits = [...String(leadingZeros)].map((d) => {
    const map = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉']
    return map[Number(d)]
  }).join('')

  return `0.0${subscriptDigits}${significant} ETH`
}

/**
 * Format besar ETH (saldo, fee, dll) readable.
 */
export function formatEth(value: bigint): string {
  const v = formatEther(value)
  const num = Number(v)
  if (Number.isNaN(num)) return v
  if (num >= 1) {
    return num.toFixed(4)
  }
  return num.toPrecision(4).replace(/\.?0+$/, '')
}

/** Format jumlah token ERC20 (18 desimal) dengan ribuan separator, max 4 desimal. */
export function formatTokenAmount(value: bigint): string {
  try {
    const s = formatEther(value)
    const [i, d = ''] = s.split('.')
    const intFmt = Number(i).toLocaleString('en-US')
    if (!d || /^0+$/.test(d)) return intFmt
    const dec = d.slice(0, 4).replace(/0+$/, '')
    return dec ? `${intFmt}.${dec}` : intFmt
  } catch {
    return '0'
  }
}

/** Label phase sesuai brief langkah 4. */
export function phaseLabel(phase: number): string {
  switch (phase) {
    case 0: return 'Bonding Curve'
    case 1: return 'Filled, pending pool'
    case 2: return 'Graduated'
    case 3: return 'Cancelled'
    default: return 'Unknown'
  }
}
