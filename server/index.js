import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'

dotenv.config()
const __dirname=path.dirname(fileURLToPath(import.meta.url))
const DATA=path.join(__dirname,'data')
const PDF_DIR=process.env.VERCEL ? '/tmp/bhanu-visuals-generated' : path.join(__dirname,'generated')
await fs.mkdir(DATA,{recursive:true}); await fs.mkdir(PDF_DIR,{recursive:true})
const files={
  projects:path.join(DATA,'projects.json'), enquiries:path.join(DATA,'enquiries.json'),
  customers:path.join(DATA,'customers.json'), shoots:path.join(DATA,'shoots.json'),
  invoices:path.join(DATA,'invoices.json'), payments:path.join(DATA,'payments.json'), settings:path.join(DATA,'settings.json')
}
const defaults={customers:[],shoots:[],invoices:[],payments:[],settings:{businessName:'BHANU VISUALS',phone:'9346169352',email:'bhanuvisuals17@gmail.com',upiId:'',upiName:'Bhanu Visuals'}}
for(const [k,f] of Object.entries(files)){
  try{await fs.access(f)}catch{await fs.writeFile(f,JSON.stringify(defaults[k]??[],null,2))}
}
const app=express(); app.use(cors()); app.use(express.json({limit:'5mb'}))
const port=process.env.PORT||4000
const read=async f=>JSON.parse(await fs.readFile(f,'utf8'))
const write=async(f,d)=>fs.writeFile(f,JSON.stringify(d,null,2))
const nextNumber=(items,prefix)=>`${prefix}${String(items.length+1).padStart(4,'0')}`
const safePhone=v=>String(v||'').replace(/\D/g,'')

app.get('/api/health',(req,res)=>res.json({ok:true,service:'Bhanu Visuals API'}))
app.get('/api/projects',async(req,res)=>{try{res.json(await read(files.projects))}catch{res.status(500).json({error:'Could not read projects'})}})

function auth(req,res,next){const h=req.headers.authorization||'';const token=h.startsWith('Bearer ')?h.slice(7):'';try{req.user=jwt.verify(token,process.env.JWT_SECRET||'dev-secret');next()}catch{res.status(401).json({error:'Unauthorized'})}}
app.post('/api/admin/login',(req,res)=>{const {username,password}=req.body;if(username===process.env.ADMIN_USER&&password===process.env.ADMIN_PASSWORD){const token=jwt.sign({username,role:'admin'},process.env.JWT_SECRET||'dev-secret',{expiresIn:'12h'});return res.json({token})}res.status(401).json({error:'Invalid credentials'})})

function transport(){
  if(!(process.env.SMTP_USER&&process.env.SMTP_PASS)) return null
  return nodemailer.createTransport({host:process.env.SMTP_HOST||'smtp.gmail.com',port:Number(process.env.SMTP_PORT||465),secure:String(process.env.SMTP_SECURE||'true')==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}})
}

async function ensureCustomer(item){
  const customers=await read(files.customers)
  const phone=safePhone(item.phone), email=String(item.email||'').toLowerCase()
  let customer=customers.find(c=>safePhone(c.phone)===phone || (email && c.email?.toLowerCase()===email))
  if(!customer){customer={id:`BV-C-${String(customers.length+1).padStart(4,'0')}`,createdAt:new Date().toISOString(),name:item.name,phone:item.phone,email:item.email,notes:''};customers.unshift(customer)}
  else customer={...customer,name:item.name||customer.name,phone:item.phone||customer.phone,email:item.email||customer.email}
  const idx=customers.findIndex(c=>c.id===customer.id); if(idx>=0) customers[idx]=customer; await write(files.customers,customers)
  return customer
}

