import React from 'react';

interface NavigationItemProps {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export const NavigationItem: React.FC<NavigationItemProps> = ({
  icon,
  label,
  isActive = false,
  disabled = false,
  onClick,
}) => {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      className={`
        w-full flex items-center gap-3 px-6 py-3
        border-l-4 transition-all
        ${
          disabled
            ? 'border-transparent opacity-40 cursor-not-allowed text-maycast-subtext'
            : isActive
              ? 'border-maycast-primary bg-maycast-primary/10 text-maycast-text cursor-pointer'
              : 'border-transparent hover:bg-maycast-bg/50 text-maycast-subtext hover:text-maycast-text cursor-pointer'
        }
      `}
    >
      <div className="w-5 h-5">{icon}</div>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
};
