import supabase from './supabase.js'

const tableMap = {
  projects: 'projects',
  enquiries: 'enquiries',
  customers: 'customers',
  shoots: 'shoots',
  invoices: 'invoices',
  payments: 'payments',
  settings: 'settings'
}

const mapRow = (table, row) => {
  const r = { ...row }

  if (r.createdAt !== undefined) { r.created_at = r.createdAt; delete r.createdAt }
  if (r.customerId !== undefined) { r.customer_id = r.customerId; delete r.customerId }
  if (r.bookingId !== undefined) { r.booking_id = r.bookingId; delete r.bookingId }
  if (r.packagePrice !== undefined) { r.package_price = r.packagePrice; delete r.packagePrice }
  if (r.customServices !== undefined) { r.custom_services = r.customServices; delete r.customServices }
  if (r.shootDate !== undefined) { r.shoot_date = r.shootDate; delete r.shootDate }
  if (r.invoiceNo !== undefined) { r.invoice_no = r.invoiceNo; delete r.invoiceNo }
  if (r.amountDue !== undefined) { r.amount_due = r.amountDue; delete r.amountDue }
  if (r.upiId !== undefined) { r.upi_id = r.upiId; delete r.upiId }
  if (r.upiName !== undefined) { r.upi_name = r.upiName; delete r.upiName }
  if (r.businessName !== undefined) { r.business_name = r.businessName; delete r.businessName }

  if (table === 'settings') r.id = 1

  return r
}

const unmapRow = (table, row) => {
  const r = { ...row }

  if (r.created_at !== undefined) { r.createdAt = r.created_at; delete r.created_at }
  if (r.customer_id !== undefined) { r.customerId = r.customer_id; delete r.customer_id }
  if (r.booking_id !== undefined) { r.bookingId = r.booking_id; delete r.booking_id }
  if (r.package_price !== undefined) { r.packagePrice = r.package_price; delete r.package_price }
  if (r.custom_services !== undefined) { r.customServices = r.custom_services; delete r.custom_services }
  if (r.shoot_date !== undefined) { r.shootDate = r.shoot_date; delete r.shoot_date }
  if (r.invoice_no !== undefined) { r.invoiceNo = r.invoice_no; delete r.invoice_no }
  if (r.amount_due !== undefined) { r.amountDue = r.amount_due; delete r.amount_due }
  if (r.upi_id !== undefined) { r.upiId = r.upi_id; delete r.upi_id }
  if (r.upi_name !== undefined) { r.upiName = r.upi_name; delete r.upiName }
  if (r.business_name !== undefined) { r.businessName = r.business_name; delete r.business_name }

  return r
}

export const readTable = async name => {
  const table = tableMap[name]

  if (name === 'settings') {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('id', 1)
      .maybeSingle()

    if (error) throw error

    return data
      ? unmapRow(name, data)
      : {
          id: 1,
          businessName: 'BHANU VISUALS',
          phone: '9346169352',
          email: 'bhanuvisuals17@gmail.com',
          upiId: '',
          upiName: 'Bhanu Visuals'
        }
  }

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data || []).map(r => unmapRow(name, r))
}

export const writeTable = async (name, value) => {
  const table = tableMap[name]

  if (name === 'settings') {
    const { error } = await supabase
      .from(table)
      .upsert(mapRow(name, value))

    if (error) throw error
    return
  }

  const rows = Array.isArray(value) ? value : [value]

  const { data: existing, error: existingError } = await supabase
    .from(table)
    .select('id')

  if (existingError) throw existingError

  const wantedIds = new Set(rows.map(r => String(r.id)))

  for (const item of existing || []) {
    if (!wantedIds.has(String(item.id))) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', item.id)

      if (error) throw error
    }
  }

  if (rows.length) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.map(r => mapRow(name, r)))

    if (error) throw error
  }
}

export const upsertTableRow = async (name, row) => {
  const table = tableMap[name]

  const { data, error } = await supabase
    .from(table)
    .upsert(mapRow(name, row))
    .select()
    .single()

  if (error) throw error

  return unmapRow(name, data)
}

export const deleteTableRow = async (name, id) => {
  const table = tableMap[name]

  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', id)

  if (error) throw error
}
