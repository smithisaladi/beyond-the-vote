import { useParams } from 'react-router-dom'
import RepresentativeDetailPage from '@/components/representatives/RepresentativeDetailPage'

export default function RepresentativeDetailRoute() {
  const { id = '' } = useParams<{ id: string }>()
  return <RepresentativeDetailPage id={id} />
}