async function buildEnquiryPdf(item,file){
  const doc=new PDFDocument({size:'A4',margin:48}); const stream=doc.pipe(fsSync.createWriteStream(file))
  doc.fontSize(22).fillColor('#111').text('BHANU VISUALS'); doc.fontSize(9).fillColor('#B8860B').text('SHOOT • EDIT • ELEVATE')
  doc.moveDown(1).strokeColor('#B8860B').moveTo(48,95).lineTo(547,95).stroke(); doc.moveDown(1.3)
  doc.fontSize(18).fillColor('#111').text('PROJECT ENQUIRY'); doc.moveDown(.7)
  const rows=[['Customer ID',item.customerId],['Booking ID',item.bookingId],['Client Name',item.name],['Email',item.email],['Phone',item.phone],['Project Type',item.type],['Package','Custom Package'],['Services',(item.customServices||[]).join(', ')||'—'],['Project Details',item.details],['Submitted',new Date(item.createdAt).toLocaleString('en-IN')]]
  for(const [label,value] of rows){doc.fontSize(9).fillColor('#8a6a18').text(label.toUpperCase());doc.fontSize(11).fillColor('#222').text(String(value||'—'),{width:490});doc.moveDown(.55)}
  doc.moveDown(1);doc.fontSize(10).fillColor('#555').text('Bhanu Visuals • 9346169352 • bhanuvisuals17@gmail.com'); doc.end(); stream.on('finish',()=>{}); stream.on('error',()=>{}); return new Promise((resolve,reject)=>{stream.on('finish',()=>resolve());stream.on('error',reject)})
}

async function sendEmail(to,subject,text,pdfPath,replyTo){const t=transport();if(!t)throw new Error('SMTP email is not configured. Add SMTP_PASS (a Gmail App Password) to server/.env and restart the server.');await t.sendMail({from:process.env.SMTP_USER,to,replyTo,subject,text,attachments:[{filename:path.basename(pdfPath),path:pdfPath,contentType:'application/pdf'}]});return true}

async function sendWhatsAppPdf(to,pdfPath,caption){
  const token=process.env.WHATSAPP_TOKEN, phoneId=process.env.WHATSAPP_PHONE_NUMBER_ID
  if(!(token&&phoneId&&to)) return false
  const graphVersion=process.env.WHATSAPP_GRAPH_VERSION||'v23.0', base=`https://graph.facebook.com/${graphVersion}/${phoneId}`
  const file=await fs.readFile(pdfPath); const form=new FormData(); form.append('messaging_product','whatsapp'); form.append('file',new Blob([file],{type:'application/pdf'}),path.basename(pdfPath)); form.append('type','application/pdf')
  const upload=await fetch(`${base}/media`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form}); const media=await upload.json(); if(!upload.ok)throw new Error(media?.error?.message||'WhatsApp media upload failed')
  const send=await fetch(`${base}/messages`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to,type:'document',document:{id:media.id,caption,filename:path.basename(pdfPath)}})}); const result=await send.json(); if(!send.ok)throw new Error(result?.error?.message||'WhatsApp PDF send failed'); return true
}

app.post('/api/enquiries',async(req,res)=>{
  try{
    const body=req.body||{}; const required=['name','email','phone','type','details']
    if(required.some(k=>!String(body[k]||'').trim()))return res.status(400).json({error:'Complete all required client details.'})
    if(body.mode!=='custom'||!Array.isArray(body.customServices)||body.customServices.length===0)return res.status(400).json({error:'Select at least one custom service.'})
    const customer=await ensureCustomer(body), enquiries=await read(files.enquiries), shoots=await read(files.shoots)
    const bookingId=`BV-B-${new Date().getFullYear()}-${String(enquiries.length+1).padStart(4,'0')}`
    const item={id:Date.now().toString(),createdAt:new Date().toISOString(),customerId:customer.id,bookingId,status:'New Enquiry',package:'Custom Package',packagePrice:'Quotation after review',...body}
    enquiries.unshift(item); await write(files.enquiries,enquiries)
    const shoot={id:`SH-${Date.now()}`,customerId:customer.id,bookingId,shootDate:'',location:'',type:body.type,status:'Enquiry',services:body.customServices,notes:body.details,createdAt:item.createdAt}; shoots.unshift(shoot); await write(files.shoots,shoots)
    const pdfPath=path.join(PDF_DIR,`Bhanu-Visuals-Enquiry-${bookingId}.pdf`); await buildEnquiryPdf(item,pdfPath)
    let emailSent=false,whatsappSent=false
    try{emailSent=await sendEmail(process.env.MAIL_TO||'bhanuvisuals17@gmail.com',`New Bhanu Visuals enquiry — ${body.name}`,`New enquiry ${bookingId} from ${body.name}. Customer ID: ${customer.id}. The enquiry PDF is attached.`,pdfPath,body.email)}catch(e){console.error('Email delivery failed:',e.message)}
    try{whatsappSent=await sendWhatsAppPdf(process.env.WHATSAPP_TO, pdfPath,`Bhanu Visuals enquiry — ${body.name} — ${bookingId}`)}catch(e){console.error('WhatsApp delivery failed:',e.message)}
    res.json({ok:true,id:item.id,bookingId,customerId:customer.id,emailSent,whatsappSent,pdf:`/api/admin/documents/enquiry/${bookingId}`})
  }catch(e){console.error(e);res.status(500).json({error:'Could not submit enquiry or generate the PDF'})}
})

