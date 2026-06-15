export interface ActivityItem {
  id: string
  politician: string | null
  action: string
  subject: string
  date: string
  timestamp: number
  href: string | null
  isAlert: boolean
}
