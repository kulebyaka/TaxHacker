"use client"

import { bulkDeleteTransactionsAction } from "@/app/(app)/transactions/actions"
import { exportTransactionsToISDOC } from "@/app/(app)/transactions/isdoc-actions"
import { Button } from "@/components/ui/button"
import { Trash2, FileText } from "lucide-react"
import { useState } from "react"

interface BulkActionsMenuProps {
  selectedIds: string[]
  onActionComplete?: () => void
  isISDOCEnabled?: boolean
}

export function BulkActionsMenu({ selectedIds, onActionComplete, isISDOCEnabled = false }: BulkActionsMenuProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const handleDelete = async () => {
    const confirmMessage =
      "Are you sure you want to delete these transactions and all their files? This action cannot be undone."
    if (!confirm(confirmMessage)) return

    try {
      setIsLoading(true)
      const result = await bulkDeleteTransactionsAction(selectedIds)
      if (!result.success) {
        throw new Error(result.error)
      }
      onActionComplete?.()
    } catch (error) {
      console.error("Failed to delete transactions:", error)
      alert(`Failed to delete transactions: ${error}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportISDOC = async () => {
    try {
      setIsExporting(true)
      const result = await exportTransactionsToISDOC(selectedIds)
      if (!result.success) {
        throw new Error(result.error)
      }
      
      if (result.data && result.data.length > 0) {
        // If single file, download directly
        if (result.data.length === 1) {
          const file = result.data[0]
          const blob = new Blob([file.content], { type: 'application/xml' })
          const url = window.URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = file.filename
          document.body.appendChild(a)
          a.click()
          window.URL.revokeObjectURL(url)
          document.body.removeChild(a)
        } else {
          // For multiple files, create a zip (requires JSZip library)
          // For now, we'll download them one by one with a delay
          for (const file of result.data) {
            const blob = new Blob([file.content], { type: 'application/xml' })
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = file.filename
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)
            // Small delay between downloads
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        }
      }
    } catch (error) {
      console.error("Failed to export to ISDOC:", error)
      alert(`Failed to export to ISDOC: ${error}`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex gap-2">
      {isISDOCEnabled && (
        <Button 
          variant="outline" 
          className="min-w-48 gap-2" 
          disabled={isExporting} 
          onClick={handleExportISDOC}
        >
          <FileText className="h-4 w-4" />
          Export {selectedIds.length} to ISDOC
        </Button>
      )}
      <Button variant="destructive" className="min-w-48 gap-2" disabled={isLoading} onClick={handleDelete}>
        <Trash2 className="h-4 w-4" />
        Delete {selectedIds.length} transactions
      </Button>
    </div>
  )
}
