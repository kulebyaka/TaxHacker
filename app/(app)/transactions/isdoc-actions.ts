"use server"

import { getCurrentUser } from "@/lib/auth"
import { getSettings } from "@/models/settings"
import { getTransactionById, getTransactionsByIds } from "@/models/transactions"
import { ActionState } from "@/lib/actions"
import { generateISDOCXML, ISDOCInvoiceData, getPaymentMethodCode } from "@/lib/isdoc/generator"
import { validateISDOCXML, parseAddressString, parseBankAccount, parseLineItems, parseVATBreakdown } from "@/lib/isdoc/validator"
import { prisma } from "@/lib/db"

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
    
    // Prepare ISDOC data
    const isdocData = await prepareISDOCData(transaction, user)
    
    // Generate XML
    const xmlContent = generateISDOCXML(isdocData)
    
    // Validate the generated XML
    const validation = validateISDOCXML(xmlContent)
    if (!validation.valid) {
      console.error("ISDOC validation errors:", validation.errors)
      return {
        success: false,
        error: "Generated ISDOC is invalid: " + (validation.errors || []).join(", ")
      }
    }
    
    const filename = `${isdocData.transaction.extra?.invoice_number || `INV-${transaction.id}`}.isdoc`
    
    return {
      success: true,
      data: {
        filename,
        content: xmlContent
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
    
    const exports = []
    const errors = []
    
    for (const transaction of transactions) {
      try {
        const isdocData = await prepareISDOCData(transaction, user)
        const xmlContent = generateISDOCXML(isdocData)
        
        const validation = validateISDOCXML(xmlContent)
        if (!validation.valid) {
          errors.push(`${transaction.id}: ${(validation.errors || []).join(", ")}`)
          continue
        }
        
        const filename = `${isdocData.transaction.extra?.invoice_number || `INV-${transaction.id}`}.isdoc`
        exports.push({ filename, content: xmlContent })
      } catch (error) {
        errors.push(`${transaction.id}: ${error instanceof Error ? error.message : "Unknown error"}`)
      }
    }
    
    if (exports.length === 0) {
      return {
        success: false,
        error: "Failed to export any transactions: " + errors.join("; ")
      }
    }
    
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

// Helper function to prepare ISDOC data from transaction
async function prepareISDOCData(transaction: any, user: any): Promise<ISDOCInvoiceData> {
  const extra = transaction.extra || {}
  
  // Parse addresses
  const supplierAddress = parseAddressString(extra.supplier_address || user.businessAddress || "")
  const customerAddress = parseAddressString(extra.customer_address || "")
  
  // Parse bank account
  const bankAccount = extra.supplier_bank_account && extra.supplier_bank_code
    ? parseBankAccount(extra.supplier_bank_account, extra.supplier_bank_code)
    : undefined
  
  // Parse line items
  const lineItems = extra.line_items
    ? parseLineItems(extra.line_items)
    : [{
        id: "1",
        description: transaction.name || "Item",
        quantity: 1,
        unit: "ks",
        unitPrice: (transaction.total || 0) / 100 / (1 + (extra.vat_rate || 0) / 100),
        totalPrice: (transaction.total || 0) / 100 / (1 + (extra.vat_rate || 0) / 100),
        vatRate: extra.vat_rate || 0,
        vatAmount: (extra.vat || 0) / 100
      }]
  
  // Calculate totals
  const totalWithoutVat = extra.total_without_vat 
    ? extra.total_without_vat / 100
    : (transaction.total || 0) / 100 / (1 + (extra.vat_rate || 0) / 100)
  
  const totalVat = extra.vat ? extra.vat / 100 : (transaction.total || 0) / 100 - totalWithoutVat
  const totalWithVat = (transaction.total || 0) / 100
  
  // Parse VAT breakdown
  const vatBreakdown = extra.total_vat_base && extra.total_vat_amounts
    ? parseVATBreakdown(extra.total_vat_base, extra.total_vat_amounts)
    : { [extra.vat_rate || 21]: { base: totalWithoutVat, amount: totalVat } }
  
  // Parse dates
  const dueDate = extra.due_date ? new Date(extra.due_date) : new Date()
  dueDate.setDate(dueDate.getDate() + 14) // Default 14 days payment term
  
  return {
    transaction: {
      ...transaction,
      extra
    },
    supplier: {
      name: extra.supplier_name || user.businessName || "Unknown Supplier",
      ic: extra.supplier_ic || user.businessIC || "00000000",
      dic: extra.supplier_dic || user.businessDIC || "CZ00000000",
      address: {
        ...supplierAddress,
        country: "Česká republika",
        countryCode: "CZ"
      },
      bankAccount
    },
    customer: {
      name: extra.customer_name || transaction.merchant || "Unknown Customer",
      ic: extra.customer_ic,
      dic: extra.customer_dic,
      address: {
        ...customerAddress,
        country: "Česká republika",
        countryCode: "CZ"
      }
    },
    lineItems,
    totals: {
      totalWithoutVat,
      totalVat,
      totalWithVat,
      vatBreakdown
    },
    paymentInfo: {
      variableSymbol: extra.variable_symbol || extra.invoice_number,
      constantSymbol: extra.constant_symbol,
      specificSymbol: extra.specific_symbol,
      dueDate,
      paymentMethod: extra.payment_method || "Příkazem"
    }
  }
}
