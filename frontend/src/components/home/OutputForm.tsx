import { Baby, Toilet, Droplet, Droplets, CirclePile } from 'lucide-react'
import { SegmentedControl } from '@/components/home/SegmentedControl'

export function OutputForm({
  diaperType,
  setDiaperType,
  outputLocation,
  setOutputLocation,
}: {
  diaperType: 'wet' | 'dirty' | 'both'
  setDiaperType: (v: 'wet' | 'dirty' | 'both') => void
  outputLocation: 'diaper' | 'potty'
  setOutputLocation: (v: 'diaper' | 'potty') => void
}) {
  return (
    <>
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Where</label>
        <SegmentedControl
          options={['diaper', 'potty'] as const}
          value={outputLocation}
          onChange={setOutputLocation}
          labels={{
            diaper: <span className="flex items-center justify-center gap-1.5"><Baby   className="w-3.5 h-3.5" />Diaper</span>,
            potty:  <span className="flex items-center justify-center gap-1.5"><Toilet className="w-3.5 h-3.5" />Potty</span>,
          }}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Type</label>
        <SegmentedControl
          options={['wet', 'dirty', 'both'] as const}
          value={diaperType}
          onChange={setDiaperType}
          labels={{
            wet:   <span className="flex items-center justify-center gap-1.5"><Droplet    className="w-3.5 h-3.5" />Pee</span>,
            dirty: <span className="flex items-center justify-center gap-1.5"><CirclePile className="w-3.5 h-3.5" />Poo</span>,
            both:  <span className="flex items-center justify-center gap-1.5"><Droplets   className="w-3.5 h-3.5" />Both</span>,
          }}
        />
      </div>
    </>
  )
}
