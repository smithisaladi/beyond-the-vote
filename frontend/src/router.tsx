import { createBrowserRouter } from 'react-router-dom'
import { RootLayout } from '@/components/layout/RootLayout'
import HomePage from '@/pages/HomePage'
import BillsPage from '@/pages/BillsPage'
import BillDetailPage from '@/pages/BillDetailPage'
import VoteBreakdownPage from '@/pages/VoteBreakdownPage'
import RepresentativesPage from '@/pages/RepresentativesPage'
import RepresentativeDetailPage from '@/pages/RepresentativeDetailPage'
import DonorsPage from '@/pages/DonorsPage'
import PacDetailPage from '@/pages/PacDetailPage'
import SettingsPage from '@/pages/SettingsPage'
import PrivacyPage from '@/pages/PrivacyPage'
import TermsPage from '@/pages/TermsPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'bills', element: <BillsPage /> },
      { path: 'bills/:id', element: <BillDetailPage /> },
      { path: 'bills/:id/votes/:voteId', element: <VoteBreakdownPage /> },
      { path: 'representatives', element: <RepresentativesPage /> },
      { path: 'representatives/:id', element: <RepresentativeDetailPage /> },
      { path: 'donors', element: <DonorsPage /> },
      { path: 'donors/:cmteId', element: <PacDetailPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'privacy', element: <PrivacyPage /> },
      { path: 'terms', element: <TermsPage /> },
    ],
  },
])
