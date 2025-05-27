import { XMLValidator } from 'fast-xml-parser'
import fs from 'fs/promises'
import path from 'path'

// Store XSD schema content
let schemaContent: string | null = null

export async function loadISDOCSchema(): Promise<string> {
  if (schemaContent) {
    return schemaContent
  }
  
  // In production, you should download and store the XSD locally
  // For now, we'll use the schema URL directly
  try {
    const response = await fetch('https://isdoc.cz/6.0.2/xsd/isdoc-invoice-6.0.2.xsd')
    schemaContent = await response.text()
    return schemaContent
  } catch (error) {
    console.error('Failed to load ISDOC schema:', error)
    throw new Error('Could not load ISDOC schema for validation')
  }
}

export function validateISDOCXML(xmlContent: string): { valid: boolean; errors?: string[] } {
  // Use fast-xml-parser for basic XML validation
  
  try {
    // Basic XML structure validation
    const result = XMLValidator.validate(xmlContent, {
      allowBooleanAttributes: true
    })
    
    if (result !== true) {
      return {
        valid: false,
        errors: [result.err.msg]
      }
    }
    
    // Check for required ISDOC elements
    const errors: string[] = []
    
    // Basic checks for required elements
    const requiredElements = [
      'DocumentType',
      'ID',
      'UUID',
      'IssueDate',
      'VATApplicable',
      'ElectronicPossibilityAgreementReference',
      'LocalCurrencyCode',
      'CurrRate',
      'RefCurrRate',
      'AccountingSupplierParty',
      'AccountingCustomerParty',
      'InvoiceLines',
      'TaxTotal',
      'LegalMonetaryTotal'
    ]
    
    for (const element of requiredElements) {
      if (!xmlContent.includes(`<${element}>`)) {
        errors.push(`Missing required element: ${element}`)
      }
    }
    
    // Check version attribute
    if (!xmlContent.includes('version="6.0.2"')) {
      errors.push('Invalid or missing ISDOC version attribute')
    }
    
    // Check namespace
    if (!xmlContent.includes('xmlns="http://isdoc.cz/namespace/2013"')) {
      errors.push('Invalid or missing ISDOC namespace')
    }
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    }
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'Unknown validation error']
    }
  }
}

// Helper function to extract data from transaction extra fields
export function parseAddressString(addressString: string): {
  street: string
  buildingNumber: string
  city: string
  postalCode: string
} {
  // Example: "Vinohradská 1245/53, 120 00 Praha 2"
  const parts = addressString.split(',').map(s => s.trim())
  
  if (parts.length < 2) {
    return {
      street: addressString,
      buildingNumber: '',
      city: '',
      postalCode: ''
    }
  }
  
  // Extract street and building number
  const streetParts = parts[0].split(' ')
  const buildingNumber = streetParts.pop() || ''
  const street = streetParts.join(' ')
  
  // Extract postal code and city
  const cityParts = parts[1].split(' ')
  const postalCode = cityParts.slice(0, 2).join(' ')
  const city = cityParts.slice(2).join(' ')
  
  return {
    street,
    buildingNumber,
    city,
    postalCode
  }
}

// Helper to parse bank account
export function parseBankAccount(accountString: string, bankCode: string): {
  accountNumber: string
  bankCode: string
} {
  return {
    accountNumber: accountString,
    bankCode: bankCode
  }
}

// Helper to parse line items from JSON
export function parseLineItems(lineItemsJson: string): Array<{
  id: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  totalPrice: number
  vatRate: number
  vatAmount: number
}> {
  try {
    const items = JSON.parse(lineItemsJson)
    return items.map((item: any, index: number) => ({
      id: item.code || `ITEM-${index + 1}`,
      description: item.description || '',
      quantity: parseFloat(item.quantity) || 1,
      unit: item.unit || 'ks',
      unitPrice: parseFloat(item.unit_price) || 0,
      totalPrice: parseFloat(item.total) || 0,
      vatRate: parseFloat(item.vat_rate) || 0,
      vatAmount: parseFloat(item.vat_amount) || 0
    }))
  } catch (error) {
    console.error('Failed to parse line items:', error)
    return []
  }
}

// Helper to parse VAT breakdown
export function parseVATBreakdown(
  vatBaseJson: string,
  vatAmountsJson: string
): Record<string, { base: number; amount: number }> {
  try {
    const bases = JSON.parse(vatBaseJson)
    const amounts = JSON.parse(vatAmountsJson)
    
    const breakdown: Record<string, { base: number; amount: number }> = {}
    
    for (const rate in bases) {
      breakdown[rate] = {
        base: parseFloat(bases[rate]) || 0,
        amount: parseFloat(amounts[rate]) || 0
      }
    }
    
    return breakdown
  } catch (error) {
    console.error('Failed to parse VAT breakdown:', error)
    return {}
  }
}
