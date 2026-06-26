'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Pencil, Trash2, Mail, Phone, MapPin, Briefcase, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import SubContractorFormDialog from './SubContractorFormDialog'

export default function SubContractorDirectory() {
  const supabase = createClient()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<any>(null)
  const [deleting, setDeleting] = useState<any>(null)

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ['sub-contractors'],
    queryFn: async () => {
      const { data } = await supabase.from('sub_contractors').select('*').order('created_at', { ascending: false })
      return data ?? []
    },
  })

  const handleDelete = async () => {
    if (!deleting) return
    await supabase.from('sub_contractors').delete().eq('id', deleting.id)
    toast.success('Contractor removed')
    setDeleting(null)
    qc.invalidateQueries({ queryKey: ['sub-contractors'] })
  }

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-[#7A7560]" /></div>

  if (subs.length === 0) return (
    <div className="text-center py-16 text-[#7A7560]">
      <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p className="font-medium">No sub-contractors yet</p>
      <p className="text-sm mt-1">Add contractors to invite them to bid on projects.</p>
    </div>
  )

  return (
    <>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(subs as any[]).map(sub => (
          <div key={sub.id} className="bg-[#F7F4EE] border border-[#D4CFBA] rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-[#3d3d1e]">{sub.business_name || sub.contact_name}</p>
                {sub.business_name && sub.contact_name && (
                  <p className="text-xs text-[#7A7560]">{sub.contact_name}</p>
                )}
              </div>
              {sub.contractor_types?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {sub.contractor_types.slice(0, 2).map((t: string) => (
                    <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                  ))}
                  {sub.contractor_types.length > 2 && (
                    <Badge variant="outline" className="text-[10px]">+{sub.contractor_types.length - 2}</Badge>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-1.5 text-sm text-[#7A7560]">
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 shrink-0" />
                <a href={`mailto:${sub.email}`} className="hover:text-[#3d3d1e] truncate">{sub.email}</a>
              </div>
              {sub.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 shrink-0" />
                  <span>{sub.phone}</span>
                </div>
              )}
              {sub.billing_address && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{sub.billing_address}</span>
                </div>
              )}
            </div>
            {sub.notes && <p className="text-xs text-[#7A7560] border-t border-[#D4CFBA] pt-2">{sub.notes}</p>}
            <div className="flex gap-2 pt-1 border-t border-[#D4CFBA]">
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => setEditing(sub)}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleting(sub)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <SubContractorFormDialog
        open={!!editing}
        onOpenChange={v => !v && setEditing(null)}
        sub={editing}
        onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ['sub-contractors'] }) }}
      />

      <AlertDialog open={!!deleting} onOpenChange={v => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Contractor</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {deleting?.business_name || deleting?.contact_name} from your directory?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
