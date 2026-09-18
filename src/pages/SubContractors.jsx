import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/lib/UserContext';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Users, FileText, CheckCircle } from 'lucide-react';
import SubContractorDirectory from '@/components/subcontractors/SubContractorDirectory';
import BidRequestsList from '@/components/subcontractors/BidRequestsList';
import BidRequestFormDialog from '@/components/subcontractors/BidRequestFormDialog';
import SubContractorFormDialog from '@/components/subcontractors/SubContractorFormDialog';

const ALLOWED_ROLES = ['owner', 'admin', 'coo'];

export default function SubContractors() {
  const { currentUser } = useCurrentUser();
  const [tab, setTab] = useState('bids');
  const [showNewBid, setShowNewBid] = useState(false);
  const [showNewSub, setShowNewSub] = useState(false);
  const queryClient = useQueryClient();

  if (!ALLOWED_ROLES.includes(currentUser?.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">You don't have access to this page.</p>
      </div>
    );
  }

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['sub-contractors'] });
    queryClient.invalidateQueries({ queryKey: ['bid-requests'] });
    queryClient.invalidateQueries({ queryKey: ['bid-submissions'] });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-butler">Sub Contractors</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your sub-contractor directory and bid requests</p>
        </div>
        <div className="flex gap-2">
          {tab === 'directory' && (
            <Button onClick={() => setShowNewSub(true)} size="sm">
              <Plus className="w-4 h-4 mr-1" /> Add Contractor
            </Button>
          )}
          {tab === 'bids' && (
            <Button onClick={() => setShowNewBid(true)} size="sm">
              <Plus className="w-4 h-4 mr-1" /> New Bid Request
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6 w-full max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="bids" className="flex items-center gap-2 shrink-0">
            <FileText className="w-4 h-4" /> Bid Requests
          </TabsTrigger>
          <TabsTrigger value="accepted" className="flex items-center gap-2 shrink-0">
            <CheckCircle className="w-4 h-4" /> Accepted Bids
          </TabsTrigger>
          <TabsTrigger value="directory" className="flex items-center gap-2 shrink-0">
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
          <SubContractorDirectory onRefresh={refresh} onAdd={() => setShowNewSub(true)} />
        </TabsContent>
      </Tabs>

      <BidRequestFormDialog
        open={showNewBid}
        onOpenChange={setShowNewBid}
        onSaved={refresh}
      />
      <SubContractorFormDialog
        open={showNewSub}
        onOpenChange={setShowNewSub}
        onSaved={refresh}
      />
    </div>
  );
}