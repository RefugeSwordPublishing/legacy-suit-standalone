'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Plus, FileText, CheckCircle, Users } from 'lucide-react'
import BidRequestsList from './BidRequestsList'
import BidRequestFormDialog from './BidRequestFormDialog'
import SubContractorDirectory from './SubContractorDirectory'
import SubContractorFormDialog from './SubContractorFormDialog'

export default function SubContractorsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('bids')
  const [showNewBid, setShowNewBid] = useState(false)
  const [showNewSub, setShowNewSub] = useState(false)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['bid-requests'] })
    qc.invalidateQueries({ queryKey: ['bid-submissions'] })
    qc.invalidateQueries({ queryKey: ['sub-contractors'] })
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#3d3d1e]">Sub Contractors</h1>
          <p className="text-sm text-[#7A7560] mt-0.5">Manage sub-contractor directory and bid requests</p>
        </div>
        <div className="flex gap-2">
          {tab === 'directory' && (
            <Button onClick={() => setShowNewSub(true)} size="sm" className="bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]">
              <Plus className="w-4 h-4 mr-1" /> Add Contractor
            </Button>
          )}
          {tab === 'bids' && (
            <Button onClick={() => setShowNewBid(true)} size="sm" className="bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]">
              <Plus className="w-4 h-4 mr-1" /> New Bid Request
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="bids" className="flex items-center gap-2">
            <FileText className="w-4 h-4" /> Bid Requests
          </TabsTrigger>
          <TabsTrigger value="accepted" className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4" /> Accepted Bids
          </TabsTrigger>
          <TabsTrigger value="directory" className="flex items-center gap-2">
            <Users className="w-4 h-4" /> Directory
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bids">
          <BidRequestsList statusFilter={['draft', 'sent', 'reviewing']} onRefresh={refresh} />
        </TabsContent>

        <TabsContent value="accepted">
          <BidRequestsList statusFilter={['awarded']} onRefresh={refresh} showAccepted />
        </TabsContent>

        <TabsContent value="directory">
          <SubContractorDirectory />
        </TabsContent>
      </Tabs>

      <BidRequestFormDialog open={showNewBid} onOpenChange={setShowNewBid} onSaved={() => { setShowNewBid(false); refresh() }} />
      <SubContractorFormDialog open={showNewSub} onOpenChange={setShowNewSub} onSaved={() => { setShowNewSub(false); refresh() }} />
    </div>
  )
}
