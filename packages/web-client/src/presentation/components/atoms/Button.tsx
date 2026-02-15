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
  const baseStyles = 'rounded-2xl font-bold transition-all shadow-lg transform hover:scale-[1.02] flex items-center justify-center gap-3 cursor-pointer'

  const sizeStyles = {
    sm: 'py-2 px-4 text-sm',
    md: 'py-4 px-6 text-base',
    lg: 'py-6 px-8 text-xl',
  }

  const variantStyles = {
    primary: 'bg-maycast-primary hover:bg-maycast-primary/80 text-white',
    danger: 'bg-maycast-rec/20 hover:bg-maycast-rec/30 border border-maycast-rec/50 text-white',
    ghost: 'bg-transparent border-2 border-maycast-text hover:bg-maycast-text/10 text-maycast-text',
    success: 'bg-maycast-safe hover:bg-maycast-safe/80 text-white',
  }

  const disabledStyles = 'bg-gray-600 cursor-not-allowed opacity-50 text-white'

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${sizeStyles[size]} ${disabled ? disabledStyles : variantStyles[variant]} ${className}`}
    >
      {children}
    </button>
  )
}
