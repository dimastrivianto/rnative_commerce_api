const express = require('express')
const cors = require('cors')
const app = express()
const port = 2020
const conn = require('./config/db')
const isEmail = require('validator/lib/isEmail')
const bcrypt = require('bcrypt')
const jwt= require('./config/token')
const path = require('path')
const auth = require('./config/auth')
const multer = require('multer')
const sharp = require('sharp')
const shortid = require('shortid')

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
   res.status(200).send('<h1>API IS RUNNING AT 2020</h1>')
})

// REGISTER
app.post('/user', (req, res) => {
   const sql = `INSERT INTO users SET ?`
   const data = req.body

   //cek email
   if(!isEmail(data.email)) return res.status(400).send({message: 'email is not valid'})

   // encrypt password
   data.password = bcrypt.hashSync(data.password, 8)

   conn.query(sql, data, (err, result) => {
      if(err) return res.status(500).send({err})

      res.status(200).send({message: "Register berhasil"})
   })

})

// LOGIN
app.post('/user/login', (req, res) => {
   const {username, password} = req.body
   const sql = `SELECT * FROM users WHERE username = '${username}'`
   const sql2 = `INSERT INTO tokens SET ? `

   conn.query(sql, async (err, result) => {
       // Error saat running query
      if(err) return res.status(500).send(err) 
      // res dari select adalah array
      //  user = {id, username, name, email, password, avatar}
      const user = result[0] 
      // User tidak ditemukan
      if(!user) return res.status(404).send({message: "User not found"})
      // Compare password dari input user dengan yang ada pada database
      const hash = await bcrypt.compare(password, user.password)
      // Jika proses compare tidak valid
      if(!hash) return res.status(400).send({message: "Wrong password"})
      // Create token
      const token = jwt.sign({ id: user.id })
      // Save token
      const data = { user_id: user.id, token }
      conn.query(sql2, data , (err, result) => {
           // Error saat running query
         if(err) return res.status(500).send(err)
         
           // Kirim user
         res.status(200).send({username: user.username, token})
      })
      
   })

})

// GET PROFILE
app.get('/user', auth, (req, res) => {

   // req.user = {id, username, name, email, avatar}
   res.status(200).send({
      user: req.user,
      // tambahin waktu
      avatarlink: `http://localhost:2020/user/avatar/${req.user.avatar}`
   })

})

// AVATAR
const avatarDirectory = path.join(__dirname, 'assets/avatar')
// console.log(avatarDirectory)

const upload = multer({
   // storage: storage,
   limits: {
       fileSize: 10000000 // Byte , default 1MB
   },
   fileFilter(req, file, cb) {
      if(!file.originalname.match(/\.(jpg|jpeg|png)$/)){ // will be error if the extension name is not one of these
         return cb(new Error('Please upload image file (jpg, jpeg, or png)')) 
      }

      cb(undefined, true)
   }
})

// POST AVATAR
app.post('/user/avatar', auth, upload.single('avatar'), async (req,res) => {

   try {
      const sql = `UPDATE users SET avatar = ? WHERE username = ?`
      const fileName = `${req.user.username}-avatar.png`
      const data = [fileName, req.user.username]
      const final = await sharp(req.file.buffer).resize(200).png().toFile(`${avatarDirectory}/${fileName}`)

      conn.query(sql, data, (err, result) => {
         if (err) return res.status(500).send(err)

         res.status(200).send({message: fileName})

      })
   } catch (error) {
      res.status(500).send(error.message)
   }

}, (err, req, res, next) => { // it should declare 4 parameters, so express know this is function for handling any uncaught error
   res.status(400).send(err.message)
})

// READ AVATAR
app.get('/user/avatar/:fileName', (req, res) => {
   var options = { 
      root: avatarDirectory // Direktori foto disimpan
   };      

   var fileName = req.params.fileName;

   res.status(200).sendFile(fileName, options, function (err) {
      if (err) {
         return res.status(404).send({message: "Image not found"})
      } 

      // console.log('Sent:', fileName);
   });
})

// UPDATE PROFILE
app.patch('/user/profile', auth, (req, res) => {
   const sql = `UPDATE users SET ? WHERE id = ?;`
   // data[0] = {name, email, password}
   // data[1] = 12
   const data = [req.body, req.user.id]

      // cek email
   if(!isEmail(data[0].email)) return res.status(400).send({message: "Email is not valid"})

   // Jika user mengirim password baru / Edit password
   if(data[0].password){
      data[0].password = bcrypt.hashSync(data[0].password, 8)
   } else {
      delete data[0].password
   }

   conn.query(sql, data, (err, result) => {
      if(err) return res.status(500).send(err)

      res.status(201).send({message: 'Update berhasil'})
   })

})

// products
// MULTER
const productsDirectory = path.join(__dirname, 'assets/avatar')
// console.log(avatarDirectory)

