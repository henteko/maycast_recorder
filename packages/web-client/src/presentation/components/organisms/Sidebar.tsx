import React from 'react';
import { SidebarHeader } from './SidebarHeader';
import { SidebarNavigation } from './SidebarNavigation';
import type { NavigationPage } from './SidebarNavigation';
import { SidebarFooter } from './SidebarFooter';
import type { SystemHealth } from './SidebarFooter';

interface SidebarProps {
  currentPage?: NavigationPage;
  onNavigate?: (page: NavigationPage) => void;
  disabledPages?: NavigationPage[];
  systemHealth: SystemHealth;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage = 'recorder',
  onNavigate,
  disabledPages,
  systemHealth,
}) => {
  return (
    <div className="h-full flex flex-col">
      <SidebarHeader />
      <SidebarNavigation currentPage={currentPage} onNavigate={onNavigate} disabledPages={disabledPages} />
      <SidebarFooter systemHealth={systemHealth} />
    </div>
  );
};
