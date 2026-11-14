import { ARC_PROOF, verifyArcProof } from '../src/demo/arcProof'

const receipt = await verifyArcProof()
console.log(JSON.stringify({ chainId: 5042002, transaction: ARC_PROOF.hash, from: ARC_PROOF.sender, to: ARC_PROOF.recipient, token: ARC_PROOF.token, amountUSDC: ARC_PROOF.amountUSDC, status: 'verified', ...receipt, explorer: ARC_PROOF.explorer }))
