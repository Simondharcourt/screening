import { HTMLAttributes, forwardRef } from 'react'

export interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'outline'
}

const Badge = forwardRef<HTMLDivElement, BadgeProps>(
    ({ className = '', variant = 'default', children, ...props }, ref) => {
        const variants = {
            default: 'bg-gray-100 text-gray-800',
            primary: 'bg-primary-100 text-primary-800',
            success: 'bg-green-100 text-green-800',
            warning: 'bg-yellow-100 text-yellow-800',
            danger: 'bg-red-100 text-red-800',
            outline: 'border border-gray-300 text-gray-800',
        }

        return (
            <div
                ref={ref}
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${variants[variant]} ${className}`}
                {...props}
            >
                {children}
            </div>
        )
    }
)
Badge.displayName = 'Badge'

export { Badge }
