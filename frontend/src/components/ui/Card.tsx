import { HTMLAttributes, forwardRef } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'glass' | 'glass-dark'
}

const Card = forwardRef<HTMLDivElement, CardProps>(
    ({ className = '', variant = 'default', children, ...props }, ref) => {
        const variants = {
            default: 'bg-white border border-gray-200 shadow-sm rounded-xl',
            glass: 'glass rounded-xl',
            'glass-dark': 'glass-dark rounded-xl text-white',
        }

        return (
            <div
                ref={ref}
                className={`${variants[variant]} ${className}`}
                {...props}
            >
                {children}
            </div>
        )
    }
)
Card.displayName = 'Card'

export { Card }
