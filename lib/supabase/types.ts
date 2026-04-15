export interface UserMetadata {
  full_name?: string
  notification_preferences?: {
    email_enabled?: boolean
    frequency?: 'immediate' | 'daily' | 'weekly'
    notify_vote?: boolean
    notify_bill_status?: boolean
  }
}
