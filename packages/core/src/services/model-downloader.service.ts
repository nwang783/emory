import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Writable } from 'node:stream'

const MODELS: ReadonlyArray<{ name: string; filename: string; url: string }> = [
  {
    name: 'SCRFD (det_10g)',
    filename: 'det_10g.onnx',
    url: 'https://huggingface.co/public-data/insightface/resolve/main/models/buffalo_l/det_10g.onnx',
  },
  {
    name: 'ArcFace (w600k_r50)',
    filename: 'w600k_r50.onnx',
    url: 'https://huggingface.co/public-data/insightface/resolve/main/models/buffalo_l/w600k_r50.onnx',
  },
]

export class ModelDownloadError extends Error {
  constructor(
    public readonly modelName: string,
    cause: unknown,
  ) {
    super(`Failed to download model "${modelName}": ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'ModelDownloadError'
  }
}

export async function downloadModel(
  url: string,
  destPath: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  if (!response.body) {
    throw new Error('Response body is null')
  }

  const contentLength = Number(response.headers.get('content-length') || 0)
  const tempPath = `${destPath}.tmp`

  await fsp.mkdir(path.dirname(destPath), { recursive: true })

  const fileStream = fs.createWriteStream(tempPath)
  let downloaded = 0

  const reader = response.body.getReader()

  try {
    const writable = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        downloaded += chunk.length
        if (onProgress && contentLength > 0) {
          onProgress(Math.round((downloaded / contentLength) * 100))
        }
        fileStream.write(chunk, callback)
      },
    })

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      await new Promise<void>((resolve, reject) => {
        writable.write(Buffer.from(value), (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }

    await new Promise<void>((resolve, reject) => {
      fileStream.end((err: Error | null | undefined) => {
        if (err) reject(err)
        else resolve()
      })
    })

    await fsp.rename(tempPath, destPath)
  } catch (err) {
    fileStream.destroy()
    await fsp.unlink(tempPath).catch(() => {})
    throw err
  }
}

export async function ensureModels(
  modelsDir: string,
  onProgress?: (modelName: string, percent: number) => void,
): Promise<void> {
  await fsp.mkdir(modelsDir, { recursive: true })

  for (const model of MODELS) {
    const destPath = path.join(modelsDir, model.filename)

    try {
      await fsp.access(destPath, fs.constants.R_OK)
      console.log(`[ModelDownloader] ${model.name} already exists at ${destPath}`)
      continue
    } catch {
      // File does not exist — download it
    }

    console.log(`[ModelDownloader] Downloading ${model.name} from ${model.url}`)
    const startTime = performance.now()

    try {
      await downloadModel(model.url, destPath, (percent) => {
        onProgress?.(model.name, percent)
      })
    } catch (err) {
      throw new ModelDownloadError(model.name, err)
    }

    const elapsedSec = ((performance.now() - startTime) / 1000).toFixed(1)
    console.log(`[ModelDownloader] ${model.name} downloaded in ${elapsedSec}s`)
  }
}
