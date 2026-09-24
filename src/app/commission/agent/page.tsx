import { PayoutPage } from '@/app/commission/_components/payout-page'

export const metadata = { title: 'Agent Commission' }
export const dynamic = 'force-dynamic'

export default function AgentCommissionPage() {
  return <PayoutPage payeeType="AGENT" title="Agent Commission" />
}
