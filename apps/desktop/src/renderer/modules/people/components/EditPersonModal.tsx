import { useEffect, useState } from 'react'
import { Loader2, Fingerprint } from 'lucide-react'
import { toast } from 'sonner'
import type { Person, ImportantDate } from '@/shared/stores/people.store'
import { usePeopleStore } from '@/shared/stores/people.store'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { TagListEditor } from './TagListEditor'
import { ImportantDateEditor } from './ImportantDateEditor'

type EditPersonModalProps = {
  person: Person | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave?: () => void
}

export function EditPersonModal({
  person,
  open,
  onOpenChange,
  onSave,
}: EditPersonModalProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [notes, setNotes] = useState('')
  const [embeddingCount, setEmbeddingCount] = useState(0)
  const [keyFacts, setKeyFacts] = useState<string[]>([])
  const [conversationStarters, setConversationStarters] = useState<string[]>([])
  const [importantDates, setImportantDates] = useState<ImportantDate[]>([])
  const [lastTopics, setLastTopics] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (person) {
      setName(person.name)
      setRelationship(person.relationship ?? '')
      setNotes(person.notes ?? '')
      setKeyFacts(person.keyFacts ?? [])
      setConversationStarters(person.conversationStarters ?? [])
      setImportantDates(person.importantDates ?? [])
      setLastTopics(person.lastTopics ?? [])
      window.emoryApi.face
        .getEmbeddingCount(person.id)
        .then(setEmbeddingCount)
        .catch(() => setEmbeddingCount(0))
    }
  }, [person])

  async function handleThisIsMeChange(checked: boolean): Promise<void> {
    if (!person) return
    try {
      if (checked) {
        await window.emoryApi.db.people.setSelf(person.id)
      } else if (person.isSelf) {
        await window.emoryApi.db.people.setSelf(null)
      }
      await usePeopleStore.getState().loadPeople()
      toast.success(checked ? 'You are set as the centre of your connection web' : 'Cleared who is you')
    } catch (err) {
      toast.error('Could not update', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  async function handleSave(): Promise<void> {
    if (!person || !name.trim()) return

    setIsSaving(true)
    try {
      await window.emoryApi.db.people.update(person.id, {
        name: name.trim(),
        relationship: relationship.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      await window.emoryApi.db.people.updateProfile(person.id, {
        keyFacts,
        conversationStarters,
        importantDates,
        lastTopics,
      })
      await usePeopleStore.getState().loadPeople()
      toast.success('Person updated')
      onSave?.()
      onOpenChange(false)
    } catch (err) {
      toast.error('Failed to update', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Person</DialogTitle>
          <DialogDescription>Update details for {person?.name}.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <fieldset disabled={isSaving} className="grid gap-4 pr-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-relationship">Relationship</Label>
              <Input
                id="edit-relationship"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                placeholder="Family, Friend, Colleague..."
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes about this person..."
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2">
              <div className="grid gap-0.5">
                <Label htmlFor="edit-this-is-me" className="text-sm font-medium">
                  This is me
                </Label>
                <p className="text-xs text-muted-foreground">
                  Pins you at the centre of the Connections graph and filters it to your network.
                </p>
              </div>
              <Switch
                id="edit-this-is-me"
                checked={Boolean(person?.isSelf)}
                onCheckedChange={(v) => {
                  void handleThisIsMeChange(v)
                }}
                disabled={isSaving || !person}
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Fingerprint className="h-3.5 w-3.5 shrink-0" />
              <span>
                {embeddingCount} face embedding{embeddingCount !== 1 ? 's' : ''} registered
              </span>
            </div>

            <Separator />

            <TagListEditor
              label="Key Facts"
              items={keyFacts}
              onChange={setKeyFacts}
              placeholder="e.g. Loves hiking, Allergic to nuts..."
            />

            <Separator />

            <TagListEditor
              label="Conversation Starters"
              items={conversationStarters}
              onChange={setConversationStarters}
              placeholder="e.g. Ask about their new dog..."
            />

            <Separator />

            <ImportantDateEditor items={importantDates} onChange={setImportantDates} />

            <Separator />

            <TagListEditor
              label="Last Topics"
              items={lastTopics}
              onChange={setLastTopics}
              placeholder="e.g. Discussed holiday plans..."
            />
          </fieldset>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !name.trim()}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