app.get('/api/admin/enquiries',auth,async(req,res)=>res.json(await read(files.enquiries)))
app.put('/api/admin/enquiries/:id',auth,async(req,res)=>{const items=await read(files.enquiries),i=items.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'Enquiry not found'});items[i]={...items[i],...req.body};await write(files.enquiries,items);res.json(items[i])})
app.get('/api/admin/customers',auth,async(req,res)=>res.json(await read(files.customers)))
app.get('/api/admin/customers/:id',auth,async(req,res)=>{const [customers,shoots,invoices,payments,enquiries]=await Promise.all([read(files.customers),read(files.shoots),read(files.invoices),read(files.payments),read(files.enquiries)]);const customer=customers.find(c=>c.id===req.params.id);if(!customer)return res.status(404).json({error:'Customer not found'});res.json({customer,shoots:shoots.filter(s=>s.customerId===customer.id),invoices:invoices.filter(i=>i.customerId===customer.id),payments:payments.filter(p=>p.customerId===customer.id),enquiries:enquiries.filter(e=>e.customerId===customer.id)})})
app.put('/api/admin/customers/:id',auth,async(req,res)=>{const items=await read(files.customers),i=items.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'Customer not found'});items[i]={...items[i],...req.body};await write(files.customers,items);res.json(items[i])})

app.get('/api/admin/shoots',auth,async(req,res)=>res.json(await read(files.shoots)))
app.post('/api/admin/shoots',auth,async(req,res)=>{const items=await read(files.shoots);const s={id:`SH-${Date.now()}`,...req.body};items.unshift(s);await write(files.shoots,items);res.json(s)})
app.put('/api/admin/shoots/:id',auth,async(req,res)=>{const items=await read(files.shoots),i=items.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'Shoot not found'});items[i]={...items[i],...req.body};await write(files.shoots,items);res.json(items[i])})

app.get('/api/admin/invoices',auth,async(req,res)=>res.json(await read(files.invoices)))
app.post('/api/admin/invoices',auth,async(req,res)=>{
  const [invoices,customers]=await Promise.all([read(files.invoices),read(files.customers)]); const c=customers.find(x=>x.id===req.body.customerId); if(!c)return res.status(404).json({error:'Customer not found'})
  const inv={id:`INV-${Date.now()}`,invoiceNo:`BV-INV-${new Date().getFullYear()}-${String(invoices.length+1).padStart(4,'0')}`,createdAt:new Date().toISOString(),customerId:c.id,bookingId:req.body.bookingId||'',type:req.body.type||'Advance',items:Array.isArray(req.body.items)?req.body.items:[],total:Number(req.body.total||0),amountDue:Number(req.body.amountDue||req.body.total||0),paid:Number(req.body.paid||0),balance:Number(req.body.balance??((req.body.amountDue||req.body.total||0)-(req.body.paid||0))),status:req.body.status||'Pending',notes:req.body.notes||''}
  invoices.unshift(inv);await write(files.invoices,invoices);res.json(inv)
})
app.put('/api/admin/invoices/:id',auth,async(req,res)=>{const items=await read(files.invoices),i=items.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'Invoice not found'});items[i]={...items[i],...req.body};await write(files.invoices,items);res.json(items[i])})

