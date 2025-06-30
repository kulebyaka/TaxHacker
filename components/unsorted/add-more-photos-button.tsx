"use client"

import { addMorePhotosAction } from "@/app/(app)/unsorted/actions"
import { useNotification } from "@/app/(app)/context"
import { Button } from "@/components/ui/button"
import { File, Plus } from "lucide-react"
import { useRef, useState, useEffect } from "react"
import { useActionState } from "react"

interface AddMorePhotosButtonProps {
  parentFileId: string
}

export function AddMorePhotosButton({ parentFileId }: AddMorePhotosButtonProps) {
  const { showNotification } = useNotification()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [state, action, isPending] = useActionState(addMorePhotosAction, null)

  // Handle action state changes
  useEffect(() => {
    if (state) {
      if (state.success) {
        showNotification({ 
          code: "global.banner", 
          message: "Photo added successfully!", 
          type: "success" 
        })
      } else {
        showNotification({ 
          code: "global.banner", 
          message: state.error || "Failed to add photo", 
          type: "failed" 
        })
      }
    }
  }, [state, showNotification])

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    
    try {
      // Create FormData with file
      const formData = new FormData()
      formData.append("parentFileId", parentFileId)
      formData.append("file", file)

      // Call the server action
      await action(formData)
      
    } catch (error) {
      console.error("Failed to add more photos:", error)
      showNotification({ 
        code: "global.banner", 
        message: "Failed to add more photos", 
        type: "failed" 
      })
    } finally {
      setIsUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        onChange={handleFileSelect}
        className="hidden"
      />
      <Button
        onClick={handleClick}
        disabled={isUploading || isPending}
        variant="outline"
        size="sm"
        className="w-full"
      >
        {isUploading || isPending ? (
          <>
            <File className="mr-1 h-4 w-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <Plus className="mr-1 h-4 w-4" />
            Add more photos
          </>
        )}
      </Button>
    </>
  )
} 