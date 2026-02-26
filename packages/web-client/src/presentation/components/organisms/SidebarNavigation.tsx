import React from 'react';
import { VideoCameraIcon, FolderIcon, Cog6ToothIcon } from '@heroicons/react/24/solid';
import { NavigationItem } from '../molecules/NavigationItem';

export type NavigationPage = 'recorder' | 'library' | 'settings';

interface SidebarNavigationProps {
  currentPage?: NavigationPage;
  onNavigate?: (page: NavigationPage) => void;
  disabledPages?: NavigationPage[];
}

export const SidebarNavigation: React.FC<SidebarNavigationProps> = ({
  currentPage = 'recorder',
  onNavigate,
  disabledPages = [],
}) => {
  return (
    <nav className="flex-1 py-4">
      <NavigationItem
        icon={<VideoCameraIcon />}
        label="Recorder"
        isActive={currentPage === 'recorder'}
        disabled={disabledPages.includes('recorder')}
        onClick={() => onNavigate?.('recorder')}
      />
      <NavigationItem
        icon={<FolderIcon />}
        label="Library"
        isActive={currentPage === 'library'}
        disabled={disabledPages.includes('library')}
        onClick={() => onNavigate?.('library')}
      />
      <NavigationItem
        icon={<Cog6ToothIcon />}
        label="Settings"
        isActive={currentPage === 'settings'}
        disabled={disabledPages.includes('settings')}
        onClick={() => onNavigate?.('settings')}
      />
    </nav>
  );
};
