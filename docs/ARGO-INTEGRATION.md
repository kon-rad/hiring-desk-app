# Durable upstream integration

`HIRING_DESK_UPSTREAM` is the production durable authority. It must expose the exact routes and response contracts in the README, apply the same role/ownership/state validation, store opaque short-lived sessions, reserve unique job/transaction hashes atomically, and independently verify Base receipts. The gateway forwards only allow-listed JSON routes to this fixed origin and returns 502 on failure; it never invents data.
