# Arkiv + Swarm proof

## What lives where

Swarm holds a public demo job request, two character reference images, an output manifest and the 15-second Akira MP4. Arkiv Rabdi holds a readonly, provider-signed `argo.hiring-desk.asset-proof.v1` entity. Its `requestRef`, `outputRef` and `videoRef` string attributes point to three Swarm files. Its `record` bytes attribute contains the five Swarm references and SHA-256 digests. The `/akira` app page reads that entity directly from Rabdi, checks those fields, and links to the assets. The video plays from a bundled copy and has a direct link to the Swarm copy.

This entity is an asset-linkage proof. It is not a client-signed job, provider claim or delivery record. The click-through job and payment on `/akira` are simulated. The live public hiring board remains at `/`.

## Public evidence

| Item | Value |
|---|---|
| Arkiv network | Rabdi, chain ID `7794095` |
| Entity key | `0xd89a7d7f8b804a954dee120c7b72718cfca49345319d7981c7cdd83e00759544` |
| Creator | Akira provider wallet `0x26443703F6dF2fD599B86a0bC9c652088411C0c6` |
| Transaction | [Rabdi explorer](https://rabdi.explorer.arkiv.network/tx/0xe29596a5f2b8f2bee35c9face3b0b72997826d6a445ab5288f4b2500c4ef3c54) |
| `requestRef` | [Public job request](https://bzz.link/bzz/a2575070c574f37aa103295a7fd94fc8bd6d811b1fbf386c17346745fd80570d/) |
| `outputRef` | [Public job output manifest](https://bzz.link/bzz/0da5b890c0b4a4e3017121776e714ec001ea35848648b013c8ae4c2a533ac158/) |
| `videoRef` | [15-second video](https://bzz.link/bzz/8a1a814af4e5844e90455aaade4352cb352c9769d6b5ae0b6ae310817bbf3dc6/) |

The request and output files are representative demo artifacts. They were prepared to prove public file storage and linkage to Arkiv. The video was supplied separately; the simulated app did not generate it.

## Upload route and postage

The files were uploaded on 2026-11-07 through `https://api.gateway.ethswarm.org/bzz`, the Swarm Foundation public gateway, without a caller-supplied batch ID. The service accepted the uploads and returned references. It did **not** disclose the postage batch ID, batch buyer wallet, or retention horizon in its responses. Those required prize evidence fields are unknown. This proof alone does not establish full Arkiv + Swarm bonus eligibility or durable retention through judging. The Arkiv writing wallet above is not evidence of who paid Swarm postage.

Before the event, Argo's Second Brain already had an internal agent board. The five Swarm uploads, asset-proof Arkiv entity, and `/akira` proof UI were added on 2026-11-07. The public app itself started as an Arc Studio project. The production job lifecycle still needs a client-signed Arkiv job and provider-signed delivery linked to a real execution.

## Reproduce upload and read

`scripts/upload-swarm.ts` uploads one explicitly chosen public file through the gateway and downloads it through `bzz.link`, failing unless SHA-256 matches. `scripts/verify-arkiv-swarm.ts` reads the entity by key from Rabdi's public RPC, downloads all five Swarm files, and checks their hashes. The app's read code is in `src/demo/AkiraDirectoryDemo.tsx`.

From the repository root with Bun installed:

```bash
bun scripts/upload-swarm.ts public/akira-distributed-network-15s.mp4 video/mp4
bun scripts/verify-arkiv-swarm.ts
```

The upload command should return a JSON object with a 64-hex reference, the local SHA-256 and `verified: true`. The verifier should print five `SHA-256 verified` lines and the Arkiv creator address. Uploading again relies on the gateway's current availability and policy; the existing read-only verification needs no wallet key. Rabdi's no-key public RPC is heavily rate-limited, so retry later if it returns HTTP 429. For a future controlled upload, use an upload-capable Bee node and a funded postage batch that can be identified in this file.

## Demo moment and friction

On `/akira`, show the live Arkiv read status and entity transaction, open the job request and video links on Swarm, then play the delivered-state sample. A final demo recording timestamp has not been captured yet.

The public gateway made upload fast, but its response gave no batch ID or expiry. Arkiv's public RPC works for the direct entity read but is rate-limited without a Hub access key. The initial SDK read returned the `record` bytes as a hex string, so the verifier decodes it before comparing hashes.

## Sources

- [Arkiv Rabdi docs](https://docs.arkiv.network/networks/rabdi/)
- [Swarm upload and download docs](https://docs.ethswarm.org/docs/develop/upload-and-download/)
- [ETHGlobal Mumbai Arkiv + Swarm requirements](https://ethglobal.com/events/mumbai/prizes)
