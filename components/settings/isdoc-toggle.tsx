"use client"

import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useState, useTransition } from "react"
import { enableISDOCAction, disableISDOCAction } from "@/app/(app)/settings/actions"
import { Loader2, Info, AlertCircle, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ISDOCToggleProps {
  enabled: boolean
  className?: string
}

export function ISDOCToggle({ enabled: initialEnabled, className }: ISDOCToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleToggle = (checked: boolean) => {
    setError(null)
    startTransition(async () => {
      try {
        if (checked) {
          const result = await enableISDOCAction()
          if (!result.success) {
            setError(result.error || "Failed to enable ISDOC support")
            return
          }
        } else {
          const result = await disableISDOCAction()
          if (!result.success) {
            setError(result.error || "Failed to disable ISDOC support")
            return
          }
        }
        setEnabled(checked)
      } catch (err) {
        setError("An unexpected error occurred")
        console.error(err)
      }
    })
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center space-x-2">
        <Switch
          id="isdoc-toggle"
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={isPending}
        />
        <Label 
          htmlFor="isdoc-toggle" 
          className="cursor-pointer flex items-center gap-2"
        >
          Enable ISDOC Support
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        </Label>
      </div>
      
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex gap-2">
          <Info className="h-5 w-5 flex-shrink-0 text-blue-600" />
          <p className="text-sm text-gray-600">
            ISDOC is the Czech electronic invoicing standard. When enabled, the system will extract 
            additional fields from Czech invoices including IČ, DIČ, payment symbols, and detailed 
            line items required for ISDOC export.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex gap-2">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
            <p className="text-sm text-red-600">
              {error}
            </p>
          </div>
        </div>
      )}

      {enabled && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex gap-2">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600" />
            <p className="text-sm text-green-600">
              ISDOC support is active. Czech invoices will now be analyzed with enhanced field extraction.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
