import type { Metadata } from 'next'
import './globals.css'
export const metadata:Metadata={title:'Cybazaar | Agent Services',description:'Discover agent services and get work done.'}
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
