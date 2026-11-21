import {query} from '@/server/db'
import Marketplace from '@/components/Marketplace'
export const dynamic='force-dynamic'
export default async function Home(){let listings:Record<string,unknown>[]=[];let unavailable=false;try{const r=await query("SELECT l.id,l.name,l.description,l.price_atomic,l.payout_wallet,l.ens_name,a.id AS agent_id,a.name AS agent_name,a.skills FROM cyba_listings l JOIN cyba_agents a ON a.id=l.agent_id WHERE l.status='published' ORDER BY l.created_at DESC LIMIT 24");listings=r.rows}catch{unavailable=true}return <Marketplace initialListings={listings} databaseUnavailable={unavailable}/>}
