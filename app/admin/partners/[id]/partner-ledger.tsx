'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X, HandCoins, ArrowRightLeft, UserPlus, Briefcase } from 'lucide-react'

type Client = { id: string; company_name: string }

type Props = {
  partnerId: string
  commissionPct: number
  clients: Client[]
}

type ModalType = 'referral' | 'outbound' | 'inbound' | 'settle' | null

export function PartnerLedger({ partnerId, commissionPct, clients }: Props) {
  const router = useRouter()
  const [modal, setModal] = useState<ModalType>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const [referralForm, setReferralForm] = useState({
    clientId: '',
    dealAmount: '',
    description: '',
    occurredOn: today,
  })

  const [outboundForm, setOutboundForm] = useState({
    title: '',
    amount: '',
    clientId: '',
    occurredOn: today,
  })

  const [inboundForm, setInboundForm] = useState({
    title: '',
    amount: '',
    clientId: '',
    occurredOn: today,
  })

  const [settleNotes, setSettleNotes] = useState('')

  const referralCommission = referralForm.dealAmount && parseFloat(referralForm.dealAmount) > 0
    ? (parseFloat(referralForm.dealAmount) * commissionPct) / 100
    : 0

  const close = () => {
    setModal(null)
    setError(null)
  }

  const post = async (url: string, body: object) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Mislukt')
      close()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onbekende fout')
    } finally {
      setLoading(false)
    }
  }

  const submitReferral = () => {
    if (!referralForm.clientId) { setError('Selecteer een klant'); return }
    if (!referralForm.dealAmount || parseFloat(referralForm.dealAmount) <= 0) { setError('Voer een geldige dealwaarde in'); return }
    post(`/api/admin/partners/${partnerId}/ledger`, {
      kind: 'commission_owed',
      amount: referralCommission,
      client_id: referralForm.clientId,
      description: referralForm.description
        || `Referralcommissie ${commissionPct}% op €${parseFloat(referralForm.dealAmount).toFixed(2)}`,
      occurred_on: referralForm.occurredOn,
    })
  }

  const submitOutbound = () => {
    if (!outboundForm.title.trim()) { setError('Voer een opdrachttitel in'); return }
    if (!outboundForm.amount || parseFloat(outboundForm.amount) <= 0) { setError('Voer een geldig bedrag in'); return }
    post(`/api/admin/partners/${partnerId}/ledger`, {
      kind: 'payout_owed',
      amount: parseFloat(outboundForm.amount),
      client_id: outboundForm.clientId || null,
      description: outboundForm.title,
      occurred_on: outboundForm.occurredOn,
    })
  }

  const submitInbound = () => {
    if (!inboundForm.title.trim()) { setError('Voer een opdrachttitel in'); return }
    if (!inboundForm.amount || parseFloat(inboundForm.amount) <= 0) { setError('Voer een geldig bedrag in'); return }
    post(`/api/admin/partners/${partnerId}/ledger`, {
      kind: 'service_billed',
      amount: -parseFloat(inboundForm.amount), // negative → partner owes us
      client_id: inboundForm.clientId || null,
      description: inboundForm.title,
      occurred_on: inboundForm.occurredOn,
    })
  }

  const submitSettle = () => {
    post(`/api/admin/partners/${partnerId}/settle`, {
      notes: settleNotes || null,
    })
  }

  const inp = 'input-base'
  const lbl = 'block text-sm font-medium text-gray-700 mb-1'

  const modalTitle = {
    referral: 'Referral toevoegen',
    outbound: 'Opdracht aan partner',
    inbound: 'Opdracht van partner',
    settle: 'Settlement aanmaken',
  }

  const handleAction = () => {
    if (modal === 'referral') return submitReferral()
    if (modal === 'outbound') return submitOutbound()
    if (modal === 'inbound') return submitInbound()
    if (modal === 'settle') return submitSettle()
  }

  return (
    <>
      <div className="card-base">
        <h2 className="font-semibold mb-4">Ledger acties</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setError(null); setModal('referral') }}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <UserPlus className="h-4 w-4" />
            Referral toevoegen
          </button>
          <button
            onClick={() => { setError(null); setModal('outbound') }}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <Briefcase className="h-4 w-4" />
            Opdracht aan partner
          </button>
          <button
            onClick={() => { setError(null); setModal('inbound') }}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <ArrowRightLeft className="h-4 w-4" />
            Opdracht van partner
          </button>
          <button
            onClick={() => { setError(null); setModal('settle') }}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <HandCoins className="h-4 w-4" />
            Settlement aanmaken
          </button>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">{modalTitle[modal]}</h3>
              <button onClick={close} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Referral */}
            {modal === 'referral' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">
                  De partner heeft een klant aangebracht. De commissie ({commissionPct}%) wordt automatisch berekend op de dealwaarde.
                </p>
                <div>
                  <label className={lbl}>Klant *</label>
                  <select
                    className={inp}
                    value={referralForm.clientId}
                    onChange={(e) => setReferralForm((p) => ({ ...p, clientId: e.target.value }))}
                  >
                    <option value="">Selecteer klant...</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.company_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Dealwaarde (€) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inp}
                    placeholder="1000"
                    value={referralForm.dealAmount}
                    onChange={(e) => setReferralForm((p) => ({ ...p, dealAmount: e.target.value }))}
                  />
                  {referralCommission > 0 && (
                    <p className="text-xs text-green-600 font-medium mt-1">
                      → Commissie aan partner: €{referralCommission.toFixed(2)} ({commissionPct}%)
                    </p>
                  )}
                </div>
                <div>
                  <label className={lbl}>Datum</label>
                  <input
                    type="date"
                    className={inp}
                    value={referralForm.occurredOn}
                    onChange={(e) => setReferralForm((p) => ({ ...p, occurredOn: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={lbl}>Omschrijving (optioneel)</label>
                  <input
                    className={inp}
                    placeholder="Wordt automatisch ingevuld..."
                    value={referralForm.description}
                    onChange={(e) => setReferralForm((p) => ({ ...p, description: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {/* Outbound (we → partner) */}
            {modal === 'outbound' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">
                  Wij wijzen de partner een opdracht toe. Het bedrag wordt als openstaande uitbetaling geregistreerd.
                </p>
                <div>
                  <label className={lbl}>Opdrachttitel *</label>
                  <input
                    className={inp}
                    placeholder="Fotoshoot december"
                    value={outboundForm.title}
                    onChange={(e) => setOutboundForm((p) => ({ ...p, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={lbl}>Uitbetalingsbedrag (€) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inp}
                    placeholder="500"
                    value={outboundForm.amount}
                    onChange={(e) => setOutboundForm((p) => ({ ...p, amount: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={lbl}>Gekoppelde klant (optioneel)</label>
                  <select
                    className={inp}
                    value={outboundForm.clientId}
                    onChange={(e) => setOutboundForm((p) => ({ ...p, clientId: e.target.value }))}
                  >
                    <option value="">Geen specifieke klant</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.company_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Datum</label>
                  <input
                    type="date"
                    className={inp}
                    value={outboundForm.occurredOn}
                    onChange={(e) => setOutboundForm((p) => ({ ...p, occurredOn: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {/* Inbound (partner → us) */}
            {modal === 'inbound' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">
                  De partner geeft ons een opdracht. Het factuurbedrag wordt als vordering geregistreerd (partner betaalt ons).
                </p>
                <div>
                  <label className={lbl}>Opdrachttitel *</label>
                  <input
                    className={inp}
                    placeholder="Social media strategie"
                    value={inboundForm.title}
                    onChange={(e) => setInboundForm((p) => ({ ...p, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={lbl}>Factuurbedrag (€) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inp}
                    placeholder="750"
                    value={inboundForm.amount}
                    onChange={(e) => setInboundForm((p) => ({ ...p, amount: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={lbl}>Gekoppelde klant (optioneel)</label>
                  <select
                    className={inp}
                    value={inboundForm.clientId}
                    onChange={(e) => setInboundForm((p) => ({ ...p, clientId: e.target.value }))}
                  >
                    <option value="">Geen specifieke klant</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.company_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Datum</label>
                  <input
                    type="date"
                    className={inp}
                    value={inboundForm.occurredOn}
                    onChange={(e) => setInboundForm((p) => ({ ...p, occurredOn: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {/* Settle */}
            {modal === 'settle' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">
                  Alle openstaande ledger-items worden samengebracht in één afrekening. De netto balans wordt berekend en alle items worden gemarkeerd als afgerekend.
                </p>
                <div>
                  <label className={lbl}>Notities (optioneel)</label>
                  <textarea
                    rows={3}
                    className={inp}
                    placeholder="Afrekening periode Q1 2026..."
                    value={settleNotes}
                    onChange={(e) => setSettleNotes(e.target.value)}
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleAction}
                disabled={loading}
                className="btn-primary flex-1 justify-center"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {modal === 'settle' ? 'Settlement aanmaken' : 'Toevoegen'}
              </button>
              <button onClick={close} disabled={loading} className="btn-secondary">
                Annuleren
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
