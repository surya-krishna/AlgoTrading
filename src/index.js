// const fs = require('fs');
// const https = require('https');
const express = require('express');

const helpers = require('./helpers');
const backtest = require('./backtest');
const service = require('./service');


const app = express();

// - uncomment this section to run the server in https -
// ===================== HTTPS =========================
// const server = https.createServer({
//   key: fs.readFileSync('./certs/localhost.key'),
//   cert: fs.readFileSync('./certs/localhost.cert'),
//   requestCerts: false,
//   rejectUnauthorized: false,
// }, app);
// =====================================================

/**
 * GET /
 *
 * This checks the API status
 */
app.get('/', (req, res) => res.send('OK'));

/**
 * GET /login
 *
 * Use this API to login to Kite.
 * On calling this API you will be redirected to the Kite login page
 * where you will enter your username/password and go through the 2FA login process
 * and upon successful login Kite will automatically redirect you to your app's redirect callback url
 */
app.get('/login', (req, res) => {
  helpers.log('Kite Login');
  res.redirect(helpers.getLoginUrl());
});

/**
 * GET /login/callback
 *
 * This API will be automatically called by Kite and upon successful login you will receive a request_token
 * in the query parameter which can be used to generate a session with Kite server.
 */
app.get('/login/callback', async (req, res) => {
  try {
    const { status, request_token } = req.query;

    if (status !== 'success') {
      return res.status(401).send('Unauthorized');
    }

    // try to generate a session
    const session = await helpers.generateSession(request_token);
    const successMessage = `${session.user_name} logged in successfully at ${session.login_time}`;

    helpers.log(successMessage);

    // download today's instruments
    await helpers.downloadInstruments();
    await helpers.getInstruments();
    service.startTicker();

    return res.send(successMessage);
  } catch (err) {
    helpers.log(err);
    return res.status(400).send(`Error: ${err.message}`);
  }
});

/**
 * GET /backtest?year=2018&shouldDownload=yes
 *
 * This endpoint will start the backtest algorithm and will return the results
 * which includes the yearly and monthly returns as well as all the trades that the algo found for the year
 */
app.get('/backtest', async (req, res) => {
  try {
    const { year, shouldDownload } = req.query;
    const results = await backtest(year, !!shouldDownload);

    return res.send(results);
  } catch (err) {
    helpers.log(err);
    return res.status(400).send(`Error: ${err.message}`);
  }
});


app.get('/report',async (req,res) =>{
  try{
   return service.getReport();
  } 
  catch(err)
  {
    return res.status(400).send(`Error: ${err.message}`);
  } 
});


app.get('/orders',async (req,res) =>{
  try{
   return service.getOrders();
  } 
  catch(err)
  {
    return res.status(400).send(`Error: ${err.message}`);
  } 
});


app.get('/getCandles',async (req,res) =>{
  try{
   return service.getCandles();
  } 
  catch(err)
  {
    return res.status(400).send(`Error: ${err.message}`);
  } 
});


app.get('/getOhlc',async (req,res) =>{
  try{
   var ohlc = service.getPrevOHLC().then((result) =>{
    return res.status(200).send(result);  
   }).catch((err)=>{
      helpers.log(err);
      console.log(err);
   });
   console.log(ohlc);
   return ohlc;
  } 
  catch(err)
  {
    return res.status(400).send(`Error: ${err.message}`);
  } 
});

app.get('/sendMail',async (req,res) =>{
  try{
   return service.sendMail("TCS","**********");
  } 
  catch(err)
  {
    return res.status(400).send(`Error: ${err.message}`);
  } 
});


app.listen(8080, () => helpers.log('Server is listening on port 8080'));
