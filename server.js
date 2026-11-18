require("dotenv").config();
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const crypto = require("crypto");
const db = require("./src/db");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const publicUploads = path.join(__dirname, "public", "uploads");
const privateUploads = path.join(__dirname, "private_uploads");
fs.mkdirSync(publicUploads, { recursive: true });
fs.mkdirSync(privateUploads, { recursive: true });

if (isProduction) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 40) throw new Error("Production requires SESSION_SECRET with at least 40 characters.");
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD_HASH) throw new Error("Production requires ADMIN_EMAIL and bcrypt ADMIN_PASSWORD_HASH.");
  if (!process.env.WHATSAPP_NUMBER || !process.env.STORE_ADDRESS) console.warn("Set WHATSAPP_NUMBER and STORE_ADDRESS before launch.");
}
app.disable("x-powered-by");
if (isProduction) app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: false, // Inline legacy page styles/scripts; enable a strict CSP after migrating them to external files.
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: true, limit: "32kb" }));

// Lightweight per-process rate limiter. Use an edge/WAF limiter as well in production.
const rateBuckets = new Map();
function rateLimit({ windowMs = 60000, max = 30 } = {}) {
 return (req,res,next) => {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || bucket.reset < now) bucket = { count: 0, reset: now + windowMs };
  bucket.count++;
  rateBuckets.set(key,bucket);
  if (bucket.count > max) return res.status(429).json({ error: "Too many requests. Please wait and try again." });
  next();
 };
}
setInterval(() => { const now=Date.now(); for (const [k,v] of rateBuckets) if(v.reset<now) rateBuckets.delete(k); }, 60000).unref();

// Reject cross-site browser writes. SameSite cookies provide an additional layer.
app.use("/api", (req,res,next) => {
 if (!["POST","PUT","PATCH","DELETE"].includes(req.method)) return next();
 const origin = req.get("origin");
 if (origin) {
  try { if (new URL(origin).host !== req.get("host")) return res.status(403).json({error:"Cross-origin request blocked."}); }
  catch { return res.status(403).json({error:"Invalid request origin."}); }
 }
 next();
});

// Durable SQLite session store; avoids express-session's in-memory store being lost on restart.
class SQLiteSessionStore extends session.Store {
 get(sid, cb) {
  try {
   const row=db.prepare("SELECT sess,expired FROM sessions WHERE sid=?").get(sid);
   if(!row || row.expired < Date.now()) { if(row) this.destroy(sid,()=>{}); return cb(null,null); }
   cb(null,JSON.parse(row.sess));
  } catch(e){cb(e);}
 }
 set(sid,sess,cb=()=>{}) {
  try {
   const expires=sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now()+8*60*60*1000;
   db.prepare("INSERT INTO sessions(sid,sess,expired) VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess,expired=excluded.expired")
    .run(sid,JSON.stringify(sess),expires);
   db.prepare("DELETE FROM sessions WHERE expired < ?").run(Date.now());
   cb();
  } catch(e){cb(e);}
 }
 destroy(sid,cb=()=>{}) { try{db.prepare("DELETE FROM sessions WHERE sid=?").run(sid);cb();}catch(e){cb(e);} }
 touch(sid,sess,cb=()=>{}) { this.set(sid,sess,cb); }
}
app.use(session({
 name: "optoline.sid",
 secret: process.env.SESSION_SECRET || "local-development-secret-change-before-launch-2026",
 store: new SQLiteSessionStore(),
 resave: false, saveUninitialized: false, rolling: true,
 cookie: { httpOnly: true, sameSite: "lax", secure: isProduction, maxAge: 8*60*60*1000 }
}));

const imageStorage = multer.diskStorage({
 destination: (_req,_file,cb)=>cb(null,publicUploads),
 filename: (_req,file,cb)=>cb(null,`${Date.now()}-${crypto.randomBytes(8).toString("hex")}${path.extname(file.originalname).toLowerCase()}`)
});
const imageUpload = multer({
 storage:imageStorage,limits:{fileSize:5*1024*1024,files:1},
 fileFilter:(_req,file,cb)=>cb(null,["image/jpeg","image/png","image/webp"].includes(file.mimetype))
});
const prescriptionUpload = multer({
 dest:privateUploads,limits:{fileSize:5*1024*1024,files:1},
 fileFilter:(_req,file,cb)=>cb(null,["image/jpeg","image/png","image/webp","application/pdf"].includes(file.mimetype))
});
app.use(express.static(path.join(__dirname,"public"),{etag:true,maxAge:isProduction?"1h":0}));