async function buildInvoicePdf(inv,file){
  const [customers,shoots,settings]=await Promise.all([
    read(files.customers),
    read(files.shoots),
    read(files.settings)
  ])

  const c=customers.find(x=>x.id===inv.customerId)||{}
  const shoot=shoots.find(x=>x.bookingId===inv.bookingId)||{}

  const doc=new PDFDocument({size:'A4',margin:0})
  const stream=doc.pipe(fsSync.createWriteStream(file))

  const W=595
  const gold='#D7AE4B'
  const dark='#0E0D12'
  const cream='#F8F6F0'
  const grey='#77736B'
  const line='#DED9CF'

  const money=v=>'INR '+Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})

  doc.rect(0,0,W,132).fill(dark)

  doc.roundedRect(52,30,80,72,16).fill(gold)
  doc.fontSize(24).fillColor(dark).text('BV',52,52,{width:80,align:'center'})

  doc.fontSize(13).fillColor('#FFFFFF').text(settings.businessName||'BHANU VISUALS',152,38)
  doc.fontSize(8).fillColor('#BEB9B0').text('CREATIVE STUDIO • BILLING',152,61)
  doc.fontSize(8).fillColor('#BEB9B0').text(settings.email||'bhanuvisuals17@gmail.com',152,82)

  doc.fontSize(28).fillColor(gold).text('INVOICE',385,34,{width:158,align:'right'})
  doc.fontSize(9).fillColor('#FFFFFF').text(inv.invoiceNo||'BV-2026-0001',385,74,{width:158,align:'right'})
  doc.fontSize(8).fillColor('#BEB9B0').text('ISSUED  '+(inv.issueDate||inv.createdAt||new Date().toISOString()).toString().slice(0,10),385,91,{width:158,align:'right'})
  doc.fontSize(8).fillColor('#BEB9B0').text('DUE ON RECEIPT',385,108,{width:158,align:'right'})

  doc.rect(0,132,W,5).fill(gold)
  doc.rect(0,137,W,3).fill('#26232B')
  doc.rect(0,140,W,455).fill(cream)

  doc.roundedRect(52,169,491,96,15).fill('#FFFFFF').strokeColor(line).stroke()

  doc.fontSize(7).fillColor(gold).text('BILL TO',72,190)
  doc.fontSize(15).fillColor('#25231F').text(c.name||'Customer',72,211)

  doc.moveTo(322,190).lineTo(322,245).strokeColor(gold).lineWidth(1.2).stroke()
  doc.fontSize(7).fillColor(gold).text('CONTACT',347,190)
  doc.fontSize(9).fillColor(grey).text('WhatsApp  '+(c.phone||''),347,212)

  doc.roundedRect(52,291,491,38,10).fill(dark)
  doc.fontSize(7).fillColor(gold).text('#',70,305)
  doc.fontSize(7).fillColor(gold).text('DESCRIPTION',96,305)
  doc.fontSize(7).fillColor(gold).text('QTY',335,305)
  doc.fontSize(7).fillColor(gold).text('RATE',405,305)
  doc.fontSize(7).fillColor(gold).text('AMOUNT',474,305)

  let y=349
  const items=inv.items||[]
  items.forEach((it,i)=>{
    doc.fontSize(8).fillColor(grey).text(String(i+1).padStart(2,'0'),70,y)
    doc.fontSize(9).fillColor('#292722').text(it.name||'Service',96,y)
    doc.fontSize(9).fillColor('#292722').text(String(it.qty||1),335,y)
    doc.fontSize(9).fillColor(grey).text(money(it.rate||it.amount||0),392,y)
    doc.fontSize(9).fillColor('#292722').text(money(it.amount||0),470,y,{width:60,align:'right'})
    doc.moveTo(52,y+24).lineTo(543,y+24).strokeColor(line).lineWidth(.6).stroke()
    y+=36
  })

  const subtotal=Number(inv.subtotal??inv.total??0)
  const discount=Number(inv.discount||0)
  const gst=Number(inv.gst||0)
  const total=Number(inv.total||0)
  const paid=Number(inv.paid||0)
  const balance=Number(inv.balance??Math.max(total-paid,0))

  let ty=Math.max(y+5,385)
  doc.fontSize(8).fillColor(grey).text('SUBTOTAL',395,ty)
  doc.fontSize(8).fillColor('#292722').text(money(subtotal),470,ty,{width:60,align:'right'})
  ty+=20
  doc.text('DISCOUNT',395,ty)
  doc.text('- '+money(discount),470,ty,{width:60,align:'right'})
  ty+=20
  doc.text('GST 0%',395,ty)
  doc.text(money(gst),470,ty,{width:60,align:'right'})
  ty+=25

  doc.moveTo(390,ty).lineTo(543,ty).strokeColor(gold).lineWidth(1.2).stroke()
  doc.roundedRect(340,ty+4,203,49,14).fill(gold)
  doc.fontSize(10).fillColor(dark).text('TOTAL',360,ty+21)
  doc.fontSize(11).fillColor(dark).text(money(total),448,ty+20,{width:78,align:'right'})

  ty+=73
  doc.fontSize(8).fillColor(grey).text('PAID',395,ty)
  doc.fillColor('#292722').text(money(paid),470,ty,{width:60,align:'right'})
  ty+=20
  doc.fontSize(8).fillColor(gold).text('BALANCE DUE',395,ty)
  doc.fillColor('#292722').text(money(balance),470,ty,{width:60,align:'right'})

  const panelY=570
  doc.roundedRect(52,panelY,491,132,14).fill(dark)
  doc.roundedRect(52,panelY,13,132,7).fill(gold)

  doc.fontSize(8).fillColor(gold).text('PAYMENT DETAILS',82,panelY+28)
  doc.fontSize(8).fillColor('#FFFFFF').text('UPI ID',82,panelY+52)
  doc.fontSize(8).fillColor('#BEB9B0').text(settings.upiId||'9346169352@axl',180,panelY+52)
  doc.fontSize(8).fillColor('#FFFFFF').text('BANK',82,panelY+71)
  doc.fontSize(8).fillColor('#BEB9B0').text(settings.bank||'kotak mahindra',180,panelY+71)
  doc.fontSize(8).fillColor('#FFFFFF').text('ACCOUNT',82,panelY+90)
  doc.fontSize(8).fillColor('#BEB9B0').text(settings.account||'4948396942',180,panelY+90)
  doc.fontSize(8).fillColor('#FFFFFF').text('IFSC',82,panelY+109)
  doc.fontSize(8).fillColor('#BEB9B0').text(settings.ifsc||'KKBK0008386',180,panelY+109)

  const qrAmount=balance>0?balance:total
  const qrUpi=settings.upiId||'9346169352@axl'
  const qrName=settings.upiName||settings.businessName||'Bhanu Visuals'
  const uri='upi://pay?pa='+encodeURIComponent(qrUpi)+'&pn='+encodeURIComponent(qrName)+'&am='+qrAmount.toFixed(2)+'&cu=INR'

  try{
    const qr=await QRCode.toBuffer(uri,{width:180,margin:1,errorCorrectionLevel:'M'})
    doc.roundedRect(429,panelY+15,96,96,10).fill('#FFFFFF')
    doc.image(qr,{x:438,y:panelY+24,width:78,height:78})
    doc.fontSize(7).fillColor(gold).text('SCAN TO PAY',438,panelY+111,{width:78,align:'center'})
  }catch{}

  doc.rect(52,744,491,1).fill(line)
  doc.fontSize(7).fillColor(grey).text('Payment due within 15 days.',52,765)
  doc.text('Thank you for your business.',438,765,{width:105,align:'right'})
  doc.fontSize(7).fillColor(gold).text('BHANU VISUALS • SHOOT • EDIT • ELEVATE',52,797,{width:491,align:'center'})

  doc.end()
  return new Promise((resolve,reject)=>{
    stream.on('finish',resolve)
    stream.on('error',reject)
  })
}
app.get('/api/admin/documents/enquiry/:bookingId',auth,async(req,res)=>{const f=path.join(PDF_DIR,`Bhanu-Visuals-Enquiry-${req.params.bookingId}.pdf`);try{await fs.access(f);res.download(f)}catch{res.status(404).json({error:'Document not found'})}})
app.get('/api/admin/documents/invoice/:invoiceId',auth,async(req,res)=>{const invoices=await read(files.invoices),inv=invoices.find(i=>i.id===req.params.invoiceId);if(!inv)return res.status(404).json({error:'Invoice not found'});const f=path.join(PDF_DIR,`Bhanu-Visuals-${inv.invoiceNo}.pdf`);try{await fs.access(f)}catch{await buildInvoicePdf(inv,f)}res.download(f)})

