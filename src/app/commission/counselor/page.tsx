import { PayoutPage } from '@/app/commission/_components/payout-page'

export const metadata = { title: 'Counselor Commission' }
export const dynamic = 'force-dynamic'

export default function CounselorCommissionPage() {
  return <PayoutPage payeeType="COUNSELOR" title="Counselor Commission" />
}
