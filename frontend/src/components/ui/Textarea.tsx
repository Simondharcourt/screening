import { TextareaHTMLAttributes, forwardRef } from 'react'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string
    error?: string
    helperText?: string
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className = '', label, error, helperText, id, ...props }, ref) => {
        return (
            <div className="w-full">
                {label && (
                    <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
                        {label}
                    </label>
                )}
                <textarea
                    id={id}
                    ref={ref}
                    className={`flex min-h-[80px] w-full rounded-md border bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors ${error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300'
                        } ${className}`}
                    {...props}
                />
                {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
                {helperText && !error && <p className="mt-1 text-sm text-gray-500">{helperText}</p>}
            </div>
        )
    }
)
Textarea.displayName = 'Textarea'

export { Textarea }
