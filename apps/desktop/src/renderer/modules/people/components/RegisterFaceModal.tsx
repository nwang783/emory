import { useState, useRef, useEffect, useCallback } from 'react'
import { Camera, Upload, Loader2, Info, RotateCcw, Check } from 'lucide-react'
import { toast } from 'sonner'
import { usePeopleStore } from '@/shared/stores/people.store'
import { useActivityStore } from '@/shared/stores/activity.store'
import { sharedStream } from '@/modules/camera/shared-stream'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

type RegisterFaceModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type ViewfinderState =
  | { phase: 'live' }
  | { phase: 'countdown'; count: number }
  | { phase: 'captured'; imageData: ImageData; dataUrl: string }
  | { phase: 'processing' }

async function imageFileToData(file: File): Promise<ImageData> {
  const img = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Cannot create canvas context')
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

export function RegisterFaceModal({
  open,
  onOpenChange,
}: RegisterFaceModalProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [viewfinder, setViewfinder] = useState<ViewfinderState>({ phase: 'live' })
  const [streamReady, setStreamReady] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const addPerson = usePeopleStore((s) => s.addPerson)

  const attachStream = useCallback(async (): Promise<void> => {
    if (!sharedStream.current) {
      setStreamReady(false)
      return
    }

    const tracks = sharedStream.current.getVideoTracks()
    if (tracks.length === 0 || tracks[0].readyState !== 'live') {
      setStreamReady(false)
      return
    }

    if (videoRef.current) {
      videoRef.current.srcObject = sharedStream.current
      try {
        await videoRef.current.play()
      } catch {
        // Video play can fail if element isn't mounted yet
      }
    }
    setStreamReady(true)
  }, [])

  useEffect(() => {
    if (open) {
      setViewfinder({ phase: 'live' })
      const timer = setTimeout(attachStream, 100)
      return () => clearTimeout(timer)
    }
    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
    }
  }, [open, attachStream])

  function resetForm(): void {
    setName('')
    setViewfinder({ phase: 'live' })
  }

  function handleClose(): void {
    if (viewfinder.phase !== 'processing') {
      resetForm()
      onOpenChange(false)
    }
  }

  function captureFrame(): void {
    const video = videoRef.current
    if (!video) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/png')
    setViewfinder({ phase: 'captured', imageData, dataUrl })
  }

  function startCountdown(): void {
    if (!name.trim()) {
      toast.warning('Name is required')
      return
    }

    let count = 3
    setViewfinder({ phase: 'countdown', count })

    const interval = setInterval(() => {
      count -= 1
      if (count > 0) {
        setViewfinder({ phase: 'countdown', count })
      } else {
        clearInterval(interval)
        captureFrame()
      }
    }, 1000)
  }

  async function saveWithoutFace(): Promise<void> {
    if (!name.trim()) {
      toast.warning('Name is required')
      return
    }

    setViewfinder({ phase: 'processing' })
    try {
      const person = await addPerson({
        name: name.trim(),
        relationship: relationship.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      toast.success(`Added ${person.name}`, {
        description: 'You can register a face later from the edit screen.',
      })
      resetForm()
      onOpenChange(false)
    } catch (err) {
      toast.error('Failed to add person', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
      setViewfinder({ phase: 'live' })
      attachStream()
    }
  }

  async function submitCapture(imageData: ImageData, source: 'photo_upload' | 'live_capture'): Promise<void> {
    if (!name.trim()) {
      toast.warning('Name is required')
      return
    }

    setViewfinder({ phase: 'processing' })
    try {
      const person = await addPerson({
        name: name.trim(),
      })

      const result = await window.emoryApi.face.register(
        person.id,
        imageData.data.buffer,
        imageData.width,
        imageData.height,
        source,
      )

      if (result.success) {
        toast.success(`Registered ${person.name}`, {
          description: 'Face embedding saved successfully.',
        })
        useActivityStore.getState().addEvent({
          type: 'registration',
          personName: person.name,
          similarity: null,
          details: 'New face registered',
        })
        resetForm()
        onOpenChange(false)
      } else {
        toast.error('Registration failed', {
          description: result.error ?? 'Could not detect a face in the image.',
        })
        setViewfinder({ phase: 'live' })
        attachStream()
      }
    } catch (err) {
      toast.error('Registration failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
      setViewfinder({ phase: 'live' })
      attachStream()
    }
  }

  async function handlePhotoUpload(file: File): Promise<void> {
    if (!name.trim()) {
      toast.warning('Name is required')
      return
    }

    setViewfinder({ phase: 'processing' })
    try {
      const imageData = await imageFileToData(file)
      await submitCapture(imageData, 'photo_upload')
    } catch (err) {
      toast.error('Upload failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
      setViewfinder({ phase: 'live' })
      attachStream()
    }
  }

  const isProcessing = viewfinder.phase === 'processing'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Register New Person</DialogTitle>
          <DialogDescription>
            Position your face in the viewfinder and take a photo to register. After registering, add how you know them
            in the Connections tab.
          </DialogDescription>
        </DialogHeader>

        {/* Live viewfinder */}
        <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
          {!streamReady && viewfinder.phase === 'live' && (
            <>
              <Skeleton className="absolute inset-0 rounded-lg" />
              <div className="absolute inset-0 z-10 flex items-center justify-center px-4 text-center">
                <p className="max-w-sm text-sm text-white/85">
                  Live capture needs the <strong className="font-medium">computer camera</strong> running on the
                  Camera tab. Remote phone/glasses feed does not share a stream here — use upload, or switch to
                  &quot;Use computer camera&quot; and start the camera.
                </p>
              </div>
            </>
          )}

          <video
            ref={videoRef}
            className={`h-full w-full object-cover ${viewfinder.phase === 'captured' ? 'hidden' : ''}`}
            muted
            playsInline
          />

          {viewfinder.phase === 'captured' && (
            <img
              src={viewfinder.dataUrl}
              alt="Captured frame"
              className="h-full w-full object-cover"
            />
          )}

          {viewfinder.phase === 'countdown' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <span className="animate-pulse text-5xl font-bold text-white">{viewfinder.count}</span>
            </div>
          )}

          {viewfinder.phase === 'captured' && (
            <div className="absolute inset-0 rounded-lg ring-2 ring-primary/60" />
          )}

          {viewfinder.phase === 'live' && streamReady && (
            <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent px-3 pb-3 pt-8 text-center">
              <p className="text-xs text-white/80">Position your face in the frame</p>
            </div>
          )}

          {viewfinder.phase === 'processing' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-2 text-sm text-white/80">Registering face...</p>
            </div>
          )}
        </div>

        {/* Capture controls */}
        {viewfinder.phase === 'live' && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button className="flex-1" onClick={startCountdown} disabled={!streamReady}>
                <Camera className="h-4 w-4" />
                Take Photo
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                Upload Instead
              </Button>
            </div>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={saveWithoutFace}
              disabled={!name.trim()}
            >
              Save without face photo
            </Button>
          </div>
        )}

        {viewfinder.phase === 'captured' && (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => { setViewfinder({ phase: 'live' }); attachStream() }}>
              <RotateCcw className="h-4 w-4" />
              Retake
            </Button>
            <Button className="flex-1" onClick={() => submitCapture(viewfinder.imageData, 'live_capture')} disabled={!name.trim()}>
              <Check className="h-4 w-4" />
              Use Photo
            </Button>
          </div>
        )}

        {/* Form fields */}
        <fieldset disabled={isProcessing} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="register-name">Name *</Label>
            <Input
              id="register-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Smith"
            />
          </div>
        </fieldset>

        <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          Look directly at the camera in good lighting for best results.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handlePhotoUpload(file)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
