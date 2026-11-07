import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

const [filePath, mediaType] = process.argv.slice(2)
if (!filePath || !mediaType) {
  console.error('Usage: bun scripts/upload-swarm.ts <public-file> <content-type>')
  process.exit(2)
}

const bytes = await readFile(filePath)
if (bytes.length > 25_000_000) throw new Error('Demo upload exceeds the 25 MB limit')
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')
const upload = await fetch('https://api.gateway.ethswarm.org/bzz', {
  method: 'POST',
  headers: { 'Content-Type': mediaType, 'Swarm-File-Name': basename(filePath) },
  body: new Uint8Array(bytes),
})
if (!upload.ok) throw new Error(`Swarm upload failed: HTTP ${upload.status}`)
const result = await upload.json() as { reference?: string }
if (!result.reference || !/^[0-9a-f]{64}$/.test(result.reference)) throw new Error('Invalid public Swarm reference')

const url = `https://bzz.link/bzz/${result.reference}/`
const downloaded = await fetch(url)
if (!downloaded.ok) throw new Error(`Separate gateway read failed: HTTP ${downloaded.status}`)
const actual = sha256(new Uint8Array(await downloaded.arrayBuffer()))
const expected = sha256(bytes)
if (actual !== expected) throw new Error(`Readback SHA-256 mismatch for ${result.reference}`)
console.log(JSON.stringify({ file: basename(filePath), bytes: bytes.length, contentType: mediaType, reference: result.reference, sha256: expected, readback: url, verified: true }))
