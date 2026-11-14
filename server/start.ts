import { createHandler } from './app'

const upstream = process.env.HIRING_DESK_UPSTREAM
if (!upstream) throw new Error('Set HIRING_DESK_UPSTREAM to the public Argo API base URL')
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.PORT ?? 3001),
  fetch: createHandler(upstream),
})
console.log(`Hiring Desk gateway listening on ${server.url}`)
