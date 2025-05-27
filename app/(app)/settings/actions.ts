"use server"

import {
  categoryFormSchema,
  currencyFormSchema,
  fieldFormSchema,
  projectFormSchema,
  settingsFormSchema,
} from "@/forms/settings"
import { userFormSchema } from "@/forms/users"
import { ActionState } from "@/lib/actions"
import { getCurrentUser } from "@/lib/auth"
import { uploadStaticImage } from "@/lib/uploads"
import { codeFromName, randomHexColor } from "@/lib/utils"
import { createCategory, deleteCategory, updateCategory } from "@/models/categories"
import { createCurrency, deleteCurrency, updateCurrency } from "@/models/currencies"
import { createField, deleteField, updateField } from "@/models/fields"
import { createProject, deleteProject, updateProject } from "@/models/projects"
import { SettingsMap, updateSettings } from "@/models/settings"
import { updateUser } from "@/models/users"
import { Prisma, User } from "@/prisma/client"
import { revalidatePath } from "next/cache"
import path from "path"
import { addISDOCFieldsToUser, hasISDOCFields } from "@/models/isdoc-utils"
import { ISDOC_FIELDS } from "@/models/isdoc-fields"
import { ISDOC_PROMPT_TEMPLATE_CZ } from "@/ai/isdoc-prompt"

export async function saveSettingsAction(
  _prevState: ActionState<SettingsMap> | null,
  formData: FormData
): Promise<ActionState<SettingsMap>> {
  const user = await getCurrentUser()
  const validatedForm = settingsFormSchema.safeParse(Object.fromEntries(formData))

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  for (const key in validatedForm.data) {
    const value = validatedForm.data[key as keyof typeof validatedForm.data]
    if (value !== undefined) {
      await updateSettings(user.id, key, value)
    }
  }

  revalidatePath("/settings")
  return { success: true }
}

export async function saveProfileAction(
  _prevState: ActionState<User> | null,
  formData: FormData
): Promise<ActionState<User>> {
  const user = await getCurrentUser()
  const validatedForm = userFormSchema.safeParse(Object.fromEntries(formData))

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  // Upload avatar
  let avatarUrl = user.avatar
  const avatarFile = formData.get("avatar") as File | null
  if (avatarFile instanceof File && avatarFile.size > 0) {
    try {
      const uploadedAvatarPath = await uploadStaticImage(user, avatarFile, "avatar.webp", 500, 500)
      avatarUrl = `/files/static/${path.basename(uploadedAvatarPath)}`
    } catch (error) {
      return { success: false, error: "Failed to upload avatar: " + error }
    }
  }

  // Upload business logo
  let businessLogoUrl = user.businessLogo
  const businessLogoFile = formData.get("businessLogo") as File | null
  if (businessLogoFile instanceof File && businessLogoFile.size > 0) {
    try {
      const uploadedBusinessLogoPath = await uploadStaticImage(user, businessLogoFile, "businessLogo.png", 500, 500)
      businessLogoUrl = `/files/static/${path.basename(uploadedBusinessLogoPath)}`
    } catch (error) {
      return { success: false, error: "Failed to upload business logo: " + error }
    }
  }

  // Update user
  await updateUser(user.id, {
    name: validatedForm.data.name !== undefined ? validatedForm.data.name : user.name,
    avatar: avatarUrl,
    businessName: validatedForm.data.businessName !== undefined ? validatedForm.data.businessName : user.businessName,
    businessAddress:
      validatedForm.data.businessAddress !== undefined ? validatedForm.data.businessAddress : user.businessAddress,
    businessBankDetails:
      validatedForm.data.businessBankDetails !== undefined
        ? validatedForm.data.businessBankDetails
        : user.businessBankDetails,
    businessLogo: businessLogoUrl,
  })

  revalidatePath("/settings/profile")
  revalidatePath("/settings/business")
  return { success: true }
}

export async function addProjectAction(userId: string, data: Prisma.ProjectCreateInput) {
  const validatedForm = projectFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  const project = await createProject(userId, {
    code: codeFromName(validatedForm.data.name),
    name: validatedForm.data.name,
    llm_prompt: validatedForm.data.llm_prompt || null,
    color: validatedForm.data.color || randomHexColor(),
  })
  revalidatePath("/settings/projects")

  return { success: true, project }
}

export async function editProjectAction(userId: string, code: string, data: Prisma.ProjectUpdateInput) {
  const validatedForm = projectFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  const project = await updateProject(userId, code, {
    name: validatedForm.data.name,
    llm_prompt: validatedForm.data.llm_prompt,
    color: validatedForm.data.color || "",
  })
  revalidatePath("/settings/projects")

  return { success: true, project }
}

export async function deleteProjectAction(userId: string, code: string) {
  try {
    await deleteProject(userId, code)
  } catch (error) {
    return { success: false, error: "Failed to delete project" + error }
  }
  revalidatePath("/settings/projects")
  return { success: true }
}