app.post('/api/admin/invoices/:id/send-email',auth,async(req,res)=>{try{const [invoices,customers]=await Promise.all([read(files.invoices),read(files.customers)]),inv=invoices.find(i=>i.id===req.params.id),c=customers.find(x=>x.id===inv?.customerId);if(!inv||!c)return res.status(404).json({error:'Invoice/customer not found'});const f=path.join(PDF_DIR,`Bhanu-Visuals-${inv.invoiceNo}.pdf`);try{await fs.access(f)}catch{await buildInvoicePdf(inv,f)}const sent=await sendEmail(c.email,`Bhanu Visuals invoice — ${inv.invoiceNo}`,`Dear ${c.name}, your Bhanu Visuals invoice is attached. Booking ID: ${inv.bookingId}.`,f,process.env.SMTP_USER);res.json({ok:true,sent:true})}catch(e){res.status(500).json({error:e.message})}})
app.post('/api/admin/invoices/:id/send-whatsapp',auth,async(req,res)=>{try{const [invoices,customers]=await Promise.all([read(files.invoices),read(files.customers)]),inv=invoices.find(i=>i.id===req.params.id),c=customers.find(x=>x.id===inv?.customerId);if(!inv||!c)return res.status(404).json({error:'Invoice/customer not found'});const f=path.join(PDF_DIR,`Bhanu-Visuals-${inv.invoiceNo}.pdf`);try{await fs.access(f)}catch{await buildInvoicePdf(inv,f)}const sent=await sendWhatsAppPdf(safePhone(c.phone),f,`Bhanu Visuals invoice ${inv.invoiceNo} — Booking ${inv.bookingId}`);res.json({ok:true,sent})}catch(e){res.status(500).json({error:e.message})}})

