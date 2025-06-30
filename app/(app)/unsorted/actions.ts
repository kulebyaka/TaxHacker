"use server"

import { AnalysisResult, analyzeTransaction } from "@/ai/analyze"
import { AnalyzeAttachment, loadAttachmentsForAI, loadAttachmentsForMultipleFiles } from "@/ai/attachments"
import { buildLLMPrompt } from "@/ai/prompt"
import { fieldsToJsonSchema } from "@/ai/schema"
import { transactionFormSchema } from "@/forms/transactions"
import { ActionState } from "@/lib/actions"
import { getCurrentUser, isAiBalanceExhausted, isSubscriptionExpired } from "@/lib/auth"
import config from "@/lib/config"
import { getTransactionFileUploadPath, getUserUploadsDirectory, safePathJoin, unsortedFilePath, isEnoughStorageToUploadFile, getDirectorySize } from "@/lib/files"
import { DEFAULT_PROMPT_ANALYSE_NEW_FILE } from "@/models/defaults"
import { createFile, deleteFile, getFileById, updateFile, getFileWithChildren, createChildFile, deleteChildFile } from "@/models/files"
import { createTransaction, updateTransactionFiles, TransactionData } from "@/models/transactions"
import { updateUser } from "@/models/users"
import { Category, Field, File, Project, Transaction } from "@/prisma/client"
import { mkdir, rename } from "fs/promises"
import { revalidatePath } from "next/cache"
import path from "path"
import { randomUUID } from "crypto"
import { readFile, writeFile } from "fs/promises"
import { ISDOC_PROMPT_TEMPLATE_CZ } from "@/ai/isdoc-prompt"

export async function analyzeFileAction(
  file: File,
  settings: Record<string, string>,
  fields: Field[],
  categories: Category[],
  projects: Project[]
): Promise<ActionState<AnalysisResult>> {
  const user = await getCurrentUser()

  if (!file || file.userId !== user.id) {
    return { success: false, error: "File not found or does not belong to the user" }
  }

  const apiKey = settings.openai_api_key || config.ai.openaiApiKey || ""
  if (!apiKey) {
    return { success: false, error: "OpenAI API key is not set" }
  }

  if (isAiBalanceExhausted(user)) {
    return {
      success: false,
      error: "You used all of your pre-paid AI scans, please upgrade your account or buy new subscription plan",
    }
  }

  if (isSubscriptionExpired(user)) {
    return {
      success: false,
      error: "Your subscription has expired, please upgrade your account or buy new subscription plan",
    }
  }

  // Get the file with all its children
  const fileWithChildren = await getFileWithChildren(file.id, user.id)
  if (!fileWithChildren) {
    return { success: false, error: "File not found" }
  }

  // Collect all files to analyze (parent + children)
  const allFiles = [fileWithChildren, ...(fileWithChildren.children || [])]
  
  console.log(`Analyzing ${allFiles.length} files:`, allFiles.map(f => f.filename))

  let attachments: AnalyzeAttachment[] = []
  try {
    // Process all files and collect their attachments
    attachments = await loadAttachmentsForMultipleFiles(user, allFiles)
    console.log(`Generated ${attachments.length} attachments for analysis`)
  } catch (error) {
    console.error("Failed to retrieve files:", error)
    return { success: false, error: "Failed to retrieve files: " + error }
  }

  // Check if ISDOC is enabled and use appropriate prompt
  let promptTemplate = settings.prompt_analyse_new_file || DEFAULT_PROMPT_ANALYSE_NEW_FILE
  
  if (settings.isdoc_enabled === "true" && settings.prompt_analyse_isdoc) {
    promptTemplate = settings.prompt_analyse_isdoc
  } else if (settings.isdoc_enabled === "true") {
    // Fallback to default ISDOC prompt if setting is missing
    promptTemplate = ISDOC_PROMPT_TEMPLATE_CZ
  }
  
  const prompt = buildLLMPrompt(
    promptTemplate,
    fields,
    categories,
    projects
  )

  const schema = fieldsToJsonSchema(fields)

  const results = await analyzeTransaction(prompt, schema, attachments, apiKey, file.id, user.id)

  console.log("Analysis results:", results)

  if (results.data?.tokensUsed && results.data.tokensUsed > 0) {
    await updateUser(user.id, { aiBalance: { decrement: 1 } })
  }

  return results
}

