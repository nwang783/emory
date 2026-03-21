import { useState } from 'react'
import { X } from 'lucide-react'
import type { ImportantDate } from '@/shared/stores/people.store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type ImportantDateEditorProps = {
  items: ImportantDate[]
  onChange: (items: ImportantDate[]) => void
}

export function ImportantDateEditor({
  items,
  onChange,
}: ImportantDateEditorProps): React.JSX.Element {
  const [label, setLabel] = useState('')
  const [date, setDate] = useState('')

  function handleAdd(): void {
    if (!label.trim() || !date) return
    onChange([...items, { label: label.trim(), date }])
    setLabel('')
    setDate('')
  }

  function handleRemove(index: number): void {
    onChange(items.filter((_, i) => i !== index))
  }

  return (
    <div className="grid gap-2">
      <Label>Important Dates</Label>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {items.map((item, i) => (
            <Badge key={i} variant="secondary" className="gap-1 pr-1">
              {item.label}: {item.date}
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Birthday, Anniversary..."
          className="h-8 flex-1 text-sm"
        />
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-8 w-36 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={!label.trim() || !date}
        >
          Add
        </Button>
      </div>
    </div>
  )
}
