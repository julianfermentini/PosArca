import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children: ReactNode
  fullWidth?: boolean
}

const variants = {
  primary:   'bg-blue-600 hover:bg-blue-700 text-white active:scale-95',
  secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-800 active:scale-95',
  danger:    'bg-red-500 hover:bg-red-600 text-white active:scale-95',
  success:   'bg-green-600 hover:bg-green-700 text-white active:scale-95',
  ghost:     'bg-transparent hover:bg-gray-100 text-gray-700 active:scale-95',
}

const sizes = {
  sm:  'px-3 py-2 text-sm min-h-[36px]',
  md:  'px-4 py-3 text-base min-h-[48px]',
  lg:  'px-6 py-4 text-lg min-h-[56px]',
  xl:  'px-8 py-5 text-xl min-h-[64px]',
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={[
        'rounded-xl font-semibold transition-all duration-100 touch-manipulation select-none',
        'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
        variants[variant],
        sizes[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}