export async function addCurrencyAction(userId: string, data: Prisma.CurrencyCreateInput) {
  const validatedForm = currencyFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  const currency = await createCurrency(userId, {
    code: validatedForm.data.code,
    name: validatedForm.data.name,
  })
  revalidatePath("/settings/currencies")

  return { success: true, currency }
}

export async function editCurrencyAction(userId: string, code: string, data: Prisma.CurrencyUpdateInput) {
  const validatedForm = currencyFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  const currency = await updateCurrency(userId, code, { name: validatedForm.data.name })
  revalidatePath("/settings/currencies")
  return { success: true, currency }
}

export async function deleteCurrencyAction(userId: string, code: string) {
  try {
    await deleteCurrency(userId, code)
  } catch (error) {
    return { success: false, error: "Failed to delete currency" + error }
  }
  revalidatePath("/settings/currencies")
  return { success: true }
}

export async function addCategoryAction(userId: string, data: Prisma.CategoryCreateInput) {
  const validatedForm = categoryFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  const category = await createCategory(userId, {
    code: codeFromName(validatedForm.data.name),
    name: validatedForm.data.name,
    llm_prompt: validatedForm.data.llm_prompt,
    color: validatedForm.data.color || "",
  })
  revalidatePath("/settings/categories")

  return { success: true, category }
}

export async function editCategoryAction(userId: string, code: string, data: Prisma.CategoryUpdateInput) {
  const validatedForm = categoryFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  const category = await updateCategory(userId, code, {
    name: validatedForm.data.name,
    llm_prompt: validatedForm.data.llm_prompt,
    color: validatedForm.data.color || "",
  })
  revalidatePath("/settings/categories")

  return { success: true, category }
}

export async function deleteCategoryAction(userId: string, code: string) {
  try {
    await deleteCategory(userId, code)
  } catch (error) {
    return { success: false, error: "Failed to delete category" + error }
  }
  revalidatePath("/settings/categories")
  return { success: true }
}

export async function addFieldAction(userId: string, data: Prisma.FieldCreateInput) {
  const validatedForm = fieldFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  const field = await createField(userId, {
    code: codeFromName(validatedForm.data.name),
    name: validatedForm.data.name,
    type: validatedForm.data.type,
    llm_prompt: validatedForm.data.llm_prompt,
    isVisibleInList: validatedForm.data.isVisibleInList,
    isVisibleInAnalysis: validatedForm.data.isVisibleInAnalysis,
    isRequired: validatedForm.data.isRequired,
    isExtra: true,
  })
  revalidatePath("/settings/fields")

  return { success: true, field }
}

export async function editFieldAction(userId: string, code: string, data: Prisma.FieldUpdateInput) {
  const validatedForm = fieldFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  const field = await updateField(userId, code, {
    name: validatedForm.data.name,
    type: validatedForm.data.type,
    llm_prompt: validatedForm.data.llm_prompt,
    isVisibleInList: validatedForm.data.isVisibleInList,
    isVisibleInAnalysis: validatedForm.data.isVisibleInAnalysis,
    isRequired: validatedForm.data.isRequired,
  })
  revalidatePath("/settings/fields")

  return { success: true, field }
}

export async function deleteFieldAction(userId: string, code: string) {
  try {
    await deleteField(userId, code)
  } catch (error) {
    return { success: false, error: "Failed to delete field" + error }
  }
  revalidatePath("/settings/fields")
  return { success: true }
}

export async function enableISDOCAction(): Promise<ActionState<void>> {
  const user = await getCurrentUser()
  
  try {
    // Check if already enabled
    const alreadyEnabled = await hasISDOCFields(user.id)
    if (alreadyEnabled) {
      return { success: true }
    }
    
    // Add ISDOC fields
    await addISDOCFieldsToUser(user.id)
    
    // Set the ISDOC prompt as a user setting
    await updateSettings(user.id, "prompt_analyse_isdoc", ISDOC_PROMPT_TEMPLATE_CZ)
    
    // Set a flag to indicate ISDOC is enabled
    await updateSettings(user.id, "isdoc_enabled", "true")
    
    revalidatePath("/settings")
    revalidatePath("/settings/fields")
    return { success: true }
  } catch (error) {
    console.error("Failed to enable ISDOC:", error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to enable ISDOC support" 
    }
  }
}

export async function disableISDOCAction(): Promise<ActionState<void>> {
  const user = await getCurrentUser()
  
  try {
    // Remove ISDOC fields
    for (const field of ISDOC_FIELDS) {
      try {
        await deleteField(user.id, field.code)
      } catch (error) {
        // Field might not exist, continue
        console.log(`Field ${field.code} not found, skipping`)
      }
    }
    
    // Update the flag
    await updateSettings(user.id, "isdoc_enabled", "false")
    
    revalidatePath("/settings")
    revalidatePath("/settings/fields")
    return { success: true }
  } catch (error) {
    console.error("Failed to disable ISDOC:", error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to disable ISDOC support" 
    }
  }
}
