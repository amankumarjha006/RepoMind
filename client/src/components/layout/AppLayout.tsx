import * as React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { Toaster } from '../ui/sonner';
import { TooltipProvider } from '../ui/tooltip';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { IconRail } from './IconRail';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { CommandPalette } from './CommandPalette';
import { ConnectDrawer } from '../repository/ConnectDrawer';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { MaterialIcon } from '../ui/MaterialIcon';
import { useAuth } from '../../lib/AuthContext';
import { useIndexingStatus } from '../../lib/useIndexingStatus';
import { useTheme } from '../../lib/ThemeContext';
import { deriveUserDisplay } from '../../lib/user';

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading, error, markSessionExpired } = useAuth();
  const { resetBackoff } = useIndexingStatus();
  const { theme } = useTheme();

  const [connectOpen, setConnectOpen] = React.useState(false);
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [accountOpen, setAccountOpen] = React.useState(false);
  const { logout } = useAuth();
  const userDisplay = deriveUserDisplay(user);

  const mainRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    if (loading) return;
    if (error) {
      navigate('/status/server-unreachable', { replace: true });
      return;
    }
    if (!user) {
      markSessionExpired();
    }
  }, [loading, user, error, navigate, markSessionExpired]);

  // Focus main content on route change for screen readers
  React.useEffect(() => {
    if (mainRef.current) {
      mainRef.current.focus({ preventScroll: true });
    }
  }, [location.pathname]);

  const handleConnected = () => {
    resetBackoff();
    setConnectOpen(false);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-page)] text-[var(--color-text)]">
        {/* Desktop 56px Navigation Rail */}
        <IconRail onOpenCommand={() => setCommandOpen(true)} />

        {/* Main Content Area */}
        <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">
          {/* TopBar with breadcrumb, repo switcher, status chip, ⌘K trigger */}
          <TopBar
            onOpenCommand={() => setCommandOpen(true)}
            onOpenConnect={() => setConnectOpen(true)}
          />

          {/* Viewport */}
          <main
            ref={mainRef}
            id="main-content"
            tabIndex={-1}
            className="flex-1 overflow-y-auto focus:outline-none pb-[var(--height-bottomnav)] md:pb-0 flex flex-col"
          >
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>

          {/* Mobile Bottom Navigation */}
          <BottomNav
            onOpenCommand={() => setCommandOpen(true)}
            onOpenUserMenu={() => setAccountOpen(true)}
          />
        </div>

        {/* Global Command Palette */}
        <CommandPalette
          open={commandOpen}
          onOpenChange={setCommandOpen}
          onOpenConnect={() => {
            setCommandOpen(false);
            setConnectOpen(true);
          }}
        />

        {/* Connect Repository Drawer */}
        <ConnectDrawer
          open={connectOpen}
          onOpenChange={setConnectOpen}
          onConnected={handleConnected}
        />

        {/* Mobile Account Dialog */}
        <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
          <DialogContent className="max-w-xs sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Account</DialogTitle>
              <DialogDescription>Signed in user details and session management.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-raised)] border border-[var(--color-border)]">
                <div className="h-10 w-10 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center font-mono text-sm font-semibold text-[var(--color-text)]">
                  {userDisplay.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--color-text)] truncate">{userDisplay.name}</p>
                  <p className="text-xs text-[var(--color-text-secondary)] font-mono truncate">{userDisplay.email}</p>
                  {user?.github?.username && (
                    <p className="text-xs text-[var(--color-accent)] font-mono truncate">@{user.github.username}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAccountOpen(false);
                    navigate('/repositories');
                  }}
                  className="w-full justify-start gap-2 text-xs"
                >
                  <MaterialIcon name="folder" size={16} />
                  <span>Repositories</span>
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setAccountOpen(false);
                    logout();
                  }}
                  className="w-full justify-start gap-2 text-xs text-[var(--color-error)] hover:bg-[var(--color-error-tint)] hover:text-[var(--color-error)]"
                >
                  <MaterialIcon name="logout" size={16} className="text-[var(--color-error)]" />
                  <span>Sign out</span>
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Crisp Toasts */}
        <Toaster
          theme={theme}
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border-strong)',
              fontSize: '12px',
            },
          }}
        />
      </div>
    </TooltipProvider>
  );
}

export default AppLayout;
