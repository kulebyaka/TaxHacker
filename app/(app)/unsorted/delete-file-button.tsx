"use client"

import { Button } from "@/components/ui/button"
import { deleteAdditionalPhotoAction } from "./actions"
import { X } from "lucide-react"

interface DeleteFileButtonProps {
  fileId: string
}

export function DeleteFileButton({ fileId }: DeleteFileButtonProps) {
  const handleDeleteFile = async () => {
    await deleteAdditionalPhotoAction(fileId)
  }

  return (
    <Button
      type="button"
      onClick={handleDeleteFile}
      variant="destructive"
      size="icon"
      className="absolute -right-2 -top-2 rounded-full w-6 h-6 z-10"
    >
      <X className="h-4 w-4" />
    </Button>
  )
} 