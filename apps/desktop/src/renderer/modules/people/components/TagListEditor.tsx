import { useState } from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type TagListEditorProps = {
  label: string
  items: string[]
  onChange: (items: string[]) => void
  placeholder?: string
}

export function TagListEditor({
  label,
  items,
  onChange,
  placeholder,
}: TagListEditorProps): React.JSX.Element {
  const [value, setValue] = useState('')

  function handleAdd(): void {
    const trimmed = value.trim()
    if (!trimmed || items.includes(trimmed)) return
    onChange([...items, trimmed])
    setValue('')
  }

  function handleRemove(index: number): void {
    onChange(items.filter((_, i) => i !== index))
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {items.map((item, i) => (
            <Badge key={i} variant="secondary" className="gap-1 pr-1">
              {item}
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
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="h-8 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={!value.trim()}
        >
          Add
        </Button>
      </div>
    </div>
  )
}
