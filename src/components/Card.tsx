import type { ReactNode } from 'react'

interface CardProps {
  title?: string
  subtitle?: string
  icon?: ReactNode
  children: ReactNode
  className?: string
  actions?: ReactNode
}

export default function Card({ title, subtitle, icon, children, className = '', actions }: CardProps) {
  return (
    <div className={`bg-card border border-border rounded-xl p-5 flex flex-col gap-4 ${className}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-2">
          {title && (
            <div className="flex items-center gap-2.5 min-w-0">
              {icon && <span className="text-primary shrink-0">{icon}</span>}
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
              </div>
            </div>
          )}
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