function requireAdmin(req,res,next){if(req.session?.admin===true)return next();return res.status(401).json({error:"Please sign in to the admin dashboard."});}
function validVisitorId(id){return typeof id==="string" && /^[a-zA-Z0-9_-]{8,80}$/.test(id);}
function cleanText(value,max=500){return String(value??"").trim().slice(0,max);}
function safeProduct(row){return row?{...row,featured:!!row.featured,in_stock:!!row.in_stock}:row;}
function adminPasswordMatches(password) {
 const hash=process.env.ADMIN_PASSWORD_HASH;
 if(hash) return bcrypt.compareSync(password,hash);
 if(isProduction) return false;
 return password === (process.env.ADMIN_PASSWORD || "ChangeMe123!");
}
app.get("/health",(_req,res)=>res.json({status:"ok",service:"optoline",time:new Date().toISOString()}));
app.get("/api/config",(_req,res)=>res.json({
 whatsapp:process.env.WHATSAPP_NUMBER||"",storeAddress:process.env.STORE_ADDRESS||"",
 storePhone:process.env.STORE_PHONE||"",storeHours:process.env.STORE_HOURS||"",
 storeName:process.env.STORE_NAME||"OPTOLINE",currency:"PKR"
}));

app.get("/api/products",(req,res)=>{
 const category=cleanText(req.query.category,60),q=cleanText(req.query.q,100);
 let sql="SELECT * FROM products WHERE in_stock=1 AND stock_quantity>0";const args=[];
 if(category&&category!=="All"){sql+=" AND category=?";args.push(category);}
 if(q){sql+=" AND (name LIKE ? OR description LIKE ? OR sku LIKE ?)";args.push(`%${q}%`,`%${q}%`,`%${q}%`);}
 if(req.query.featured==="1")sql+=" AND featured=1";
 sql+=" ORDER BY featured DESC,id DESC";
 res.json(db.prepare(sql).all(...args).map(safeProduct));
});
app.get("/api/products/:id",(req,res)=>{
 const p=db.prepare("SELECT * FROM products WHERE id=?").get(Number(req.params.id));
 if(!p||!p.in_stock||p.stock_quantity<1)return res.status(404).json({error:"Product not available."});
 res.json(safeProduct(p));
});

