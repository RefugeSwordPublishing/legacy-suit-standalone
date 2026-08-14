import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/UserContext';
import { startOfWeek, addDays } from 'date-fns';
import AdminScheduleBoard from '@/components/crew-schedule/AdminScheduleBoard';
import WeeklyView from '@/components/crew-schedule/WeeklyView';
import { CalendarDays } from 'lucide-react';

const ADMIN_ROLES = ['owner', 'admin', 'coo'];

export default function CrewSchedule() {
  const { currentUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const isAdmin = ADMIN_ROLES.includes(currentUser?.role);
  const isSiteManager = currentUser?.role === 'site_manager';

  const { data: users = [] } = useQuery({
    queryKey: ['user-profiles'],
    queryFn: () => base44.entities.UserProfile.list(),
    enabled: isAdmin || isSiteManager,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: scheduleEntries = [] } = useQuery({
    queryKey: ['crew-schedule'],
    queryFn: () => base44.entities.CrewScheduleEntry.list(),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['crew-schedule'] });
  };

  if (!currentUser) return null;

  return (
    <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Crew Schedule</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isAdmin ? 'Assign projects to crew members for each day.' : 'Your scheduled assignments for the week.'}
            </p>
          </div>
        </div>

        {isAdmin ? (
          <AdminScheduleBoard
            users={users}
            projects={projects}
            scheduleEntries={scheduleEntries}
            onRefresh={refresh}
          />
        ) : (
          <WeeklyView
            weekStart={weekStart}
            onPrevWeek={() => setWeekStart(d => addDays(d, -7))}
            onNextWeek={() => setWeekStart(d => addDays(d, 7))}
            scheduleEntries={scheduleEntries}
            projects={projects}
            currentUserId={currentUser?.id}
            isSiteManager={isSiteManager}
            allUsers={users}
          />
        )}
    </div>
  );
}