declare module '@circlefin/compass-chains' {
  export interface CompassChain { name: string; explorerUrl?: string; nativeCurrency: { symbol: string } }
  export function getChain(id: string): CompassChain
}
