import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

// "Back to Settings" link for settings sub-pages reached from the Settings hub.
export default function SettingsBack() {
  return (
    <Link to="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="w-4 h-4" /> Settings
    </Link>
  );
}