export async function saveFileAsTransactionAction(
  _prevState: ActionState<Transaction> | null,
  formData: FormData
): Promise<ActionState<Transaction>> {
  try {
    const user = await getCurrentUser()
    const validatedForm = transactionFormSchema.safeParse(Object.fromEntries(formData.entries()))

    if (!validatedForm.success) {
      return { success: false, error: validatedForm.error.message }
    }

    // Get the file record with children
    const fileId = formData.get("fileId") as string
    const file = await getFileWithChildren(fileId, user.id)
    if (!file) throw new Error("File not found")

    // Create transaction 
    const transaction = await createTransaction(user.id, validatedForm.data)

    // Collect all file IDs (parent + children)
    const allFileIds = [file.id, ...(file.children?.map(child => child.id) || [])]

    // Move parent file to processed location
    const userUploadsDirectory = getUserUploadsDirectory(user)
    const originalFileName = path.basename(file.path)
    const newRelativeFilePath = getTransactionFileUploadPath(file.id, originalFileName, transaction)

    // Move parent file to new location and name
    const oldFullFilePath = safePathJoin(userUploadsDirectory, file.path)
    const newFullFilePath = safePathJoin(userUploadsDirectory, newRelativeFilePath)
    await mkdir(path.dirname(newFullFilePath), { recursive: true })
    await rename(path.resolve(oldFullFilePath), path.resolve(newFullFilePath))

    // Update parent file record
    await updateFile(file.id, user.id, {
      path: newRelativeFilePath,
      isReviewed: true,
    })

    // Move and update child files
    if (file.children && file.children.length > 0) {
      for (const child of file.children) {
        const childOriginalFileName = path.basename(child.path)
        const childNewRelativeFilePath = getTransactionFileUploadPath(child.id, childOriginalFileName, transaction)
        
        const childOldFullFilePath = safePathJoin(userUploadsDirectory, child.path)
        const childNewFullFilePath = safePathJoin(userUploadsDirectory, childNewRelativeFilePath)
        await mkdir(path.dirname(childNewFullFilePath), { recursive: true })
        await rename(path.resolve(childOldFullFilePath), path.resolve(childNewFullFilePath))
        
        await updateFile(child.id, user.id, {
          path: childNewRelativeFilePath,
          isReviewed: true,
        })
      }
    }

    await updateTransactionFiles(transaction.id, user.id, allFileIds)

    revalidatePath("/unsorted")
    revalidatePath("/transactions")

    return { success: true, data: transaction }
  } catch (error) {
    console.error("Failed to save transaction:", error)
    return { success: false, error: `Failed to save transaction: ${error}` }
  }
}

export async function deleteUnsortedFileAction(
  _prevState: ActionState<Transaction> | null,
  fileId: string
): Promise<ActionState<Transaction>> {
  try {
    const user = await getCurrentUser()
    await deleteFile(fileId, user.id)
    revalidatePath("/unsorted")
    return { success: true }
  } catch (error) {
    console.error("Failed to delete file:", error)
    return { success: false, error: "Failed to delete file" }
  }
}

