import { create } from 'xmlbuilder2'
import { Transaction } from '@/prisma/client'

export interface ISDOCInvoiceData {
  transaction: Transaction & {
    extra?: any
    category?: { name: string }
    project?: { name: string }
  }
  supplier: {
    name: string
    ic: string
    dic: string
    address: {
      street: string
      buildingNumber: string
      city: string
      postalCode: string
      country: string
      countryCode: string
    }
    bankAccount?: {
      accountNumber: string
      bankCode: string
      iban?: string
      bic?: string
    }
  }
  customer: {
    name: string
    ic?: string
    dic?: string
    address: {
      street: string
      buildingNumber: string
      city: string
      postalCode: string
      country: string
      countryCode: string
    }
  }
  lineItems: Array<{
    id: string
    description: string
    quantity: number
    unit: string
    unitPrice: number
    totalPrice: number
    vatRate: number
    vatAmount: number
  }>
  totals: {
    totalWithoutVat: number
    totalVat: number
    totalWithVat: number
    vatBreakdown: Record<string, { base: number, amount: number }>
  }
  paymentInfo: {
    variableSymbol?: string
    constantSymbol?: string
    specificSymbol?: string
    dueDate: Date
    paymentMethod: string
  }
}

export function generateISDOCXML(data: ISDOCInvoiceData): string {
  const doc = create({ encoding: 'UTF-8' })
  
  const invoice = doc.ele('Invoice', {
    'xmlns': 'http://isdoc.cz/namespace/2013',
    'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
    'xsi:schemaLocation': 'http://isdoc.cz/namespace/2013 http://isdoc.cz/namespace/2013/isdoc-invoice-6.0.2.xsd',
    'version': '6.0.2'
  })

  // Document Type - 1 for standard invoice
  invoice.ele('DocumentType').txt('1')
  
  // Invoice ID and UUID
  invoice.ele('ID').txt(data.transaction.extra?.invoice_number || `INV-${data.transaction.id}`)
  invoice.ele('UUID').txt(data.transaction.id)
  
  // Issue Date
  invoice.ele('IssueDate').txt(formatDate(data.transaction.issuedAt || new Date()))
  
  // Tax Point Date
  if (data.transaction.extra?.tax_date) {
    invoice.ele('TaxPointDate').txt(data.transaction.extra.tax_date)
  }
  
  // VAT Applicable
  invoice.ele('VATApplicable').txt('true')
  
  // Electronic Possibility Agreement Reference
  invoice.ele('ElectronicPossibilityAgreementReference').txt('Příjemce souhlasí s elektronickou formou faktury')
  
  // Currency
  invoice.ele('LocalCurrencyCode').txt(data.transaction.currencyCode || 'CZK')
  invoice.ele('CurrRate').txt('1')
  invoice.ele('RefCurrRate').txt('1')
  
  // Accounting Supplier Party
  const supplierParty = invoice.ele('AccountingSupplierParty').ele('Party')
  
  // Party Identification
  const partyId = supplierParty.ele('PartyIdentification')
  partyId.ele('ID').txt(data.supplier.ic)
  
  // Party Name
  supplierParty.ele('PartyName').ele('Name').txt(data.supplier.name)
  
  // Postal Address
  const supplierAddress = supplierParty.ele('PostalAddress')
  supplierAddress.ele('StreetName').txt(data.supplier.address.street)
  supplierAddress.ele('BuildingNumber').txt(data.supplier.address.buildingNumber)
  supplierAddress.ele('CityName').txt(data.supplier.address.city)
  supplierAddress.ele('PostalZone').txt(data.supplier.address.postalCode)
  const supplierCountry = supplierAddress.ele('Country')
  supplierCountry.ele('IdentificationCode').txt(data.supplier.address.countryCode)
  supplierCountry.ele('Name').txt(data.supplier.address.country)
  
  // Party Tax Scheme
  if (data.supplier.dic) {
    const taxScheme = supplierParty.ele('PartyTaxScheme')
    taxScheme.ele('CompanyID').txt(data.supplier.dic)
    taxScheme.ele('TaxScheme').txt('VAT')
  }
  
  // Accounting Customer Party
  const customerParty = invoice.ele('AccountingCustomerParty').ele('Party')
  
  // Customer Party Identification
  const customerPartyId = customerParty.ele('PartyIdentification')
  customerPartyId.ele('ID').txt(data.customer.ic || '00000000')
  
  // Customer Party Name
  customerParty.ele('PartyName').ele('Name').txt(data.customer.name)
  
  // Customer Postal Address
  const customerAddress = customerParty.ele('PostalAddress')
  customerAddress.ele('StreetName').txt(data.customer.address.street)
  customerAddress.ele('BuildingNumber').txt(data.customer.address.buildingNumber)
  customerAddress.ele('CityName').txt(data.customer.address.city)
  customerAddress.ele('PostalZone').txt(data.customer.address.postalCode)
  const customerCountry = customerAddress.ele('Country')
  customerCountry.ele('IdentificationCode').txt(data.customer.address.countryCode)
  customerCountry.ele('Name').txt(data.customer.address.country)
  
  // Customer Tax Scheme
  if (data.customer.dic) {
    const customerTaxScheme = customerParty.ele('PartyTaxScheme')
    customerTaxScheme.ele('CompanyID').txt(data.customer.dic)
    customerTaxScheme.ele('TaxScheme').txt('VAT')
  }
  
  // Invoice Lines
  const invoiceLines = invoice.ele('InvoiceLines')
  
  data.lineItems.forEach((item, index) => {
    const line = invoiceLines.ele('InvoiceLine')
    line.ele('ID').txt((index + 1).toString())
    
    if (item.quantity) {
      const quantity = line.ele('InvoicedQuantity')
      quantity.att('unitCode', item.unit || 'ks')
      quantity.txt(item.quantity.toString())
    }
    
    line.ele('LineExtensionAmount').txt(item.totalPrice.toFixed(2))
    line.ele('LineExtensionAmountTaxInclusive').txt((item.totalPrice + item.vatAmount).toFixed(2))
    line.ele('LineExtensionTaxAmount').txt(item.vatAmount.toFixed(2))
    line.ele('UnitPrice').txt(item.unitPrice.toFixed(2))
    line.ele('UnitPriceTaxInclusive').txt((item.unitPrice * (1 + item.vatRate / 100)).toFixed(2))
    
    const classifiedTaxCategory = line.ele('ClassifiedTaxCategory')
    classifiedTaxCategory.ele('Percent').txt(item.vatRate.toString())
    classifiedTaxCategory.ele('VATCalculationMethod').txt('0') // From bottom
    
    const itemElement = line.ele('Item')
    itemElement.ele('Description').txt(item.description)
  })
  
  // Tax Total
  const taxTotal = invoice.ele('TaxTotal')
  
  Object.entries(data.totals.vatBreakdown).forEach(([rate, amounts]) => {
    const taxSubTotal = taxTotal.ele('TaxSubTotal')
    taxSubTotal.ele('TaxableAmount').txt(amounts.base.toFixed(2))
    taxSubTotal.ele('TaxAmount').txt(amounts.amount.toFixed(2))
    taxSubTotal.ele('TaxInclusiveAmount').txt((amounts.base + amounts.amount).toFixed(2))
    taxSubTotal.ele('AlreadyClaimedTaxableAmount').txt('0')
    taxSubTotal.ele('AlreadyClaimedTaxAmount').txt('0')
    taxSubTotal.ele('AlreadyClaimedTaxInclusiveAmount').txt('0')
    taxSubTotal.ele('DifferenceTaxableAmount').txt(amounts.base.toFixed(2))
    taxSubTotal.ele('DifferenceTaxAmount').txt(amounts.amount.toFixed(2))
    taxSubTotal.ele('DifferenceTaxInclusiveAmount').txt((amounts.base + amounts.amount).toFixed(2))
    
    const taxCategory = taxSubTotal.ele('TaxCategory')
    taxCategory.ele('Percent').txt(rate)
  })
  
  taxTotal.ele('TaxAmount').txt(data.totals.totalVat.toFixed(2))
  
  // Legal Monetary Total
  const legalMonetaryTotal = invoice.ele('LegalMonetaryTotal')
  legalMonetaryTotal.ele('TaxExclusiveAmount').txt(data.totals.totalWithoutVat.toFixed(2))
  legalMonetaryTotal.ele('TaxInclusiveAmount').txt(data.totals.totalWithVat.toFixed(2))
  legalMonetaryTotal.ele('AlreadyClaimedTaxExclusiveAmount').txt('0')
  legalMonetaryTotal.ele('AlreadyClaimedTaxInclusiveAmount').txt('0')
  legalMonetaryTotal.ele('DifferenceTaxExclusiveAmount').txt(data.totals.totalWithoutVat.toFixed(2))
  legalMonetaryTotal.ele('DifferenceTaxInclusiveAmount').txt(data.totals.totalWithVat.toFixed(2))
  legalMonetaryTotal.ele('PaidDepositsAmount').txt('0')
  legalMonetaryTotal.ele('PayableAmount').txt(data.totals.totalWithVat.toFixed(2))
  
  // Payment Means
  if (data.supplier.bankAccount) {
    const paymentMeans = invoice.ele('PaymentMeans')
    const payment = paymentMeans.ele('Payment')
    payment.ele('PaidAmount').txt(data.totals.totalWithVat.toFixed(2))
    payment.ele('PaymentMeansCode').txt('42') // Bank transfer
    
    const details = payment.ele('Details')
    details.ele('PaymentDueDate').txt(formatDate(data.paymentInfo.dueDate))
    details.ele('ID').txt(data.supplier.bankAccount.accountNumber)
    details.ele('BankCode').txt(data.supplier.bankAccount.bankCode)
    details.ele('Name').txt(data.supplier.name)
    
    if (data.supplier.bankAccount.iban) {
      details.ele('IBAN').txt(data.supplier.bankAccount.iban)
    }
    if (data.supplier.bankAccount.bic) {
      details.ele('BIC').txt(data.supplier.bankAccount.bic)
    }
    
    if (data.paymentInfo.variableSymbol) {
      details.ele('VariableSymbol').txt(data.paymentInfo.variableSymbol)
    }
    if (data.paymentInfo.constantSymbol) {
      details.ele('ConstantSymbol').txt(data.paymentInfo.constantSymbol)
    }
    if (data.paymentInfo.specificSymbol) {
      details.ele('SpecificSymbol').txt(data.paymentInfo.specificSymbol)
    }
  }
  
  return doc.end({ prettyPrint: true })
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

// Payment method code mapping
export function getPaymentMethodCode(method: string): string {
  const mapping: Record<string, string> = {
    'cash': '10',
    'hotově': '10',
    'check': '20',
    'šek': '20',
    'transfer': '42',
    'převod': '42',
    'příkazem': '42',
    'card': '48',
    'karta': '48',
    'kartou': '48',
    'debit': '49',
    'inkaso': '49',
    'cod': '50',
    'dobírka': '50',
    'composition': '97',
    'zaúčtování': '97'
  }
  
  const lowerMethod = method.toLowerCase()
  for (const [key, value] of Object.entries(mapping)) {
    if (lowerMethod.includes(key)) {
      return value
    }
  }
  
  return '42' // Default to bank transfer
}
