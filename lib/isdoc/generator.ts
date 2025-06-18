import { js2xml } from 'xml-js'
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
  const invoiceObject: any = {
    _declaration: { _attributes: { version: '1.0', encoding: 'UTF-8' } },
    Invoice: {
      _attributes: {
        'xmlns': 'http://isdoc.cz/namespace/2013',
        'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        'xsi:schemaLocation':
          'http://isdoc.cz/namespace/2013 https://isdoc.cz/6.0.2/xsd/isdoc-invoice-6.0.2.xsd',
        'version': '6.0.2',
      },
      DocumentType: { _text: '1' },
      ID: { _text: data.transaction.extra?.invoice_number || `INV-${data.transaction.id}` },
      UUID: { _text: data.transaction.id },
      IssueDate: { _text: formatDate(data.transaction.issuedAt || new Date()) },
      ...(data.transaction.extra?.tax_date && {
        TaxPointDate: { _text: data.transaction.extra.tax_date },
      }),
      VATApplicable: { _text: 'true' },
      ElectronicPossibilityAgreementReference: {
        _text: 'Příjemce souhlasí s elektronickou formou faktury',
      },
      LocalCurrencyCode: { _text: data.transaction.currencyCode || 'CZK' },
      CurrRate: { _text: '1' },
      RefCurrRate: { _text: '1' },
      AccountingSupplierParty: {
        Party: {
          PartyIdentification: { ID: { _text: data.supplier.ic } },
          PartyName: { Name: { _text: data.supplier.name } },
          PostalAddress: {
            StreetName: { _text: data.supplier.address.street },
            BuildingNumber: { _text: data.supplier.address.buildingNumber },
            CityName: { _text: data.supplier.address.city },
            PostalZone: { _text: data.supplier.address.postalCode },
            Country: {
              IdentificationCode: { _text: data.supplier.address.countryCode },
              Name: { _text: data.supplier.address.country },
            },
          },
          ...(data.supplier.dic && {
            PartyTaxScheme: {
              CompanyID: { _text: data.supplier.dic },
              TaxScheme: { _text: 'VAT' },
            },
          }),
        },
      },
      AccountingCustomerParty: {
        Party: {
          PartyIdentification: { ID: { _text: data.customer.ic || '00000000' } },
          PartyName: { Name: { _text: data.customer.name } },
          PostalAddress: {
            StreetName: { _text: data.customer.address.street },
            BuildingNumber: { _text: data.customer.address.buildingNumber },
            CityName: { _text: data.customer.address.city },
            PostalZone: { _text: data.customer.address.postalCode },
            Country: {
              IdentificationCode: { _text: data.customer.address.countryCode },
              Name: { _text: data.customer.address.country },
            },
          },
          ...(data.customer.dic && {
            PartyTaxScheme: {
              CompanyID: { _text: data.customer.dic },
              TaxScheme: { _text: 'VAT' },
            },
          }),
        },
      },
      InvoiceLines: {
        InvoiceLine: data.lineItems.map((item, index) => ({
          ID: { _text: (index + 1).toString() },
          ...(item.quantity && {
            InvoicedQuantity: {
              _attributes: { unitCode: item.unit || 'ks' },
              _text: item.quantity.toString(),
            },
          }),
          LineExtensionAmount: { _text: item.totalPrice.toFixed(2) },
          LineExtensionAmountTaxInclusive: {
            _text: (item.totalPrice + item.vatAmount).toFixed(2),
          },
          LineExtensionTaxAmount: { _text: item.vatAmount.toFixed(2) },
          UnitPrice: { _text: item.unitPrice.toFixed(2) },
          UnitPriceTaxInclusive: {
            _text: (item.unitPrice * (1 + item.vatRate / 100)).toFixed(2),
          },
          ClassifiedTaxCategory: {
            Percent: { _text: item.vatRate.toString() },
            VATCalculationMethod: { _text: '0' }, // From bottom
          },
          Item: { Description: { _text: item.description } },
        })),
      },
      TaxTotal: {
        TaxSubTotal: Object.entries(data.totals.vatBreakdown).map(([rate, amounts]) => ({
          TaxableAmount: { _text: amounts.base.toFixed(2) },
          TaxAmount: { _text: amounts.amount.toFixed(2) },
          TaxInclusiveAmount: { _text: (amounts.base + amounts.amount).toFixed(2) },
          AlreadyClaimedTaxableAmount: { _text: '0' },
          AlreadyClaimedTaxAmount: { _text: '0' },
          AlreadyClaimedTaxInclusiveAmount: { _text: '0' },
          DifferenceTaxableAmount: { _text: amounts.base.toFixed(2) },
          DifferenceTaxAmount: { _text: amounts.amount.toFixed(2) },
          DifferenceTaxInclusiveAmount: {
            _text: (amounts.base + amounts.amount).toFixed(2),
          },
          TaxCategory: { Percent: { _text: rate } },
        })),
        TaxAmount: { _text: data.totals.totalVat.toFixed(2) },
      },
      LegalMonetaryTotal: {
        TaxExclusiveAmount: { _text: data.totals.totalWithoutVat.toFixed(2) },
        TaxInclusiveAmount: { _text: data.totals.totalWithVat.toFixed(2) },
        AlreadyClaimedTaxExclusiveAmount: { _text: '0' },
        AlreadyClaimedTaxInclusiveAmount: { _text: '0' },
        DifferenceTaxExclusiveAmount: { _text: data.totals.totalWithoutVat.toFixed(2) },
        DifferenceTaxInclusiveAmount: { _text: data.totals.totalWithVat.toFixed(2) },
        PaidDepositsAmount: { _text: '0' },
        PayableAmount: { _text: data.totals.totalWithVat.toFixed(2) },
      },
      ...(data.supplier.bankAccount && {
        PaymentMeans: {
          Payment: {
            PaidAmount: { _text: data.totals.totalWithVat.toFixed(2) },
            PaymentMeansCode: { _text: '42' }, // Bank transfer
            Details: {
              PaymentDueDate: { _text: formatDate(data.paymentInfo.dueDate) },
              ID: { _text: data.supplier.bankAccount.accountNumber },
              BankCode: { _text: data.supplier.bankAccount.bankCode },
              Name: { _text: data.supplier.name },
              ...(data.supplier.bankAccount.iban && {
                IBAN: { _text: data.supplier.bankAccount.iban },
              }),
              ...(data.supplier.bankAccount.bic && {
                BIC: { _text: data.supplier.bankAccount.bic },
              }),
              ...(data.paymentInfo.variableSymbol && {
                VariableSymbol: { _text: data.paymentInfo.variableSymbol },
              }),
              ...(data.paymentInfo.constantSymbol && {
                ConstantSymbol: { _text: data.paymentInfo.constantSymbol },
              }),
              ...(data.paymentInfo.specificSymbol && {
                SpecificSymbol: { _text: data.paymentInfo.specificSymbol },
              }),
            },
          },
        },
      }),
    },
  }

  return js2xml(invoiceObject, { compact: true, spaces: 2 })
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
