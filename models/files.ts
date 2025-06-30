"use server"

import { prisma } from "@/lib/db"
import { unlink } from "fs/promises"
import path from "path"
import { cache } from "react"
import { getTransactionById } from "./transactions"

export const getUnsortedFiles = cache(async (userId: string) => {
  return await prisma.file.findMany({
    where: {
      isReviewed: false,
      userId,
      parentId: null, // Get parent files only
    },
    include: {
      children: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  })
})

export const getUnsortedFilesCount = cache(async (userId: string) => {
  return await prisma.file.count({
    where: {
      isReviewed: false,
      userId,
      parentId: null, // Only count parent files
    },
  })
})

export const getFileById = cache(async (id: string, userId: string) => {
  return await prisma.file.findFirst({
    where: { id, userId },
    include: {
      children: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  })
})

export const getFilesByTransactionId = cache(async (id: string, userId: string) => {
  const transaction = await getTransactionById(id, userId)
  if (transaction && transaction.files) {
    return await prisma.file.findMany({
      where: {
        id: {
          in: transaction.files as string[],
        },
        userId,
      },
      include: {
        children: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    })
  }
  return []
})

export const createFile = async (userId: string, data: any) => {
  return await prisma.file.create({
    data: {
      ...data,
      userId,
    },
  })
}

export const createChildFile = async (userId: string, parentId: string, data: any) => {
  return await prisma.file.create({
    data: {
      ...data,
      userId,
      parentId,
    },
  })
}

export const getFileWithChildren = cache(async (fileId: string, userId: string) => {
  return await prisma.file.findFirst({
    where: { id: fileId, userId },
    include: {
      children: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  })
})

export const updateFile = async (id: string, userId: string, data: any) => {
  return await prisma.file.update({
    where: { id, userId },
    data,
  })
}

export const deleteFile = async (id: string, userId: string) => {
  const file = await getFileById(id, userId)
  if (!file) {
    return
  }

  // Delete all child files first
  if (file.children && file.children.length > 0) {
    for (const child of file.children) {
      try {
        await unlink(path.resolve(path.normalize(child.path)))
      } catch (error) {
        console.error("Error deleting child file:", error)
      }
    }
    
    await prisma.file.deleteMany({
      where: { 
        parentId: id,
        userId 
      },
    })
  }

  try {
    await unlink(path.resolve(path.normalize(file.path)))
  } catch (error) {
    console.error("Error deleting file:", error)
  }

  return await prisma.file.delete({
    where: { id, userId },
  })
}

export const deleteChildFile = async (id: string, userId: string) => {
  return await prisma.file.delete({
    where: { id, userId },
  })
}
