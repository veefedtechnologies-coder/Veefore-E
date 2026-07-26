/**
 * Invoice MongoDB model.
 *
 * One invoice document per successfully paid billing cycle (first payment or
 * renewal). Invoices are generated after payment success is confirmed —
 * never before. GST is computed using a configurable rate (India GST on
 * SaaS is commonly 18%) applied to the base amount to derive the total.
 */

import mongoose, { Schema, type Document } from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface IInvoice extends Document {
  /** UUID — primary application-level identifier. */
  invoiceId: string
  /** Human-readable sequential invoice number, e.g. 'INV-2026-000123'. */
  invoiceNumber: string
  /** The user this invoice was issued to. */
  userId: string
  /** The workspace this invoice is billed against. */
  workspaceId: string
  /** The Payment document this invoice was generated from. */
  paymentId: string
  /** Plan this invoice covers. */
  planId: string
  billingCycle: 'monthly' | 'yearly'
  /** Base amount before tax, in whole currency units. */
  baseAmount: number
  /** GST rate applied, as a decimal (e.g. 0.18 for 18%). */
  gstRate: number
  /** GST amount charged, in whole currency units. */
  gstAmount: number
  /** Total amount (baseAmount + gstAmount), matching the actual payment amount. */
  totalAmount: number
  currency: string
  /** GSTIN of the business, if registered — stored for record-keeping on the invoice. */
  gstin: string | null
  /** Publicly downloadable URL of the generated invoice PDF, once generated. */
  pdfUrl: string | null
  /** Auto-managed by Mongoose timestamps option. */
  createdAt: Date
  updatedAt: Date
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const InvoiceSchema = new Schema<IInvoice>(
  {
    invoiceId: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
    },
    invoiceNumber: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    workspaceId: { type: String, required: true },
    paymentId: { type: String, required: true },
    planId: { type: String, required: true },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], required: true },
    baseAmount: { type: Number, required: true },
    gstRate: { type: Number, required: true, default: 0 },
    gstAmount: { type: Number, required: true, default: 0 },
    totalAmount: { type: Number, required: true },
    currency: { type: String, required: true, default: 'INR' },
    gstin: { type: String, default: null },
    pdfUrl: { type: String, default: null },
  },
  { timestamps: true }
)

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

InvoiceSchema.index({ userId: 1, createdAt: -1 })
InvoiceSchema.index({ invoiceNumber: 1 }, { unique: true })
InvoiceSchema.index({ paymentId: 1 })

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

const InvoiceModel =
  (mongoose.models.Invoice as mongoose.Model<IInvoice>) ||
  mongoose.model<IInvoice>('Invoice', InvoiceSchema)

export default InvoiceModel
