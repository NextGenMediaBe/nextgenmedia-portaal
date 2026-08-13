export const dynamic = 'force-dynamic'

import { getOrCreatePipeline } from '@/lib/sales/service'
import { PipelineClient } from './pipeline-client'

// Pipeline — één algemene lijst met prospects van NextGenMedia zelf. Onze
// appointment setters bellen hieruit en boeken in de agenda van Bram of Marco.
export default async function SalesPipelinePage() {
  const pipeline = await getOrCreatePipeline()

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Alle prospects op één plek. Interesse? Boek de afspraak via de knop bij de lead.
        </p>
      </div>
      <PipelineClient pipelineId={pipeline.id} />
    </div>
  )
}
