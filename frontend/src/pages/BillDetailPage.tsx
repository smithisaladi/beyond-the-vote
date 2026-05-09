import { useParams } from 'react-router-dom'
import BillDetailPage from '@/components/bills/BillDetailPage'

export default function BillDetailRoute() {
  const { id = '' } = useParams<{ id: string }>()
  return <BillDetailPage id={decodeURIComponent(id)} />
}
