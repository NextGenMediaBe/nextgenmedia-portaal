import {
  Share2, Palette, LayoutDashboard, Eye, FileText, RefreshCw, Camera, Info,
} from 'lucide-react'

// Vaste interne onboarding-werkwijze. Puur informatief — geen checklist, geen
// statussen, geen automatisering. Bedoeld als geheugensteun zodat elke klant-
// onboarding op dezelfde manier verloopt.

const STEPS: Array<{ title: string; icon: React.ElementType; items: string[] }> = [
  {
    title: 'Metricool onboarden',
    icon: Share2,
    items: [
      'Instagram toegang ontvangen',
      'Facebook toegang ontvangen',
      'LinkedIn toegang ontvangen',
      'Andere platformen indien van toepassing',
      'Klant koppelen in Metricool',
    ],
  },
  {
    title: 'Logo & branding',
    icon: Palette,
    items: [
      'Logo ontvangen',
      'Brandbook ontvangen (indien aanwezig)',
      'Huisstijlkleuren ontvangen',
    ],
  },
  {
    title: 'NextGenMedia portal uitleggen',
    icon: LayoutDashboard,
    items: [
      'Dashboard uitleggen',
      'Contentkalender uitleggen',
      'Contracten uitleggen',
      'Feedbackflow uitleggen',
      'Website-aanpassingen uitleggen (indien van toepassing)',
    ],
  },
  {
    title: 'Metricool uitleggen',
    icon: Eye,
    items: [
      'Hoe content bekeken wordt',
      'Hoe content goedgekeurd wordt',
      'Hoe feedback gegeven wordt',
      'Hoe goedkeuringsmails werken',
    ],
  },
  {
    title: 'Strategie & scripts overlopen',
    icon: FileText,
    items: [
      'Contentstrategie bespreken',
      'Reels bespreken',
      'Posts bespreken',
      'Verwachtingen afstemmen',
    ],
  },
  {
    title: 'Revisieronde uitleggen',
    icon: RefreshCw,
    items: [
      '1 revisieronde per post',
      'Daarna finale goedkeuring',
    ],
  },
  {
    title: 'Contentshoot inplannen',
    icon: Camera,
    items: [
      'Datum vastleggen',
      'Tijdstip vastleggen',
      'Locatie bevestigen',
    ],
  },
]

export default function OnboardingInfoPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Onboarding Info</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Interne werkwijze voor het onboarden van een nieuwe klant
        </p>
      </div>

      {/* Toelichting */}
      <div className="card-base flex items-start gap-3 bg-[#fff848]/10 border-[#fff848]/40">
        <Info className="h-5 w-5 text-[#c5b800] shrink-0 mt-0.5" />
        <p className="text-sm text-gray-600">
          Vaste geheugensteun zodat elke onboarding volgens dezelfde stappen verloopt.
          Dit is enkel ter informatie — er wordt niets bijgehouden of afgevinkt.
        </p>
      </div>

      {/* Stappen */}
      <div className="grid gap-4 sm:grid-cols-2">
        {STEPS.map((step, i) => {
          const Icon = step.icon
          return (
            <div key={step.title} className="card-base">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-9 w-9 shrink-0 rounded-xl bg-[#fff848]/20 flex items-center justify-center font-bold text-sm text-black">
                  {i + 1}
                </div>
                <h2 className="font-semibold text-gray-900 flex items-center gap-2 min-w-0">
                  <Icon className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="truncate">{step.title}</span>
                </h2>
              </div>
              <ul className="space-y-1.5">
                {step.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