export async function splitFileIntoItemsAction(
  _prevState: ActionState<null> | null,
  formData: FormData
): Promise<ActionState<null>> {
  try {
    const user = await getCurrentUser()
    const fileId = formData.get("fileId") as string
    const items = JSON.parse(formData.get("items") as string) as TransactionData[]

    if (!fileId || !items || items.length === 0) {
      return { success: false, error: "File ID and items are required" }
    }

    // Get the original file
    const originalFile = await getFileById(fileId, user.id)
    if (!originalFile) {
      return { success: false, error: "Original file not found" }
    }

    // Get the original file's content
    const userUploadsDirectory = getUserUploadsDirectory(user)
    const originalFilePath = safePathJoin(userUploadsDirectory, originalFile.path)
    const fileContent = await readFile(originalFilePath)

    // Create a new file for each item
    for (const item of items) {
      const fileUuid = randomUUID()
      const fileName = `${originalFile.filename}-part-${item.name}`
      const relativeFilePath = unsortedFilePath(fileUuid, fileName)
      const fullFilePath = safePathJoin(userUploadsDirectory, relativeFilePath)

      // Create directory if it doesn't exist
      await mkdir(path.dirname(fullFilePath), { recursive: true })

      // Copy the original file content
      await writeFile(fullFilePath, fileContent)

      // Create file record in database with the item data cached
      await createFile(user.id, {
        id: fileUuid,
        filename: fileName,
        path: relativeFilePath,
        mimetype: originalFile.mimetype,
        metadata: originalFile.metadata,
        isSplitted: true,
        cachedParseResult: {
          name: item.name,
          merchant: item.merchant,
          description: item.description,
          total: item.total,
          currencyCode: item.currencyCode,
          categoryCode: item.categoryCode,
          projectCode: item.projectCode,
          type: item.type,
          issuedAt: item.issuedAt,
          note: item.note,
          text: item.text,
        },
      })
    }

    // Delete the original file
    await deleteFile(fileId, user.id)

    // Update user storage used
    const storageUsed = await getDirectorySize(getUserUploadsDirectory(user))
    await updateUser(user.id, { storageUsed })

    revalidatePath("/unsorted")
    return { success: true }
  } catch (error) {
    console.error("Failed to split file into items:", error)
    return { success: false, error: `Failed to split file into items: ${error}` }
  }
}

export async function addMorePhotosAction(
  _prevState: ActionState<File> | null,
  formData: FormData
): Promise<ActionState<File>> {
  try {
    const user = await getCurrentUser()
    const parentFileId = formData.get("parentFileId") as string
    const uploadedFile = formData.get("file")

    if (!parentFileId || !uploadedFile || !(uploadedFile instanceof globalThis.File)) {
      return { success: false, error: "Parent file ID and valid file are required" }
    }

    // Verify parent file exists and belongs to user
    const parentFile = await getFileById(parentFileId, user.id)
    if (!parentFile) {
      return { success: false, error: "Parent file not found" }
    }

    // Check storage limits
    if (!isEnoughStorageToUploadFile(user, uploadedFile.size)) {
      return { success: false, error: "Insufficient storage to upload this file" }
    }

    if (isSubscriptionExpired(user)) {
      return {
        success: false,
        error: "Your subscription has expired, please upgrade your account or buy new subscription plan",
      }
    }

    // Save file to filesystem
    const fileUuid = randomUUID()
    const relativeFilePath = unsortedFilePath(fileUuid, uploadedFile.name)
    const arrayBuffer = await uploadedFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const userUploadsDirectory = getUserUploadsDirectory(user)
    const fullFilePath = safePathJoin(userUploadsDirectory, relativeFilePath)
    await mkdir(path.dirname(fullFilePath), { recursive: true })
    await writeFile(fullFilePath, buffer)

    // Create child file record in database
    const childFile = await createChildFile(user.id, parentFileId, {
      id: fileUuid,
      filename: uploadedFile.name,
      path: relativeFilePath,
      mimetype: uploadedFile.type,
      metadata: {
        size: uploadedFile.size,
        lastModified: uploadedFile.lastModified,
      },
    })

    // Update user storage used
    const storageUsed = await getDirectorySize(getUserUploadsDirectory(user))
    await updateUser(user.id, { storageUsed })

    revalidatePath("/unsorted")
    return { success: true, data: childFile }
  } catch (error) {
    console.error("Failed to add more photos:", error)
    return { success: false, error: `Failed to add more photos: ${error}` }
  }
}

export async function deleteAdditionalPhotoAction(
  fileId: string
): Promise<ActionState<File>> {
  try {
    const user = await getCurrentUser()
    const file = await getFileWithChildren(fileId, user.id)
    if (!file) {
      return { success: false, error: "File not found" }
    }
    if (file.parentId) {
      await deleteChildFile(fileId, user.id)
    } else {
      const child = file.children[0]
      // Copy significant data from parent to child before deleting parent
      await updateFile(child.id, user.id, { 
        parentId: null,
        cachedParseResult: file.cachedParseResult,
        metadata: file.metadata,
        isReviewed: file.isReviewed,
        isSplitted: file.isSplitted
      })
      await deleteFile(fileId, user.id)
    }
    revalidatePath("/unsorted")
    return { success: true }
  } catch (error) {
    console.error("Failed to delete additional photo:", error)
    return { success: false, error: `Failed to delete additional photo: ${error}` }
  }
}
