import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

/** Narrow in-page navigation rail; pair with `PageWorkspace`. */
export type MiniSidebarNavItem = {
  id: string
  label: string
  icon?: React.ElementType
  badge?: string
}

export function PageWorkspace({
  miniSidebar,
  children,
  className,
}: {
  miniSidebar?: React.ReactNode
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex min-h-0 flex-1 overflow-hidden', className)}>
      {miniSidebar}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  )
}

type MiniSidebarNavProps = {
  /** Short label above nav links (sentence case). */
  label?: string
  items: MiniSidebarNavItem[]
  activeId: string
  onSelect: (id: string) => void
  footer?: React.ReactNode
  /** `start` = border-r (default); `end` = border-l for right-hand rails. */
  position?: 'start' | 'end'
}

export function MiniSidebarNav({
  label = 'Sections',
  items,
  activeId,
  onSelect,
  footer,
  position = 'start',
}: MiniSidebarNavProps): React.JSX.Element {
  return (
    <aside
      className={cn(
        'flex w-[168px] shrink-0 flex-col bg-card/35',
        position === 'start' ? 'border-r border-border' : 'border-l border-border order-last',
      )}
      aria-label="Page sections"
    >
      {label ? (
        <div className="border-b border-border/80 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        <nav className="flex flex-col gap-px p-2">
          {items.map((item) => {
            const Icon = item.icon
            const active = activeId === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                  active
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
              >
                {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden /> : null}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.badge ? (
                  <span className="font-mono-ui shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            )
          })}
        </nav>
      </ScrollArea>
      {footer ? <div className="border-t border-border/80 p-2">{footer}</div> : null}
    </aside>
  )
}

/** Static narrow panel (e.g. legend, tips) without nav buttons. */
export function MiniSidebarPanel({
  label,
  children,
  position = 'start',
  className,
}: {
  label?: string
  children: React.ReactNode
  position?: 'start' | 'end'
  className?: string
}): React.JSX.Element {
  return (
    <aside
      className={cn(
        'flex w-[168px] shrink-0 flex-col bg-card/35',
        position === 'start' ? 'border-r border-border' : 'border-l border-border order-last',
        className,
      )}
      aria-label={label ?? 'Side panel'}
    >
      {label ? (
        <div className="border-b border-border/80 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2.5">{children}</div>
      </ScrollArea>
    </aside>
  )
}

export function PageShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return <section className={cn('flex h-full min-h-0 flex-col', className)}>{children}</section>
}

type PageHeaderProps = {
  title: string
  description?: string
  actions?: React.ReactNode
  variant?: 'default' | 'compact'
  sticky?: boolean
  /** e.g. `font-heading` for top-level settings title */
  titleClassName?: string
}

export function PageHeader({
  title,
  description,
  actions,
  variant = 'default',
  sticky = false,
  titleClassName,
}: PageHeaderProps): React.JSX.Element {
  const compact = variant === 'compact'
  return (
    <header
      className={cn(
        'shrink-0 border-b border-border bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/80',
        compact ? 'px-4 py-2.5' : 'px-5 py-3 sm:px-6',
        sticky && 'sticky top-0 z-10',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-0.5">
          <h1
            className={cn(
              'font-semibold tracking-tight text-foreground',
              compact ? 'text-sm' : 'text-base',
              titleClassName,
            )}
          >
            {title}
          </h1>
          {description ? (
            <p className={cn('text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  )
}

export function PageToolbar({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'shrink-0 border-b border-border bg-muted/25 px-6 py-2.5',
        className,
      )}
    >
      {children}
    </div>
  )
}

export type PageMaxWidth = 'none' | '3xl' | '4xl' | '6xl' | '7xl'

const MAX_WIDTH: Record<PageMaxWidth, string> = {
  none: '',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
}

type PageScrollProps = {
  children: React.ReactNode
  maxWidth?: PageMaxWidth
  className?: string
  innerClassName?: string
  /** Horizontal padding: default px-6 py-5, tight px-4 py-3 */
  padding?: 'default' | 'tight'
}

export function PageScroll({
  children,
  maxWidth = 'none',
  className,
  innerClassName,
  padding = 'default',
}: PageScrollProps): React.JSX.Element {
  const pad =
    padding === 'tight' ? 'px-4 py-3' : 'px-6 py-5'
  return (
    <ScrollArea className={cn('min-h-0 flex-1', className)}>
      <div
        className={cn(
          pad,
          maxWidth !== 'none' && cn(MAX_WIDTH[maxWidth], 'mx-auto w-full'),
          innerClassName,
        )}
      >
        {children}
      </div>
    </ScrollArea>
  )
}

export function PageFill({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return <div className={cn('min-h-0 flex-1 overflow-hidden', className)}>{children}</div>
}
