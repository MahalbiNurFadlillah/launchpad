import { createPublicClient, http, parseAbiItem, parseEther, formatEther } from 'viem';

const chain = {
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
  rpcUrls: { default: { http: ['https://robinhood-sepolia-rpc.publicnode.com'] } },
};

const factoryAbi = [
  {
    type: 'function',
    name: 'getLaunchedToken',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'tuple', internalType: 'struct ILaunchFactory.LaunchedToken', components: [
      { name: 'token', type: 'address', internalType: 'address' },
      { name: 'curve', type: 'address', internalType: 'address' },
      { name: 'deployer', type: 'address', internalType: 'address' },
      { name: 'creatorFeeRecipient', type: 'address', internalType: 'address' },
      { name: 'pairToken', type: 'address', internalType: 'address' },
      { name: 'graduationThreshold', type: 'uint256', internalType: 'uint256' },
      { name: 'poolFee', type: 'uint24', internalType: 'uint24' },
      { name: 'tickSpacing', type: 'int24', internalType: 'int24' },
      { name: 'creatorTaxBps', type: 'uint16', internalType: 'uint16' },
      { name: 'buybackEnabled', type: 'bool', internalType: 'bool' },
      { name: 'phase', type: 'uint8', internalType: 'uint8' },
      { name: 'sweptQuote', type: 'uint256', internalType: 'uint256' },
      { name: 'sweptTokens', type: 'uint256', internalType: 'uint256' },
      { name: 'sweptAt', type: 'uint256', internalType: 'uint256' },
      { name: 'exists', type: 'bool', internalType: 'bool' },
    ]}],
    stateMutability: 'view',
  },
];

const curveAbi = [
  {
    type: 'function',
    name: 'getReserves',
    inputs: [],
    outputs: [{ name: 'quoteReserve_', type: 'uint256' }, { name: 'tokenReserve_', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'feeBps',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'creatorTaxBps',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
];

const publicClient = createPublicClient({ chain, transport: http() });

const FRESH_TOKEN = '0xFaeA3Da0c58233d0f0193168Bc9B9383E5C08090';
const FACTORY = '0x533cE670f1372cb402D49866608b92e7bc2b4493';

console.log('Fetching launched token info for', FRESH_TOKEN);
const launched = await publicClient.readContract({
  address: FACTORY,
  abi: factoryAbi,
  functionName: 'getLaunchedToken',
  args: [FRESH_TOKEN],
});
const curve = launched.curve;
console.log('curve:', curve);
const phase = launched.phase;
console.log('phase:', phase);

console.log('Fetching reserves for curve', curve);
const reserves = await publicClient.readContract({
  address: curve,
  abi: curveAbi,
  functionName: 'getReserves',
});
const quoteReserve = reserves[0];
const tokenReserve = reserves[1];
console.log('quoteReserve:', formatEther(quoteReserve), '(', quoteReserve.toString(), ')');
console.log('tokenReserve:', formatEther(tokenReserve), '(', tokenReserve.toString(), ')');

const feeBps = (await publicClient.readContract({ address: curve, abi: curveAbi, functionName: 'feeBps' })).toString();
const creatorTaxBps = (await publicClient.readContract({ address: curve, abi: curveAbi, functionName: 'creatorTaxBps' })).toString();
console.log('feeBps:', feeBps.toString());
console.log('creatorTaxBps:', creatorTaxBps.toString());

const quoteIn = parseEther('0.01719');
console.log('quoteIn (wei):', quoteIn.toString());

const fee = (quoteIn * BigInt(feeBps)) / BigInt(10000);
const tax = (quoteIn * BigInt(creatorTaxBps)) / BigInt(10000);
const net = quoteIn - fee - tax;
console.log('fee:', formatEther(fee), fee.toString());
console.log('tax:', formatEther(tax), tax.toString());
console.log('net:', formatEther(net), net.toString());

if (quoteReserve + net > BigInt(0)) {
  const tokensOut = (net * tokenReserve) / (quoteReserve + net);
  console.log('tokensOut (wei):', tokensOut.toString());
  console.log('tokensOut (formatted):', formatEther(tokensOut));
  console.log('tokensOut per 1e18 tokens:', formatEther(tokensOut * BigInt(10) ** BigInt(18)));
} else {
  console.log('quoteReserve + net <= 0, cannot compute tokensOut');
}
