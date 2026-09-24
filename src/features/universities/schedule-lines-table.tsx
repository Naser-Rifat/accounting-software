import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TRIGGER_EVENTS } from '@/lib/commission/schedule'

export type ScheduleLineRow = {
  seq: number
  label: string
  percentOfTotal: string
  triggerEvent: string
  offsetDays: number
}

export function triggerLabel(code: string) {
  return TRIGGER_EVENTS.find((t) => t.code === code)?.label ?? code
}

/** Instalments of one agreement, as stored or as previewed. */
export function ScheduleLinesTable({ lines }: { lines: ScheduleLineRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>Instalment</TableHead>
          <TableHead className="w-28 text-right">% of total</TableHead>
          <TableHead className="w-40">Becomes eligible</TableHead>
          <TableHead className="w-24 text-right">+ days</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.seq}>
            <TableCell className="text-xs text-muted-foreground">{line.seq}</TableCell>
            <TableCell className="text-sm">{line.label}</TableCell>
            <TableCell className="text-right tabular-nums">
              {Number(line.percentOfTotal).toLocaleString('en-IN', { maximumFractionDigits: 4 })}%
            </TableCell>
            <TableCell className="text-sm">{triggerLabel(line.triggerEvent)}</TableCell>
            <TableCell className="text-right tabular-nums">{line.offsetDays}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
