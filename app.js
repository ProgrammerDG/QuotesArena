require('dotenv').config()
const express = require("express");
const session = require("express-session");
const mongoose = require("mongoose");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const passportLocalMongoose = require("passport-local-mongoose");
const nodemailer = require("nodemailer");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(session({
    secret: process.env.SESSIONSECRET,
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

mongoose.connect(process.env.MONGODBURL);

const quoteSchema = new mongoose.Schema({
    quote: String,
    author: String,
    date: String,
    id2: String
});

const Quote = mongoose.model("Quote", quoteSchema);

const userSchema = new mongoose.Schema({
    username: String,
    password: String,
    quotes: [quoteSchema],
    fav:[quoteSchema]
});

userSchema.plugin(passportLocalMongoose);

const User = mongoose.model("User", userSchema);



passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());



app.get("/", (req, res) => {
    if(req.isAuthenticated()){
        Quote.find({}, (err, quotes) => {
            if (!err) {
                res.render("home", { quotes: quotes, warning:" " });
            }
        });
    }else{
        Quote.find({}, (err, quotes) => {
            if (!err) {
                res.render("home", { quotes: quotes, warning:"First Login or Signup to add quote to favourites."});
            }
        });
    }
});

app.get("/signup", (req, res) => {
    res.render("signup");
});

app.get("/login", (req, res) => {
    res.render("login");
});

app.get("/logout", (req, res) => {
    req.logOut((err)=>{
        if(err){
            console.log(err);
        }
        res.redirect("/");
    });
});

app.get("/userpage", (req, res) => {
    if (req.isAuthenticated()) {
        console.log(req.user.username);
        User.findOne({ username: req.user.username }, (err, data) => {
            if (err) {
                console.log(err);
            } else {
                if(req.user.username==process.env.ADMINEMAIL){
                    let usersArray = [];

                    User.find({},(err,foundUsers)=>{
                        for(let user of foundUsers){
                            if(user.username==process.env.ADMINEMAIL){
                                continue;
                            }else{
                                usersArray.push(user);
                            }
                        }
                        res.render("admin", {username:"Admin", quotes:data.quotes, favquotes:data.fav, users:usersArray}); 
                    });                   
                }else{
                    res.render("userpage", { username:data.username, quotes: data.quotes, favquotes:data.fav});
                }                
            }
        })
    } else {
        res.redirect("/login");
    }

});

app.post("/addquote", (req, res) => {
    console.log(req.user.username);

    var options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };

    let nq = { quote: req.body.newquote, author: req.body.newauthor, date: new Date().toLocaleDateString("en-US", options) };

    User.findOne({ username: req.user.username }, function (err, foundUser) {
        foundUser.quotes.push(nq);
        foundUser.save();

        let id2 = foundUser.quotes.slice(-1).pop()._id;

        let nq2 = { quote: req.body.newquote, author: req.body.newauthor, date: new Date().toLocaleDateString("en-US", options), id2 };

        let q = new Quote(nq2);
        q.save();
    });

    res.redirect("/userpage");

});

app.post("/addfav",(req,res)=>{
    console.log(req.user.username);
    if (req.isAuthenticated()){
    const favQuoteId = req.body.favQuoteId;

    Quote.findById(favQuoteId,(err,data)=>{
        if(err){
            console.log(err);
        }else{
            User.findOne({username:req.user.username},function(err,foundUser){
                let flag = true;
        
                for(let i=0;i<foundUser.fav.length;i++){
                    if(foundUser.fav[i]._id == favQuoteId){
                        flag = false;
                        res.redirect("/");
                        break;
                    }
                }
        
                if(flag){
                    foundUser.fav.push(data);
                    foundUser.save();
                    res.redirect("/");
                }
            });
        }
    });

    }else{
        res.redirect("/");
    }
   
});

app.post("/deletequote",(req,res)=>{
    console.log(req.user.username);
    const checkedQuoteId = req.body.checkbox;

    User.findOneAndUpdate({username:req.user.username},{$pull:{quotes:{_id:checkedQuoteId}}},(err,data)=>{
        if(err){
            console.log(err);
        }

        Quote.findOneAndRemove({id2:checkedQuoteId},function(err){
            if(err){
                console.log(err);
            }
        });
    });

    res.redirect("/userpage");
});

app.post("/deletefavquote",(req,res)=>{
    console.log(req.user.username);
    const favQuoteId = req.body.checkbox;

    User.findOneAndUpdate({username:req.user.username},{$pull:{fav:{_id:favQuoteId}}},(err,data)=>{
        if(err){
            console.log(err);
        }    
    })

    res.redirect("/userpage");
});

let globalUsername = "";
let globalPassword = "";
let globalOtpSent = "";


app.post("/signup", (req, res) => {
    let username = req.body.username;
    let password = req.body.password;

    let flag = true;

    User.find({},(err,foundUsers)=>{
        for(let user of foundUsers){
            if(user.username==username){
                flag = false;
                res.redirect("/signup");
                break;
            }
        }

        if(flag){
            let otpSent = (Math.floor(Math.random() * 10000) + 10000).toString().substring(1);

            var transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                  user: process.env.ADMINEMAIL,
                  pass: process.env.ADMINPWD
                }
              });
              
              var mailOptions = {
                from: process.env.ADMINEMAIL,
                to: username,
                subject: "OTP Verification for QuotesArena",
                text: otpSent
              };
              
              transporter.sendMail(mailOptions, function(error, info){
                if (error) {
                  console.log(error);
                }
              });

            globalUsername = username;
            globalPassword = password;
            globalOtpSent = otpSent;

            res.redirect("/otp");
        }
   });
});

app.get("/otp", (req, res) => {
    res.render("otp");
});

app.post("/otp",(req,res)=>{
    let otpReceived = req.body.otpReceived;

    if(otpReceived==globalOtpSent){
        User.register(new User({ username: globalUsername }), globalPassword, (err, user) => {
            if (err) {
                console.log(err);
                return res.render("otp");
            }else{
                res.redirect("/login");
            }
        });
    }else{
        res.redirect("/signup");
    }
});

app.post("/resendotp",(req,res)=>{
    let otpSent = (Math.floor(Math.random() * 10000) + 10000).toString().substring(1);

    var transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.ADMINEMAIL,
          pass: process.env.ADMINPWD
        }
      });
      
      var mailOptions = {
        from: process.env.ADMINEMAIL,
        to: globalUsername,
        subject: "OTP Verification for QuotesArena",
        text: otpSent
      };
      
      transporter.sendMail(mailOptions, function(error, info){
        if (error) {
          console.log(error);
        }
      });

    globalOtpSent = otpSent;

    res.redirect("/otp");

});

app.post("/login", passport.authenticate("local", {
    successRedirect: "/userpage",
    failureRedirect: "/login"
}));

app.post("/deleteAcc",(req,res)=>{
    let username = req.body.email;

    User.findOne({username:username},(err,user)=>{    
        let quotesIdArray = [];

        for(let quote of user.quotes){
            quotesIdArray.push(quote._id);
        }

        for(let quote of quotesIdArray){
            Quote.findOneAndDelete({id2:quote},(err)=>{
                if(err){
                    console.log(err);
                }
            });
        }
    });

    User.findOneAndDelete({username:username},(err,data)=>{
        if(err){
            console.log(err);
        }
    });

    res.redirect("/");
});

app.listen(process.env.PORT || 3000, () => {
    console.log("Server started on port 3000!!");
});