app.post("/api/orders",rateLimit({windowMs:60000,max:8}),prescriptionUpload.single("prescription"),(req,res)=>{
 const name=cleanText(req.body.customer_name,120),email=cleanText(req.body.email,160),phone=cleanText(req.body.phone,40);
 const address=cleanText(req.body.address,500),city=cleanText(req.body.city,100),payment=cleanText(req.body.payment_method,80);
 if(payment && !["Cash on delivery","Bank transfer (manual confirmation)"].includes(payment))return res.status(400).json({error:"That payment method is not active yet. JazzCash and Easypaisa will be enabled only after merchant setup and verified gateway integration."});
 if(!name||!phone||!address||!req.body.items)return res.status(400).json({error:"Name, phone, delivery address and cart are required."});
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:"Please enter a valid email address."});
 let cart;try{cart=JSON.parse(req.body.items);}catch{return res.status(400).json({error:"Cart data is invalid."});}
 if(!Array.isArray(cart)||!cart.length||cart.length>30)return res.status(400).json({error:"Your cart is empty or invalid."});
 try {
  const result=db.transaction(()=>{
   let total=0;const verified=[];
   for(const item of cart){
    const id=Number(item.id),qty=Math.max(1,Math.min(20,Math.floor(Number(item.quantity)||1)));
    const product=db.prepare("SELECT * FROM products WHERE id=? AND in_stock=1").get(id);
    if(!product||product.stock_quantity<qty)throw new Error(`${product?.name||"A product"} does not have enough stock.`);
    total+=Number(product.price)*qty;
    verified.push({id:product.id,sku:product.sku,name:product.name,price:product.price,quantity:qty});
   }
   for(const item of verified)db.prepare("UPDATE products SET stock_quantity=stock_quantity-?,in_stock=CASE WHEN stock_quantity-?<=0 THEN 0 ELSE 1 END,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(item.quantity,item.quantity,item.id);
   const order=db.prepare(`INSERT INTO orders(customer_name,email,phone,address,city,payment_method,items,total,status,prescription_file)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(name,email,phone,address,city,payment||"Cash on delivery",JSON.stringify(verified),total,"Pending",req.file?req.file.filename:"");
   return {orderId:order.lastInsertRowid,total};
  })();
  res.status(201).json({message:"Order received.",...result});
 }catch(e){if(req.file)fs.unlink(req.file.path,()=>{});return res.status(400).json({error:e.message||"Could not place order."});}
});

app.get("/api/chat/:visitorId",rateLimit({windowMs:60000,max:60}),(req,res)=>{
 if(!validVisitorId(req.params.visitorId))return res.status(400).json({error:"Invalid chat session."});
 const messages=db.prepare("SELECT id,sender,message,created_at FROM chat_messages WHERE visitor_id=? ORDER BY id ASC LIMIT 200").all(req.params.visitorId);
 if(req.session.admin)db.prepare("UPDATE chat_messages SET is_read=1 WHERE visitor_id=? AND sender='visitor'").run(req.params.visitorId);
 res.json(messages);
});
app.post("/api/chat/:visitorId",rateLimit({windowMs:60000,max:12}),(req,res)=>{
 if(!validVisitorId(req.params.visitorId))return res.status(400).json({error:"Invalid chat session."});
 const message=cleanText(req.body.message,1500);if(!message)return res.status(400).json({error:"Write a message first."});
 const sender=req.body.sender==="owner"&&req.session.admin?"owner":"visitor";
 const result=db.prepare("INSERT INTO chat_messages(visitor_id,sender,message,is_read) VALUES(?,?,?,0)").run(req.params.visitorId,sender,message);
 res.status(201).json({id:result.lastInsertRowid,sender,message});
});
app.post("/api/assistant",rateLimit({windowMs:60000,max:20}),async(req,res)=>{
 const question=cleanText(req.body.message,1000);if(!question)return res.status(400).json({error:"Ask a question first."});
 const products=db.prepare("SELECT name,price,category,description FROM products WHERE in_stock=1 AND stock_quantity>0 ORDER BY featured DESC,id DESC LIMIT 30").all();
 const storeContext=`Store: ${process.env.STORE_NAME||"OPTOLINE"}. Address: ${process.env.STORE_ADDRESS||"not provided"}. Hours: ${process.env.STORE_HOURS||"not provided"}. Phone: ${process.env.STORE_PHONE||"not provided"}. Currency: PKR. Available products: ${JSON.stringify(products)}.`;
 if(process.env.OPENAI_API_KEY){
  try {
   const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-4.1-mini",instructions:"You are OPTOLINE's friendly eyewear store assistant. Reply in the language used by the customer (English or Roman Urdu). Use only the supplied store/product context for prices, stock and policies; if unknown, say the owner must confirm. Help with product discovery and general shopping questions. Never diagnose eye conditions, prescribe lens power, recommend medical treatment, or claim a product has UV/polarized features unless the product context says so. For prescriptions or eye-health questions, direct the customer to a qualified optometrist/optical professional. Do not invent orders, payment confirmations, delivery promises, or store facts. Keep replies concise and helpful.",input:`${storeContext}\nCustomer question: ${question}`,max_output_tokens:300})});
   if(!response.ok)throw new Error(`AI provider returned ${response.status}`);
   const data=await response.json();const answer=(data.output||[]).flatMap(item=>item.content||[]).filter(item=>item.type==="output_text").map(item=>item.text).join("\n").trim();
   if(answer)return res.json({answer,mode:"AI assistant"});
  }catch(err){console.error("Optional AI assistant fallback:",err.message);}
 }
 const q=question.toLowerCase();let answer="I can help with OPTOLINE frames, sunglasses, contact lenses, product prices and order enquiries. Tell me what you are shopping for, or switch to Owner Chat to speak with our team.";
 if(/price|cost|budget|under/.test(q)){answer=products.length?"Available items and listed prices: "+products.slice(0,6).map(p=>`${p.name} (Rs. ${Number(p.price).toLocaleString("en-PK")})`).join("; ")+". Please confirm stock and final pricing with our team.":"There are no products currently listed. Please contact the store.";}
 else if(/prescription|power|number|lens/.test(q))answer="For prescription eyewear, provide a current prescription for review by qualified optical staff. Do not use an old or guessed prescription. Contact lenses require a suitable professional fitting.";
 else if(/sunglass|sun glass|uv|polar/.test(q))answer="Browse Sunglasses in our Shop. Please confirm UV protection and polarization from each product's verified specifications before purchase.";
 else if(/delivery|shipping|order|track/.test(q))answer="For delivery or order updates, choose Chat with Owner and share your order number. Our store team can check the order.";
 else if(/address|location|shop|store|timing|open/.test(q))answer=`Store address: ${process.env.STORE_ADDRESS||"Please contact the store for address details."}. Hours: ${process.env.STORE_HOURS||"Please message the owner to confirm current hours."}.`;
 else if(/return|refund|exchange/.test(q))answer="Please review our published Returns & Policies page and contact the owner before sending an item back. Custom prescription products may have specific conditions.";
 res.json({answer,mode:"FAQ fallback"});
});

app.post("/api/admin/login",rateLimit({windowMs:15*60*1000,max:8}),(req,res)=>{
 const email=cleanText(req.body.email,160),password=String(req.body.password||"");
 const adminEmail=process.env.ADMIN_EMAIL||(isProduction?"":"admin@optoline.local");
 if(email!==adminEmail||!adminPasswordMatches(password))return res.status(401).json({error:"Email or password is incorrect."});
 req.session.regenerate(err=>{
  if(err)return res.status(500).json({error:"Could not create a secure admin session."});
  req.session.admin=true;req.session.adminEmail=email;
  req.session.save(saveErr=>saveErr?res.status(500).json({error:"Could not save admin session."}):res.json({ok:true}));
 });
});
app.post("/api/admin/logout",requireAdmin,(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/admin/me",(req,res)=>res.json({admin:!!req.session?.admin,email:req.session?.adminEmail||null}));
app.get("/api/admin/orders",requireAdmin,(_req,res)=>res.json(db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all()));
app.patch("/api/admin/orders/:id",requireAdmin,(req,res)=>{
 const allowed=["Pending","Confirmed","Processing","Shipped","Completed","Cancelled"];
 if(!allowed.includes(req.body.status))return res.status(400).json({error:"Invalid order status."});
 const id=Number(req.params.id),order=db.prepare("SELECT * FROM orders WHERE id=?").get(id);
 if(!order)return res.status(404).json({error:"Order not found."});
 db.transaction(()=>{
  if(order.status!=="Cancelled"&&req.body.status==="Cancelled"){
   for(const item of JSON.parse(order.items))db.prepare("UPDATE products SET stock_quantity=stock_quantity+?,in_stock=1,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(item.quantity,item.id);
  }
  if(order.status==="Cancelled"&&req.body.status!=="Cancelled"){
   for(const item of JSON.parse(order.items)){
    const p=db.prepare("SELECT stock_quantity FROM products WHERE id=?").get(item.id);
    if(!p||p.stock_quantity<item.quantity)throw new Error("Cannot reopen: insufficient stock.");
   }
   for(const item of JSON.parse(order.items))db.prepare("UPDATE products SET stock_quantity=stock_quantity-?,in_stock=CASE WHEN stock_quantity-?<=0 THEN 0 ELSE 1 END WHERE id=?").run(item.quantity,item.quantity,item.id);
  }
  db.prepare("UPDATE orders SET status=? WHERE id=?").run(req.body.status,id);
 })();
 res.json({ok:true});
});
app.get("/api/admin/products",requireAdmin,(_req,res)=>res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all().map(safeProduct)));
app.post("/api/admin/products",requireAdmin,imageUpload.single("imageFile"),(req,res)=>{
 const name=cleanText(req.body.name,120),category=cleanText(req.body.category,60),price=Number(req.body.price),stock=Math.max(0,Math.floor(Number(req.body.stock_quantity??50)));
 const categories=["Eyeglasses","Sunglasses","Contact Lenses","Kids Eyewear"];
 if(!name||!categories.includes(category)||!Number.isFinite(price)||price<=0)return res.status(400).json({error:"Enter a valid name, category and price."});
 const image=req.file?`/uploads/${req.file.filename}`:cleanText(req.body.image,300)||"/images/frame.svg";
 const sku=cleanText(req.body.sku,60)||`OPT-${Date.now().toString(36).toUpperCase()}`;
 const r=db.prepare("INSERT INTO products(sku,name,category,price,image,description,featured,in_stock,stock_quantity) VALUES(?,?,?,?,?,?,?,?,?)")
  .run(sku,name,category,price,image,cleanText(req.body.description,1000),req.body.featured==="on"?1:0,stock>0?1:0,stock);
 res.status(201).json({id:r.lastInsertRowid});
});
app.patch("/api/admin/products/:id",requireAdmin,imageUpload.single("imageFile"),(req,res)=>{
 const id=Number(req.params.id),old=db.prepare("SELECT * FROM products WHERE id=?").get(id);if(!old)return res.status(404).json({error:"Product not found."});
 const name=cleanText(req.body.name,120)||old.name,category=cleanText(req.body.category,60)||old.category,price=Number(req.body.price||old.price);
 const stock=req.body.stock_quantity===""||req.body.stock_quantity==null?old.stock_quantity:Math.max(0,Math.floor(Number(req.body.stock_quantity)));
 if(!["Eyeglasses","Sunglasses","Contact Lenses","Kids Eyewear"].includes(category)||!Number.isFinite(price)||price<=0||!Number.isFinite(stock))return res.status(400).json({error:"Invalid product details."});
 const image=req.file?`/uploads/${req.file.filename}`:cleanText(req.body.image,300)||old.image;
 db.prepare("UPDATE products SET sku=?,name=?,category=?,price=?,description=?,image=?,featured=?,stock_quantity=?,in_stock=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
 .run(cleanText(req.body.sku,60)||old.sku,name,category,price,cleanText(req.body.description,1000),image,req.body.featured==="on"?1:0,stock,stock>0?1:0,id);
 res.json({ok:true});
});
app.delete("/api/admin/products/:id",requireAdmin,(req,res)=>{db.prepare("DELETE FROM products WHERE id=?").run(Number(req.params.id));res.json({ok:true});});
app.get("/api/admin/chat",requireAdmin,(_req,res)=>res.json(db.prepare(`SELECT visitor_id,MAX(id) last_id,MAX(created_at) last_time,
 SUM(CASE WHEN sender='visitor' AND is_read=0 THEN 1 ELSE 0 END) unread,
 (SELECT message FROM chat_messages c2 WHERE c2.visitor_id=c1.visitor_id ORDER BY id DESC LIMIT 1) last_message
 FROM chat_messages c1 GROUP BY visitor_id ORDER BY last_id DESC`).all()));
app.post("/api/admin/chat/:visitorId/reply",requireAdmin,(req,res)=>{
 const message=cleanText(req.body.message,1500);if(!validVisitorId(req.params.visitorId)||!message)return res.status(400).json({error:"A valid conversation and message are required."});
 const r=db.prepare("INSERT INTO chat_messages(visitor_id,sender,message,is_read) VALUES(?,?,?,1)").run(req.params.visitorId,"owner",message);res.status(201).json({id:r.lastInsertRowid});
});
app.get("/api/admin/stats",requireAdmin,(_req,res)=>res.json({
 products:db.prepare("SELECT COUNT(*) n FROM products").get().n,
 orders:db.prepare("SELECT COUNT(*) n FROM orders").get().n,
 revenue:db.prepare("SELECT COALESCE(SUM(total),0) n FROM orders WHERE status!='Cancelled'").get().n,
 unread:db.prepare("SELECT COUNT(*) n FROM chat_messages WHERE sender='visitor' AND is_read=0").get().n
}));

app.use((err,_req,res,_next)=>{
 console.error(err);
 if(err instanceof multer.MulterError)return res.status(400).json({error:err.code==="LIMIT_FILE_SIZE"?"File is too large (maximum 5 MB).":"Upload failed."});
 res.status(400).json({error:err.message||"Something went wrong."});
});
const server=app.listen(PORT,()=>console.log(`OPTOLINE running on port ${PORT}`));
function shutdown(){server.close(()=>{try{db.close();}finally{process.exit(0);}});setTimeout(()=>process.exit(1),10000).unref();}
process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);
