import DetailPage from '@/components/DetailPage'
export default async function Page({params}:{params:Promise<{listingId:string}>}){return <DetailPage kind="service" id={(await params).listingId}/>}
