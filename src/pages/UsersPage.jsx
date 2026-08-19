import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/UserContext';
import { ROLE_LABELS } from '@/lib/permissions';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { UserPlus, Mail, Shield, Pencil, UserX, ToggleLeft, ToggleRight } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { SALARY_PERIODS, periodLabel, rateOnDate } from '@/lib/payRates';

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtMoney = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const fmtDate = (d) => {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const roleBadgeColors = {
  owner: 'bg-primary/10 text-primary border-primary/20',
  admin: 'bg-orange-100 text-orange-700 border-orange-200',
  coo: 'bg-purple-100 text-purple-700 border-purple-200',
  site_manager: 'bg-blue-100 text-blue-700 border-blue-200',
  crew_member: 'bg-slate-100 text-slate-600 border-slate-200',
  employee: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  client: 'bg-green-100 text-green-700 border-green-200',
};

export default function UsersPage() {
  const { currentUser, refreshUser } = useCurrentUser();
  const canEditUsers = ['owner', 'admin', 'coo'].includes(currentUser?.role);
  const allowedRolesForEdit = ['owner', 'admin', 'coo', 'site_manager', 'crew_member', 'employee', 'client'];
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [inviteRole, setInviteRole] = useState(''); // holds a custom_role id (or a base role in the no-custom-roles fallback)
  const [inviting, setInviting] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [editUserDetails, setEditUserDetails] = useState(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editRole, setEditRole] = useState('crew_member');
  const [editWage, setEditWage] = useState('');
  const [editPayType, setEditPayType] = useState('hourly');
  const [editSalary, setEditSalary] = useState('');
  const [editRatePeriod, setEditRatePeriod] = useState('year');
  const [editEffectiveDate, setEditEffectiveDate] = useState(todayStr());
  const [editRateNote, setEditRateNote] = useState('');
  const [editPayrollId, setEditPayrollId] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const canEditWage = ['owner', 'coo', 'admin'].includes(currentUser?.role);

  const { data: customRoles = [] } = useQuery({
    queryKey: ['custom-roles'],
    queryFn: () => base44.entities.CustomRole.list('sort_order', 100),
  });

  const { data: payRates = [] } = useQuery({
    queryKey: ['pay-rates'],
    queryFn: () => base44.entities.PayRate.list('-effective_date', 3000),
    enabled: canEditWage,
  });
  const ratesForUser = (uid) => payRates.filter(r => r.user_id === uid);
  // The custom role a user currently maps to (by base role + label, falling back to base role).
  const matchRole = (u) => customRoles.find(r => r.base_role === u.role && (u.role_label ? r.label === u.role_label : true))
    || customRoles.find(r => r.base_role === u.role);
  const displayRole = (u) => u.role_label || ROLE_LABELS[u.role] || u.role;

  // Use UserProfile as source of truth for user management
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['user-profiles'],
    queryFn: () => base44.entities.UserProfile.list(),
  });

  const [letGoUser, setLetGoUser] = useState(null);
  const [letGoImpact, setLetGoImpact] = useState(null);
  const [lettingGo, setLettingGo] = useState(false);
  const { toast } = useToast();

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: allTasks = [] } = useQuery({
    queryKey: ['all-tasks'],
    queryFn: () => base44.entities.Task.list(),
  });

  const handleInvite = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)) {
      alert('Please enter a valid email address.');
      return;
    }
    setInviting(true);
    // inviteRole is a custom_role id; resolve it to base_role + role_label (the edit dialog does the
    // same). Fall back to treating inviteRole as a base role if the tenant has no custom roles seeded.
    const cr = customRoles.find(r => r.id === inviteRole);
    const baseRole = cr ? cr.base_role : inviteRole;
    const roleLabel = cr ? cr.label : undefined;
    await base44.users.inviteUser(inviteEmail, (baseRole === 'owner' || baseRole === 'coo') ? 'admin' : 'user');
    // Create a UserProfile for the new user
    const allUsers = await base44.entities.User.list();
    const newUser = allUsers.find(u => u.email === inviteEmail);
    if (newUser) {
      const existing = await base44.entities.UserProfile.filter({ user_id: newUser.id });
      if (existing.length === 0) {
        await base44.entities.UserProfile.create({
          user_id: newUser.id,
          email: inviteEmail,
          first_name: inviteFirstName.trim() || '',
          last_name: inviteLastName.trim() || '',
          full_name: [inviteFirstName.trim(), inviteLastName.trim()].filter(Boolean).join(' '),
          role: baseRole,
          ...(roleLabel ? { role_label: roleLabel } : {}),
          ...(cr ? { custom_role_id: cr.id } : {}),
        });
      }
    }
    setInviting(false);
    setInviteOpen(false);
    setInviteEmail('');
    setInviteFirstName('');
    setInviteLastName('');
    setInviteRole('');
    queryClient.invalidateQueries({ queryKey: ['user-profiles'] });
  };

  const handleUpdateRole = async (profileId, role) => {
    await base44.entities.UserProfile.update(profileId, { role });
    queryClient.invalidateQueries({ queryKey: ['user-profiles'] });
  };

  const handleUpdateProjects = async (profileId, projectIds) => {
    await base44.entities.UserProfile.update(profileId, { assigned_project_ids: projectIds });
    queryClient.invalidateQueries({ queryKey: ['user-profiles'] });
    setEditUser(prev => prev ? { ...prev, assigned_project_ids: projectIds } : prev);
  };

  const [editIsActive, setEditIsActive] = useState(true);

  const openEditUser = (user) => {
    setEditFirstName(user.first_name || '');
    setEditLastName(user.last_name || '');
    setEditRole(matchRole(user)?.id || '');
    setEditIsActive(user.is_active !== false);

    // Prefill pay from the rate in force today (history wins), else the profile's legacy fields.
    const cur = rateOnDate(ratesForUser(user.user_id), todayStr());
    if (cur) {
      setEditPayType(cur.pay_type);
      if (cur.pay_type === 'salary') {
        setEditSalary(String(cur.amount));
        setEditRatePeriod(cur.rate_period === 'hour' ? 'year' : cur.rate_period);
        setEditWage('');
      } else {
        setEditWage(String(cur.amount));
        setEditRatePeriod('year');
        setEditSalary('');
      }
    } else {
      setEditPayType(user.pay_type || matchRole(user)?.pay_type || 'hourly');
      setEditWage(user.hourly_wage != null ? String(user.hourly_wage) : '');
      setEditSalary(user.annual_salary != null ? String(user.annual_salary) : '');
      setEditRatePeriod('year');
    }
    setEditEffectiveDate(todayStr());
    setEditRateNote('');
    setEditPayrollId(user.payroll_id || '');
    setEditUserDetails(user);
  };

  const handleSaveEditUser = async () => {
    setSavingEdit(true);
    const cr = customRoles.find(r => r.id === editRole);
    const updates = {
      first_name: editFirstName.trim() || undefined,
      last_name: editLastName.trim() || undefined,
      full_name: [editFirstName.trim(), editLastName.trim()].filter(Boolean).join(' ') || undefined,
      is_active: editIsActive,
    };
    if (cr) { updates.role = cr.base_role; updates.role_label = cr.label; updates.custom_role_id = cr.id; }

    if (canEditWage) {
      updates.payroll_id = editPayrollId.trim() || null;
    }

    if (canEditWage) {
      const period = editPayType === 'hourly' ? 'hour' : editRatePeriod;
      const amount = editPayType === 'hourly'
        ? (editWage !== '' ? parseFloat(editWage) : 0)
        : (editSalary !== '' ? parseFloat(editSalary) : 0);
      const effDate = editEffectiveDate || todayStr();

      // Log a new effective-dated rate only when it differs from the rate already in force on that date.
      const uid = editUserDetails.user_id;
      if (uid && amount > 0) {
        const cur = rateOnDate(ratesForUser(uid), effDate);
        const changed = !cur || cur.pay_type !== editPayType || Number(cur.amount) !== amount || cur.rate_period !== period;
        if (changed) {
          await base44.entities.PayRate.create({
            user_id: uid,
            pay_type: editPayType,
            amount,
            rate_period: period,
            effective_date: effDate,
            note: editRateNote.trim() || undefined,
            created_by: currentUser?.id,
          });
        }
      }

      // Keep the profile's cached fields in sync for quick display and legacy readers.
      updates.pay_type = editPayType;
      updates.hourly_wage = editPayType === 'hourly' ? amount : null;
      updates.annual_salary = editPayType === 'salary'
        ? (period === 'year' ? amount : period === 'month' ? amount * 12 : amount * 52)
        : null;
    }

    await base44.entities.UserProfile.update(editUserDetails.id, updates);
    setSavingEdit(false);
    setEditUserDetails(null);
    await queryClient.invalidateQueries({ queryKey: ['user-profiles'] });
    await queryClient.invalidateQueries({ queryKey: ['pay-rates'] });
    await refreshUser();
  };

  const openLetGo = (user) => {
    const userName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;
    // Count assigned projects
    const assignedProjects = (user.assigned_project_ids || []).map(pid => projects.find(p => p.id === pid)).filter(Boolean);
    // Count tasks assigned to this user (by name)
    const assignedTasks = allTasks.filter(t =>
      t.assigned_to === userName ||
      t.assigned_to === user.full_name ||
      (t.subtasks || []).some(st => st.assigned_to === userName || st.assigned_to === user.full_name)
    );
    setLetGoImpact({ assignedProjects, assignedTasks: assignedTasks.length, userName });
    setLetGoUser(user);
  };

  const handleLetGo = async () => {
    if (!letGoUser) return;
    setLettingGo(true);
    const { userName, assignedProjects, assignedTasks } = letGoImpact;

    // Delete the UserProfile record
    await base44.entities.UserProfile.delete(letGoUser.id);

    // Delete the User account if we have the user_id
    if (letGoUser.user_id) {
      await base44.entities.User.delete(letGoUser.user_id);
    }

    // Notify owners/COOs
    const owners = users.filter(u => u.role === 'owner' || u.role === 'coo');
    await Promise.all(owners.map(owner =>
      base44.entities.Notification.create({
        user_id: owner.user_id,
        type: 'client_request',
        title: `Employee Let Go: ${userName}`,
        message: `${userName} has been offboarded and removed. ${assignedProjects.length} project(s) and ${assignedTasks} task(s) may need reassignment.`,
        read: false,
      })
    ));

    toast({
      title: `${userName} has been offboarded`,
      description: `Their account has been removed. ${assignedProjects.length} project(s) and ${assignedTasks} task(s) may need reassignment.`,
    });
    setLettingGo(false);
    setLetGoUser(null);
    setLetGoImpact(null);
    queryClient.invalidateQueries({ queryKey: ['user-profiles'] });
  };

  const toggleProjectAssignment = (userId, projectId, currentAssigned) => {
    const current = currentAssigned || [];
    const updated = current.includes(projectId)
      ? current.filter(id => id !== projectId)
      : [...current, projectId];
    handleUpdateProjects(userId, updated);
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage team members and their permissions</p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <UserPlus className="w-4 h-4 mr-2" /> Invite User
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {users.map(user => {
            const role = user.role || 'crew_member';
            const isSelf = user.user_id === currentUser?.id;
            return (
              <Card key={user.id} className="border border-border">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-semibold text-primary">
                        {(user.first_name?.[0] || user.last_name?.[0]) || user.email?.[0] || '?'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium truncate ${user.is_active === false ? 'text-muted-foreground line-through' : ''}`}>{[user.first_name, user.last_name].filter(Boolean).join(' ') || user.full_name || 'Unnamed'}</p>
                        {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
                        {user.is_active === false && <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">Inactive</span>}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="w-3 h-3" />
                        {user.email}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Badge variant="outline" className={`${roleBadgeColors[role]} text-xs`}>
                        {displayRole(user)}
                      </Badge>
                      {canEditUsers && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEditUser(user)}>
                          <Pencil className="w-3 h-3 mr-1" /> Edit
                        </Button>
                      )}
                      {!isSelf && (
                        <>
                          {['site_manager', 'crew_member', 'employee', 'client'].includes(role) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => setEditUser(user)}
                            >
                              Projects
                            </Button>
                          )}
                          {canEditUsers && role !== 'owner' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={() => openLetGo(user)}
                            >
                              <UserX className="w-3 h-3 mr-1" /> Let Go
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {(role === 'site_manager' || role === 'crew_member') && user.assigned_project_ids?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {user.assigned_project_ids.map(pid => {
                        const p = projects.find(pr => pr.id === pid);
                        return p ? (
                          <Badge key={pid} variant="outline" className="text-xs bg-muted/50">{p.name}</Badge>
                        ) : null;
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="w-4 h-4" /> Invite User</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First Name</Label>
                <Input
                  value={inviteFirstName}
                  onChange={e => setInviteFirstName(e.target.value)}
                  placeholder="John"
                />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input
                  value={inviteLastName}
                  onChange={e => setInviteLastName(e.target.value)}
                  placeholder="Smith"
                />
              </div>
            </div>
            <div>
              <Label>Email Address</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="name@company.com"
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
                <SelectContent>
                  {customRoles.length > 0
                    ? customRoles.map(r => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)
                    : ['owner', 'admin', 'coo', 'site_manager', 'crew_member', 'employee', 'client']
                        .map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r] || r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleInvite}
              disabled={!inviteEmail || !inviteRole || inviting}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {inviting ? 'Sending...' : 'Send Invite'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      {editUserDetails && (
        <Dialog open={!!editUserDetails} onOpenChange={() => setEditUserDetails(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Pencil className="w-4 h-4" /> Edit User</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>First Name</Label>
                  <Input value={editFirstName} onChange={e => setEditFirstName(e.target.value)} placeholder="John" />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input value={editLastName} onChange={e => setEditLastName(e.target.value)} placeholder="Smith" />
                </div>
              </div>
              <div>
                <Label>Role</Label>
                <Select value={editRole} onValueChange={(id) => { setEditRole(id); const cr = customRoles.find(r => r.id === id); if (cr?.pay_type) setEditPayType(cr.pay_type); }}>
                  <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
                  <SelectContent>
                    {customRoles.map(r => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Roles are defined in Settings, Roles.</p>
              </div>
              {canEditWage && (() => {
                const uid = editUserDetails.user_id;
                const history = ratesForUser(uid).slice().sort((a, b) => (a.effective_date < b.effective_date ? 1 : -1));
                return (
                  <div className="space-y-3 rounded-lg border border-border p-3">
                    <p className="text-sm font-medium">Pay</p>
                    <div>
                      <Label>Pay type</Label>
                      <Select value={editPayType} onValueChange={setEditPayType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hourly">Hourly</SelectItem>
                          <SelectItem value="salary">Salary</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {editPayType === 'hourly' ? (
                      <div>
                        <Label>Hourly wage ($/hr)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editWage}
                          onChange={e => setEditWage(e.target.value)}
                          placeholder="e.g. 25.00"
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-[1fr_130px] gap-2">
                        <div>
                          <Label>Salary amount ($)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={editSalary}
                            onChange={e => setEditSalary(e.target.value)}
                            placeholder="e.g. 5500"
                          />
                        </div>
                        <div>
                          <Label>Per</Label>
                          <Select value={editRatePeriod} onValueChange={setEditRatePeriod}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {SALARY_PERIODS.map(p => <SelectItem key={p.value} value={p.value}>{p.label.replace('per ', '')}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>Effective date</Label>
                        <Input type="date" value={editEffectiveDate} onChange={e => setEditEffectiveDate(e.target.value)} />
                      </div>
                      <div>
                        <Label>Note (optional)</Label>
                        <Input value={editRateNote} onChange={e => setEditRateNote(e.target.value)} placeholder="Raise, promotion..." />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      A new rate is logged with its effective date, so reports use the right pay for each period. Salary is counted as monthly overhead in the Profitability report.
                    </p>
                    <div className="pt-1 border-t border-border">
                      <Label>Payroll ID (optional)</Label>
                      <Input value={editPayrollId} onChange={e => setEditPayrollId(e.target.value)} placeholder="e.g. file number for ADP / Paychex" />
                      <p className="text-xs text-muted-foreground mt-1">The worker's id in your payroll system. Used in payroll CSV exports; leave blank if you export by name.</p>
                    </div>
                    {history.length > 0 && (
                      <div className="pt-1 border-t border-border">
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Rate history</p>
                        <ul className="space-y-1">
                          {history.map(r => (
                            <li key={r.id} className="flex items-baseline justify-between text-xs">
                              <span className="text-foreground">
                                {fmtMoney(r.amount)} <span className="text-muted-foreground">{periodLabel(r.rate_period)}</span>
                                {r.note && <span className="text-muted-foreground"> · {r.note}</span>}
                              </span>
                              <span className="text-muted-foreground shrink-0 ml-2">{fmtDate(r.effective_date)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {!uid && <p className="text-xs text-amber-600">This person has no linked login yet, so rate history can't be saved. The cached figure still updates.</p>}
                  </div>
                );
              })()}
              {editUserDetails.user_id !== currentUser?.id && (
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">Account Active</p>
                    <p className="text-xs text-muted-foreground">Deactivating prevents login</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditIsActive(v => !v)}
                    className="text-2xl"
                  >
                    {editIsActive
                      ? <ToggleRight className="w-8 h-8 text-primary" />
                      : <ToggleLeft className="w-8 h-8 text-muted-foreground" />
                    }
                  </button>
                </div>
              )}
              <Button onClick={handleSaveEditUser} disabled={savingEdit} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Let Go Confirmation Dialog */}
      <AlertDialog open={!!letGoUser} onOpenChange={open => { if (!open) { setLetGoUser(null); setLetGoImpact(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <UserX className="w-5 h-5" /> Let Go {letGoImpact?.userName}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>This will <strong>permanently remove</strong> this employee's account and all their project assignments.</p>
                {letGoImpact && (
                  <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5">
                    <p className="font-medium text-foreground">Items that will need reassignment:</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-destructive">{letGoImpact.assignedProjects.length}</span>
                      <span className="text-muted-foreground">assigned project(s)</span>
                    </div>
                    {letGoImpact.assignedProjects.length > 0 && (
                      <ul className="text-xs text-muted-foreground list-disc list-inside pl-1">
                        {letGoImpact.assignedProjects.map(p => <li key={p.id}>{p.name}</li>)}
                      </ul>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-destructive">{letGoImpact.assignedTasks}</span>
                      <span className="text-muted-foreground">assigned task(s)</span>
                    </div>
                  </div>
                )}
                <p className="text-muted-foreground">Owners and COOs will be notified. This action cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLetGo}
              disabled={lettingGo}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {lettingGo ? 'Processing...' : 'Yes, Let Go'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign Projects Dialog */}
      {editUser && (
        <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
             <DialogTitle>Assign Projects, {[editUser.first_name, editUser.last_name].filter(Boolean).join(' ') || editUser.email}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {projects.map(project => {
                const assigned = (editUser.assigned_project_ids || []).includes(project.id);
                return (
                  <button
                    key={project.id}
                    onClick={() => {
                      toggleProjectAssignment(editUser.id, project.id, editUser.assigned_project_ids);
                      setEditUser(prev => ({
                        ...prev,
                        assigned_project_ids: assigned
                          ? (prev.assigned_project_ids || []).filter(id => id !== project.id)
                          : [...(prev.assigned_project_ids || []), project.id],
                      }));
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
                      assigned ? 'border-accent bg-accent/5 text-foreground' : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{project.name}</span>
                      {assigned && <Shield className="w-3.5 h-3.5 text-accent" />}
                    </div>
                    {project.client_name && <p className="text-xs text-muted-foreground mt-0.5">{project.client_name}</p>}
                  </button>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}