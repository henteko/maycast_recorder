import React from 'react';

interface MainLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ sidebar, children }) => {
  return (
    <div className="flex h-screen bg-maycast-bg">
      {/* Sidebar - Fixed width */}
      <aside className="w-[264px] flex-shrink-0 bg-maycast-panel border-r border-maycast-border">
        {sidebar}
      </aside>

      {/* Main Area - Flexible width */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
};
