import React from 'react';

export const SidebarHeader: React.FC = () => {
  return (
    <div className="p-6 border-b border-maycast-border">
      <div className="flex items-center gap-3">
        <div className="text-2xl font-bold text-maycast-primary">
          MAYCAST
        </div>
        <span className="px-2 py-0.5 text-xs font-semibold text-maycast-primary bg-maycast-primary/10 border border-maycast-primary/30 rounded">
          BETA
        </span>
      </div>
    </div>
  );
};
