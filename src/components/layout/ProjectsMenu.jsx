import { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { FolderOpen, Calendar, FolderKanban, ChevronUp, Users, HardHat, MapPin } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCurrentUser } from '@/lib/UserContext';

const canViewProjectsMenu = (user) => {
  if (!user?.role) return false;
  const role = user.role.toLowerCase();
  return ['admin', 'coo', 'owner', 'site_manager', 'crew_member'].includes(role);
};

const canViewSchedules = (user) => {
  if (!user?.role) return false;
  const role = user.role.toLowerCase();
  return ['admin', 'coo', 'owner'].includes(role);
};

const canViewMyProjects = (user) => {
  if (!user?.role) return false;
  const role = user.role.toLowerCase();
  return ['admin', 'coo', 'owner', 'site_manager'].includes(role);
};

// Crew get the simplified Job Sites directory (address + lockbox) instead of the full My Projects page.
const canViewJobSites = (user) => {
  if (!user?.role) return false;
  return user.role.toLowerCase() === 'crew_member';
};

const canViewCrewSchedule = (user) => {
  if (!user?.role) return false;
  const role = user.role.toLowerCase();
  return ['admin', 'coo', 'owner', 'site_manager', 'crew_member'].includes(role);
};

export default function ProjectsMenu({ mobile = false }) {
  const location = useLocation();
  const { currentUser } = useCurrentUser();
  const [open, setOpen] = useState(false);

  if (!canViewProjectsMenu(currentUser)) return null;

  const menuItems = [];

  if (canViewMyProjects(currentUser)) {
    menuItems.push({
      path: '/projects',
      label: 'My Projects',
      icon: FolderKanban,
    });
  }

  if (canViewJobSites(currentUser)) {
    menuItems.push({
      path: '/job-sites',
      label: 'Job Sites',
      icon: MapPin,
    });
  }

  if (canViewSchedules(currentUser)) {
    menuItems.push({
      path: '/schedules',
      label: 'Schedules',
      icon: Calendar,
    });
  }

  if (canViewCrewSchedule(currentUser)) {
    menuItems.push({
      path: '/crew-schedule',
      label: 'Crew Schedule',
      icon: Users,
    });
  }

  const canViewSubContractors = (u) => ['owner', 'admin'].includes(u?.role);

  if (canViewSubContractors(currentUser)) {
    menuItems.push({
      path: '/sub-contractors',
      label: 'Sub Contractors',
      icon: HardHat,
    });
  }

  if (menuItems.length === 0) return null;

  const isActive = ['/projects', '/job-sites', '/schedules', '/crew-schedule', '/sub-contractors'].includes(location.pathname);

  if (mobile) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={`flex flex-col items-center gap-1 p-2 rounded-lg ${
              isActive || open
                ? 'bg-sidebar-accent'
                : 'hover:bg-sidebar-accent/50'
            }`}
          >
            <FolderOpen className="w-5 h-5" />
            <span className="text-xs">Projects</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-1 mb-2" align="center" side="top">
          {menuItems.map((item) => {
            const itemActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                  itemActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all w-full ${
            isActive || open
              ? 'bg-sidebar-accent text-white'
              : 'text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/50'
          }`}
        >
          <FolderOpen className="w-4 h-4" />
          Projects
          <ChevronUp className="w-3 h-3 ml-auto rotate-90" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1" side="right" align="start">
        {menuItems.map((item) => {
          const itemActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                itemActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}