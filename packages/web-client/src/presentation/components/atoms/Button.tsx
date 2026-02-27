import type { ReactNode } from 'react'

interface ButtonProps {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  variant?: 'primary' | 'danger' | 'ghost' | 'success'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
  className?: string
}

export const Button = ({
  onClick,
  disabled = false,
  variant = 'primary',
  size = 'md',
  children,
  className = '',
}: ButtonProps) => {
  const baseStyles = 'rounded-xl font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-maycast-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-maycast-bg'

  const sizeStyles = {
    sm: 'py-2 px-3.5 text-sm',
    md: 'py-2.5 px-5 text-sm',
    lg: 'py-3 px-6 text-base',
  }

  const variantStyles = {
    primary: 'bg-maycast-primary hover:brightness-110 text-white shadow-sm shadow-maycast-primary/25',
    danger: 'bg-maycast-rec/20 hover:bg-maycast-rec/30 border border-maycast-rec/40 text-white',
    ghost: 'bg-transparent border border-maycast-border/40 hover:bg-maycast-panel/50 text-maycast-text',
    success: 'bg-maycast-safe hover:brightness-110 text-white shadow-sm shadow-maycast-safe/25',
  }

  const disabledStyles = 'opacity-40 cursor-not-allowed'

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${disabled ? disabledStyles : ''} ${className}`}
    >
      {children}
    </button>
  )
}
