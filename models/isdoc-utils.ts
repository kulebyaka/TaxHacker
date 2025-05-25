import { prisma } from "@/lib/db"
import { ISDOC_FIELDS } from "./isdoc-fields"

export async function addISDOCFieldsToUser(userId: string) {
  // Add ISDOC-specific fields to the user
  for (const field of ISDOC_FIELDS) {
    await prisma.field.upsert({
      where: { userId_code: { code: field.code, userId } },
      update: {
        name: field.name,
        type: field.type,
        llm_prompt: field.llm_prompt,
        isVisibleInList: field.isVisibleInList,
        isVisibleInAnalysis: field.isVisibleInAnalysis,
        isRequired: field.isRequired,
        isExtra: field.isExtra,
      },
      create: { ...field, userId },
    })
  }
}

// Function to check if user has ISDOC fields enabled
export async function hasISDOCFields(userId: string): Promise<boolean> {
  const isdocField = await prisma.field.findFirst({
    where: {
      userId,
      code: "invoice_number", // Check for one of the ISDOC-specific fields
    },
  })
  return !!isdocField
}

// Function to get all fields including ISDOC fields
export async function getFieldsForISDOC(userId: string) {
  return await prisma.field.findMany({
    where: { userId },
    orderBy: { code: "asc" },
  })
}
