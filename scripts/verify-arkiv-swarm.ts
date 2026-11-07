import { createHash } from 'node:crypto'

const entityKey = process.argv[2] ?? '0xd89a7d7f8b804a954dee120c7b72718cfca49345319d7981c7cdd83e00759544'
if (!/^0x[0-9a-f]{64}$/.test(entityKey)) throw new Error('Expected a 32-byte Arkiv entity key')

const rpc = await fetch('https://rpc.rabdi.db-chain.testnet.arkiv.network', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'arkiv_getEntity', params: [entityKey] }),
})
if (!rpc.ok) throw new Error(`Arkiv read failed: HTTP ${rpc.status}`)
const response = await rpc.json() as { result?: { key?: string; creator?: string; attributes?: { name: string; value: string }[] }; error?: { message?: string } }
if (response.error || response.result?.key?.toLowerCase() !== entityKey) throw new Error(response.error?.message ?? 'Arkiv entity absent or mismatched')
const entity = response.result
const attributes = new Map(entity.attributes?.map(({ name, value }) => [name, value]))
if (attributes.get('arkiv.schema') !== 'argo.hiring-desk.asset-proof.v1' || attributes.get('kind') !== 'asset-proof') throw new Error('Unexpected Arkiv schema or kind')
const encoded = attributes.get('record')
if (!encoded || !/^0x(?:[0-9a-f]{2})+$/i.test(encoded)) throw new Error('Missing Arkiv asset record')
const bytes = Uint8Array.from(encoded.slice(2).match(/.{2}/g) ?? [], (pair) => parseInt(pair, 16))
const record = JSON.parse(new TextDecoder().decode(bytes)) as { assets?: Record<string, { ref?: string; sha256?: string }> }
if (!record.assets || Object.keys(record.assets).length !== 5) throw new Error('Expected five asset references')
for (const [name, asset] of Object.entries(record.assets)) {
  if (!asset.ref || !/^[0-9a-f]{64}$/.test(asset.ref) || !asset.sha256 || !/^[0-9a-f]{64}$/.test(asset.sha256)) throw new Error(`Invalid ${name} reference or digest`)
  const file = await fetch(`https://bzz.link/bzz/${asset.ref}/`)
  if (!file.ok) throw new Error(`${name}: Swarm download failed with HTTP ${file.status}`)
  const digest = createHash('sha256').update(new Uint8Array(await file.arrayBuffer())).digest('hex')
  if (digest !== asset.sha256) throw new Error(`${name}: SHA-256 mismatch`)
  console.log(`${name}: swarm://${asset.ref} SHA-256 verified`)
}
if (attributes.get('requestRef') !== record.assets.request?.ref || attributes.get('outputRef') !== record.assets.output?.ref || attributes.get('videoRef') !== record.assets.video?.ref) throw new Error('Arkiv top-level reference mismatch')
console.log(`Arkiv entity ${entityKey} verified; creator ${entity.creator}; five Swarm assets matched`)