app.get('/api/admin/settings',auth,async(req,res)=>res.json(await read(files.settings)))
app.put('/api/admin/settings',auth,async(req,res)=>{const s={...(await read(files.settings)),...req.body};await write(files.settings,s);res.json(s)})

app.post('/api/admin/payments',auth,async(req,res)=>{const payments=await read(files.payments),invoices=await read(files.invoices);const p={id:`PAY-${Date.now()}`,createdAt:new Date().toISOString(),...req.body};payments.unshift(p);const i=invoices.findIndex(x=>x.id===p.invoiceId);if(i>=0){invoices[i].paid=Number(invoices[i].paid||0)+Number(p.amount||0);invoices[i].balance=Math.max(0,Number(invoices[i].amountDue||invoices[i].total||0)-invoices[i].paid);invoices[i].status=invoices[i].balance<=0?'Paid':'Partially Paid';await write(files.invoices,invoices)}await write(files.payments,payments);res.json(p)})

app.post('/api/admin/projects',auth,async(req,res)=>{const items=await read(files.projects);const p={id:Date.now().toString(),...req.body};items.unshift(p);await write(files.projects,items);res.json(p)})
app.put('/api/admin/projects/:id',auth,async(req,res)=>{const items=await read(files.projects),i=items.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'Project not found'});items[i]={...items[i],...req.body};await write(files.projects,items);res.json(items[i])})
app.delete('/api/admin/projects/:id',auth,async(req,res)=>{const items=await read(files.projects),next=items.filter(x=>x.id!==req.params.id);if(next.length===items.length)return res.status(404).json({error:'Project not found'});await write(files.projects,next);res.json({ok:true})})



export default app

if (!process.env.VERCEL) {
  app.listen(port,()=>console.log(`Bhanu Visuals API running on http://localhost:${port}`))
}

