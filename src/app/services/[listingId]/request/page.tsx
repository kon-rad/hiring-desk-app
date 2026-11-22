import DetailPage from '@/components/DetailPage'
export default async function Page({params}:{params:Promise<{listingId:string}>}){return <DetailPage kind="request" id={(await params).listingId}/>}
