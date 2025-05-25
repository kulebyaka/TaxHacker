"use server"

import { getCurrentUser } from "@/lib/auth"
import { getSettings } from "@/models/settings"
import { getTransactionById, getTransactionsByIds } from "@/models/transactions"
import { ActionState } from "@/lib/actions"

export async function exportTransactionToISDOC(
  transactionId: string
): Promise<ActionState<{ filename: string; content: string }>> {
  const user = await getCurrentUser()
  
  try {
    // Get user settings to check if ISDOC is enabled
    const settings = await getSettings(user.id)
    if (settings.isdoc_enabled !== "true") {
      return { success: false, error: "ISDOC support is not enabled. Please enable it in settings." }
    }
    
    // Get transaction with all fields
    const transaction = await getTransactionById(transactionId, user.id)
    if (!transaction) {
      return { success: false, error: "Transaction not found" }
    }
    
    // TODO: Implement ISDOC XML generation
    console.log("Exporting transaction to ISDOC:", transactionId)
    
    // For now, return a placeholder
    return {
      success: true,
      data: {
        filename: `invoice_${transaction.id}.isdoc`,
        content: "<!-- ISDOC export will be implemented here -->"
      }
    }
  } catch (error) {
    console.error("Failed to export to ISDOC:", error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to export to ISDOC" 
    }
  }
}

export async function exportTransactionsToISDOC(
  transactionIds: string[]
): Promise<ActionState<{ filename: string; content: string }[]>> {
  const user = await getCurrentUser()
  
  try {
    // Get user settings to check if ISDOC is enabled
    const settings = await getSettings(user.id)
    if (settings.isdoc_enabled !== "true") {
      return { success: false, error: "ISDOC support is not enabled. Please enable it in settings." }
    }
    
    // Get all transactions
    const transactions = await getTransactionsByIds(transactionIds, user.id)
    if (!transactions || transactions.length === 0) {
      return { success: false, error: "No transactions found" }
    }
    
    // TODO: Implement bulk ISDOC XML generation
    console.log("Exporting transactions to ISDOC:", transactionIds)
    
    // For now, return placeholders
    const exports = transactions.map(transaction => ({
      filename: `invoice_${transaction.id}.isdoc`,
      content: "<!-- ISDOC export will be implemented here -->"
    }))
    
    return {
      success: true,
      data: exports
    }
  } catch (error) {
    console.error("Failed to export to ISDOC:", error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to export to ISDOC" 
    }
  }
}