const product = multer({
   // storage: storage,
   limits: {
       fileSize: 10000000 // Byte , default 1MB
   },
   fileFilter(req, file, cb) {
      if(!file.originalname.match(/\.(jpg|jpeg|png)$/)){ // will be error if the extension name is not one of these
         return cb(new Error('Please upload image file (jpg, jpeg, or png)')) 
      }

      cb(undefined, true)
   }
})

app.post('/product', auth, product.single("picture"), (req, res) => {
   try {
      // {name ,description, stock, price} = req.body
      // {picture} =req.file
      const sqlInsert = `INSERT INTO Products SET ?`
      const dataInsert = {...req.body, user_id : req.user.id}
      
      conn.query(sqlInsert, dataInsert, async (err, result) => {
         if(err) return res.status(500).send(err)

         const fileName = `${shortid.generate()}.png`
         await sharp(req.file.buffer).resize(300).png().toFile(`${productsDirectory}/${fileName}`)
         const sqlUpdate = `UPDATE products SET picture = ? WHERE id = ?`
         const dataUpdate = [fileName, result.insertId]

         // simpan nama gambar
         conn.query(sqlUpdate, dataUpdate, (err, result) =>{
            if(err) return res.status(500).send(err)

            res.status(200).send({message: "Insert daat berhasil"})
         })
      })
   
      
   } catch (error) {
      
   }

})

// READ ALL PRODUCTS
app.get('/products', auth, (req, res) => {
   const sqlSelect =
   `SELECT
      u.id 'usrId', u.name 'usrName', u.avatar 'usrAvatar',
      p.id, p.name, p.picture, p.description, p.stock, p.price
   FROM users u
   JOIN products p ON u.id = p.user_id WHERE u.id != ${req.user.id}`

   conn.query(sqlSelect, (err, result) => {
      if(err) return res.status(500).send(err)

      res.status(200).send(result)
   })
})

// GET OWN PRODUCTS
app.get('/products/me', auth, (req, res) => {
   const sqlSelect = `SELECT * FROM products WHERE user_id = ${req.user.id}`

   conn.query(sqlSelect, (err, result) => {
      if(err) return res.status(500).send(err)

      res.status(200).send(result)
   })

})

// READ PRODUCT IMAGE
app.get('/product/picture/:fileName', (req, res) => {
   var options = { 
       root: productsDirectory // Direktori foto disimpan
   };      

   var fileName = req.params.fileName;

   res.status(200).sendFile(fileName, options, function (err) {
      if (err) {
         return res.status(404).send({message: "Image not found"})
      } 

      console.log('Sent:', fileName);
   });
})

// READ DETAIL PRODUCT
app.get('/product/:id', auth, (req, res) => {
   const sqlSelect = `SELECT * FROM products WHERE id = ${req.params.id}`

   conn.query(sqlSelect, (err, result) => {
      if(err) return res.status(500).send(err)

      res.status(200).send(result[0])
   })
})

// READ CARTS
app.get('/carts', auth, (req, res) => {
   const sqlSelect = `SELECT * FROM carts WHERE user_id = ${req.user.id}`

   conn.query(sqlSelect, (err, result) => {
      if(err) return res.status(500).send(err)

      res.status(200).send(result)
   })
})
// POST TO CART
app.post('/cart', auth, (req, res) => {
   const sqlInsert = `INSERT INTO carts SET ?`

   const dataInsert = {user_id: req.user.id, ...req.body}

   conn.query(sqlInsert, dataInsert, (err, result) => {
      if(err) return res.status(500).send(err)

      res.status(201).send({message : "Insert Cart berhasil"})
   })
})

// TRANSACTIONS

app.post('/transaction', auth, (req, res) => {

   // {total_amount}
   // Add to transactions
   const sqlInsertTrx = `INSERT INTO transactions SET ?`
   // req.body.transaction = total_amount
   const dataInsertTrx = {
      user_id : req.user.id,
      total_amount: req.body.total_amount
   }

   conn.query(sqlInsertTrx, dataInsertTrx, (err, result) => {
      if(err) return res.status(500).send(err)

      
      // console.log(result.insertId)
      // Add to detail_transactions
      const sqlInsertTrxDetail = `
         INSERT INTO 
            detail_transaction(trx_id, seller_id, product_id, name, qty, price, total_amount)
         VALUES ?
      `

      // khusus untuk multiple data, maka masukkan ke dalam array
      
      for(let data of req.body.carts) {data.shift();
         data.shift(); data.unshift(result.insertId)}
      const dataInsertTrxDetail = req.body.carts
      // console.log(req.body.carts)

      // kalau passing nilai array maka pakai []
      conn.query(sqlInsertTrxDetail, [dataInsertTrxDetail], (err, result) => {
         if(err) return res.status(500).send(err)

         res.status(201).send("Insert Trx Berhasil")
      })
   })
})

app.listen(port, () => console.log('API is Running'))