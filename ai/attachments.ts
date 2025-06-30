import { fileExists, fullPathForFile } from "@/lib/files"
import { generateFilePreviews } from "@/lib/previews/generate"
import { File, User } from "@/prisma/client"
import fs from "fs/promises"

const MAX_PAGES_TO_ANALYZE = 4

export type AnalyzeAttachment = {
  filename: string
  contentType: string
  base64: string
}

export const loadAttachmentsForAI = async (user: User, file: File): Promise<AnalyzeAttachment[]> => {
  const fullFilePath = fullPathForFile(user, file)
  const isFileExists = await fileExists(fullFilePath)
  if (!isFileExists) {
    throw new Error("File not found on disk")
  }

  const { contentType, previews } = await generateFilePreviews(user, fullFilePath, file.mimetype)

  return Promise.all(
    previews.slice(0, MAX_PAGES_TO_ANALYZE).map(async (preview) => ({
      filename: file.filename,
      contentType: contentType,
      base64: await loadFileAsBase64(preview),
    }))
  )
}

export const loadAttachmentsForMultipleFiles = async (user: User, files: File[]): Promise<AnalyzeAttachment[]> => {
  const allAttachments: AnalyzeAttachment[] = []
  
  console.log(`Processing ${files.length} files for AI analysis`)
  
  for (const file of files) {
    if (allAttachments.length >= MAX_PAGES_TO_ANALYZE) {
      console.log(`Reached maximum pages limit (${MAX_PAGES_TO_ANALYZE}), stopping`)
      break // Stop if we've reached the maximum pages
    }
    
    console.log(`Processing file: ${file.filename}`)
    
    const fullFilePath = fullPathForFile(user, file)
    const isFileExists = await fileExists(fullFilePath)
    if (!isFileExists) {
      console.warn(`File not found on disk: ${file.filename}`)
      continue
    }

    const { contentType, previews } = await generateFilePreviews(user, fullFilePath, file.mimetype)
    
    // Calculate how many pages we can still add
    const remainingSlots = MAX_PAGES_TO_ANALYZE - allAttachments.length
    const pagesToAdd = Math.min(previews.length, remainingSlots)
    
    
    const fileAttachments = await Promise.all(
      previews.slice(0, pagesToAdd).map(async (preview) => ({
        filename: file.filename,
        contentType: contentType,
        base64: await loadFileAsBase64(preview),
      }))
    )
    
    allAttachments.push(...fileAttachments)
  }
  
  console.log(`Total attachments prepared for AI: ${allAttachments.length}`)
  return allAttachments
}

export const loadFileAsBase64 = async (filePath: string): Promise<string> => {
  const buffer = await fs.readFile(filePath)
  return Buffer.from(buffer).toString("base64")
}
