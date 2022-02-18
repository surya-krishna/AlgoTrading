
const helpers = require('./helpers');
var KiteTicker = require("kiteconnect").KiteTicker;
var nodemailer = require('nodemailer');


var transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: ,
      pass: 
    }
  });
/*


 [{   
 *    tradable: true,
 *    mode: 'full',
 *    instrument_token: 208947,
 *    last_price: 3939,
 *    last_quantity: 1,
 *    average_price: 3944.77,
 *    volume: 28940,
 *    buy_quantity: 4492,
 *    sell_quantity: 4704,
 *    ohlc: { open: 3927, high: 3955, low: 3927, close: 3906 },
 *    change: 0.8448540706605223,
 *    last_trade_time: 1515491369,
 *    timestamp: 1515491373,
 *    oi: 24355,
 *    oi_day_high: 0,
 *    oi_day_low: 0
 *	}, ...]
 *


*/ 

var fiveMinData={};
/* Previous day OHLC need an api to populate this data */
var previousOHLC;
var instSymMap={};
/**
 * previous day breakout orders list
 * Buy strategy
 *  if price cross previous high buy that and hold
 *  if it falls bellow low of previous candle sell
 * Sell Strategy
 *  if price cross previous low sell that and hold
 *  if it raises above previous high buy
 */
var pdbOrders={};
/**
 * open orders from previous day analysis
 * Buy Strategy
 *  if price cross 0.3% profit sell
 *  stoploss change to 5 min candle low
 * Sell starategy
 *  if price falls to 0.3% profit buy
 *  stoploss change to 5 min candle High
 */
var openOrderList=[];
/**
 * opening range break out
 * Buy strategy
 *  if open==low buy with stoploss as low
 *  margin as candle high to low
 * Sell Strategy
 *  if open==high sell with stoploss as high
 *  margin as candle high to low
 */
var openOrders={};
var orbOrders={}; 

var tradeStats={

    openOrder:{
        profit:0,
        loss:0,
        profitTrades:0,
        lossTrades:0
    },
    pdbOrder:{
        profit:0,
        loss:0,
        profitTrades:0,
        lossTrades:0
    },
    orbOrder:{
        profit:0,
        loss:0,
        profitTrades:0,
        lossTrades:0
    }
}


function startTicker(){

    var ticker = new KiteTicker({
        api_key: "api_key",
        access_token: "access_token"
    });


    ticker.connect();
    ticker.on('ticks', onTicks);
    ticker.on('connect', subscribe);
    ticker.on('disconnect', onDisconnect);
    ticker.on('error', onError);
    ticker.on('close', onClose);
    ticker.on('order_update', onTrade);
}


function onTicks(ticks) {
    console.log("Ticks", ticks);
    for(var i in ticks){
        var tick = ticks[i];
        populateCandleData(tick);
    }
}



function populateCandleData(tick){
    var time = (new Date(tick.timestamp)).toLocaleString();
    var hour = time.split(" ")[1].split(":")[0];
    var minute = time.split(" ")[1].split(":")[1];

    if(fiveMinData[tick.instrument_token]==undefined){
      var candle={
            open:tick.last_price,
            close:tick.last_price,
            high:tick.last_price,
            low:tick.last_price,
            volume:tick.volume,
            buy_quantity:tick.buy_quantity,
            sell_quantity:tick.sell_quantity,
            timestamp:time,
            lastUpdated:time,
            candleFormed:0
        };
        fiveMinData[tick.instrument_token]={
            candles:[],
            lastUpdatedMinute:minute,
            candlesCount:1
        };
        fiveMinData[tick.instrument_token].candles.push(candle);
        if(openOrderList[tick.instrument_token]=="Buy"){
            //executeBuy()
            openOrders[tick.instrument_token]={
                candle:null,
                orderType:"Buy",
                orderQuantity:1,
                orderPrice:tick.last_price,
                squaredPrice:0,
                stoploss:previousOHLC[pdbParams.token].low,
                target:((tick.last_price*0.3)/100),
                timestamp:time,
                squaredOffTime:null,
                squaredOff:0    
            }
        }
        else
        if(openOrderList[tick.instrument_token]=="Sell"){
            //executeSell()
            openOrders[tick.instrument_token]={
                candle:null,
                orderType:"Sell",
                orderQuantity:1,
                orderPrice:tick.last_price,
                squaredPrice:0,
                stoploss:previousOHLC[tick.instrument_token].high,
                target:((tick.last_price*0.3)/100),
                timestamp:time,
                squaredOffTime:null,
                squaredOff:0    
            }
        }
    }
    else{
        var candlesData=fiveMinData[tick.instrument_token];
        var params={
            candle:candlesData.candlesCount>1?candlesData.candle[candlesData.candlesCount-2]:undefined,
            token:tick.instrument_token,
            lastPrice:tick.last_price,
            timeStamp:time
        }
        squareOffPdbStopLoss(params);
        squareOffOrbStopLoss(params);
        squareOffOpenOrders(params);
        if(candlesData.lastUpdatedMinute!=minute && minute%5==0){

            params.candle=candlesData.candle[candlesData.candlesCount-1];
            candlesData.candle[candlesData.candlesCount-1].candleFormed=1;
            
            if(openOrders[tick.instrument_token]!=undefined){
                openOrders[tick.instrument_token].candle=candlesData.candle[candlesData.candlesCount-1];
            }
            pdbAnalysis(params);
            if(candlesData.candlesCount==0)
                orbStockList(params);
            candlesData.lastUpdatedMinute=minute;
            candle={
                open:tick.last_price,
                close:tick.last_price,
                high:tick.last_price,
                low:tick.last_price,
                volume:tick.volume,
                buy_quantity:tick.buy_quantity,
                sell_quantity:tick.sell_quantity,
                timestamp:time,
                lastUpdated:time,
                candleFormed:0
            };
            candlesData.candles.push(candle); 
            candlesData.candlesCount+=1; 
        }
        else{
            candle=candlesData.candles[candlesData.candlesCount-1];
            candle.close = tick.last_price;
            candle.high = candle.high<tick.last_price?tick.last_price:candle.high;
            candle.low = candle.low>tick.last_price?tick.last_price:candle.low;
            candle.volume += tick.volume;
            candle.buy_quantity += tick.buy_quantity;
            candle.sell_quantity += tick.sell_quantity;
            candle.lastUpdated = time;
        }
    }
}




/**
 * 
 * params={
            candle:candlesData.candlesCount>1?candlesData.candle[candlesData.candlesCount-2]:undefined,
            token:tick.instrument_token,
            lastPrice:tick.last_price,
            timeStamp:time
        }
 * 
 *  openOrders[tick.instrument_token]={
                orderType:"Sell",
                orderQuantity:1,
                orderPrice:tick.last_price,
                squaredPrice:0,
                stoploss:previousOHLC[tick.instrument_token].high,
                target:((tick.last_price*0.3)/100),
                timestamp:time,
                squaredOffTime:null,
                squaredOff:0    
            }
 * 
 * 
*/
function squareOffOpenOrders(params){
    if(openOrders[params.token]!=undefined){
        if(openOrders[params.token].orderType=="Sell"){
            if(openOrders[params.token].target<=openOrders[params.token].orderPrice-params.lastPrice||openOrders[params.token].stoploss<=params.lastPrice){
                //executeBuy();
                openOrders[params.token].squaredPrice=params.lastPrice;
                openOrders[params.token].squaredOffTime=params.timeStamp;                      
                openOrders[params.token].squaredOff=1;
                if(openOrders[params.token].orderPrice-params.lastPrice>0){
                    tradeStats.openOrder.profit+=openOrders[params.token].orderPrice-params.lastPrice;
                    tradeStats.openOrder.profitTrades+=1;
                }
                else{
                    tradeStats.openOrder.loss+=params.lastPrice-openOrders[params.token].orderPrice;
                    tradeStats.openOrder.lossTrades+=1;
                }
            }
            else{
                openOrders[params.token].stoploss=openOrders[params.token].candle.high;
            }
        }
        else
        if(openOrders[params.token].orderType=="Buy"){
            if(openOrders[params.token].target<=params.lastPrice-openOrders[params.token].orderPrice||openOrders[params.token].stoploss>=params.lastPrice){
                //executeBuy();
                openOrders[params.token].squaredPrice=params.lastPrice;
                openOrders[params.token].squaredOffTime=params.timeStamp;                      
                openOrders[params.token].squaredOff=1;
                if(params.lastPrice-openOrders[params.token].orderPrice>0){
                    tradeStats.openOrder.profit+=params.lastPrice-openOrders[params.token].orderPrice;
                    tradeStats.openOrder.profitTrades+=1;
                }
                else{
                    tradeStats.openOrder.loss+=openOrders[params.token].orderPrice-params.lastPrice;
                    tradeStats.openOrder.lossTrades+=1;
                }
            }
            else{
                openOrders[params.token].stoploss=openOrders[params.token].candle.low;
            }
        }
    }
}


function pdbAnalysis(pdbParams){

    if(previousOHLC==undefined){
        previousOHLC=helpers.getOHLCData();
        instSymMap=helpers.getInstSymMap();
    }
    if(instSymMap!=undefined){
    if(previousOHLC[instSymMap[pdbParams.token]].High<pdbParams.candle.close){
        buyPdb(pdbParams);
        sendMail(instSymMap[pdbParams.token],"pdbAnalysis-buy-"+pdbParams.token);
    } 
    else
    if(previousOHLC[instSymMap.token].Low>pdbParams.candle.close){
        sellPdb(pdbParams);
        sendMail(instSymMap[pdbParams.token],"pdbAnalysis-sell-"+pdbParams.token);
    }
    }
}


function buyPdb(pdbParams){
    if(pdbOrders[token]==undefined&&pdbParams.candle.candleFormed==1){
        pdbOrders[token]={
            candleCrossed:pdbParams.candle,
            previousCandle:pdbParams.candle,
            orderType:"Buy",
            orderQuantity:1,
            orderPrice:pdbParams.lastPrice,
            squaredPrice:0,
            timestamp:pdbParams.timestamp,
            squaredOffTime:null,
            squaredOff:0
        }
        //executeBuy(token);
    }
}

function sellPdb(pdbParams){
    if(pdbOrders[pdbParams.token]==undefined&&pdbParams.candle.candleFormed==1){
        pdbOrders[pdbParams.token]={
            candleCrossed:pdbParams.candle,
            previousCandle:pdbParams.candle,
            orderType:"Sell",
            orderQuantity:1,
            orderPrice:pdbParams.lastPrice,
            squaredPrice:0,
            timestamp:pdbParams.timestamp,
            squaredOffTime:null,
            squaredOff:0
        }
        //executeSell(token);
    }
}

function orbStockList(orbParams){
    if(orbOrders[orbParams.token]==undefined&&orbParams.candle.candleFormed==1){
        var candle=orbParams.candle;
            if(candle.open==candle.high){
                sendMail(instSymMap[pdbParams.token],"orbAnalysis-sell-"+pdbParams.token);
                orbOrders[orbParams.token]={
                candleCrossed:orbParams.candle,
                previousCandle:orbParams.candle,
                orderType:"Sell",
                orderQuantity:1,
                orderPrice:orbParams.lastPrice,
                squaredPrice:0,
                timestamp:orbParams.timestamp,
                squaredOffTime:null,
                target:orbParams.candle.high-orbParams.candle.low,
                stopLoss:orbParams.candle.high,
                orderExecuted:0,
                squaredOff:0
            }
        }
            else
            if(candle.open==candle.low){
                sendMail(instSymMap[pdbParams.token],"orbAnalysis-buy-"+pdbParams.token);
                orbOrders[orbParams.token]={
                candleCrossed:orbParams.candle,
                previousCandle:orbParams.candle,
                orderType:"Buy",
                orderQuantity:1,
                orderPrice:orbParams.lastPrice,
                squaredPrice:0,
                timestamp:orbParams.timestamp,
                squaredOffTime:null,
                target:orbParams.candle.high-orbParams.candle.low,
                stopLoss:orbParams.candle.low,
                orderExecuted:0,
                squaredOff:0
            }
        }
    }
}


function squareOffPdbStopLoss(pdbParams){
    if(pdbOrders[pdbParams.token]==undefined&&pdbOrders[pdbParams.token].squaredOff==0){
        var order=pdbOrders[pdbParams.token];
        if(order.orderType=="Buy"){
            if(order.previousCandle.low>pdbParams.lastPrice){
                //executeSell(token);
                order.squaredPrice=pdbParams.lastPrice;
                order.squaredOffTime=pdbParams.timestamp;
                order.squaredOff=1;
                
                if(pdbParams.lastPrice-order.orderPrice>0){
                    tradeStats.pdbOrder.profit+=pdbParams.lastPrice-order.orderPrice;
                    tradeStats.pdbOrder.profitTrades+=1;
                }
                else{
                    tradeStats.pdbOrder.loss+=order.orderPrice-pdbParams.lastPrice;
                    tradeStats.pdbOrder.lossTrades+=1;
                }
            }
            else{
                order.previousCandle=pdbParams.candle;
            }
        }
        else
        if(order.orderType=="Sell"){
            if(order.previousCandle.high<pdbParams.lastPrice){
                //executeBuy(token);
                order.squaredPrice=pdbParams.lastPrice;
                order.squaredOffTime=pdbParams.timestamp;
                order.squaredOff=1;
                
                if(order.orderPrice-pdbParams.lastPrice>0){
                    tradeStats.pdbOrder.profit+=order.orderPrice-pdbParams.lastPrice;
                    tradeStats.pdbOrder.profitTrades+=1;
                }
                else{
                    tradeStats.pdbOrder.loss+=pdbParams.lastPrice-order.orderPrice;
                    tradeStats.pdbOrder.lossTrades+=1;
                }
            }
            else{
                order.previousCandle=pdbParams.candle;
            }
        }
    }
}


/*
  var pdbParams={
            candle:candlesData.candle[candlesData.candlesCount-1],
            token:tick.instrument_token,
            lastPrice:tick.last_price,
            timeStamp:time
    }

    orbOrders[pdbParams.token]={
                candleCrossed:pdbParams.candle,
                previousCandle:pdbParams.candle,
                orderType:"Sell",
                orderQuantity:1,
                orderPrice:pdbParams.lastPrice,
                squaredPrice:0,
                timestamp:pdbParams.timestamp,
                squaredOffTime:null,
                target:pdbParams.candle.high-pdbParams.candle.low,
                stopLoss:pdbParams.candle.high,
                orderExecuted:0,
                squaredOff:0
            }
 */

function squareOffOrbStopLoss(ordParams){
    if(orbOrders[ordParams.token]!=undefined&&orbOrders[ordParams.token].orderExecuted==0){
        var candle=orbOrders[ordParams.token].candleCrossed;
        if( orbOrders[ordParams.token].orderType=='Sell' && candle.low==ordParams.lastPrice){
            sellOrbOrder(ordParams);
        }
        else
        if(orbOrders[ordParams.token].orderType=='Buy' && candle.high==ordParams.lastPrice){
            buyOrbOrder(ordParams);
        }
    }
    else
    if(orbOrders[ordParams.token]!=undefined&&orbOrders[ordParams.token].squaredOff==0){
        
        if(orbOrders[ordParams.token].orderType=='Sell'){
            if(orbOrders[ordParams.token].orderPrice-ordParams.lastPrice>=orbOrders[ordParams.token].target||orbOrders[ordParams.token].stopLoss<=ordParams.lastPrice){
            //executeBuy();
            orbOrders[ordParams.token].squaredPrice=ordParams.lastPrice;
            orbOrders[ordParams.token].squaredOffTime=ordParams.timestamp;
            orbOrders[ordParams.token].squaredOff=1;
            if(orbOrders[ordParams.token].orderPrice-ordParams.lastPrice>0){
                tradeStats.orbOrder.profit+=orbOrders[ordParams.token].orderPrice-ordParams.lastPrice;
                tradeStats.orbOrder.profitTrades+=1;
            }
            else{
                tradeStats.orbOrder.loss+=ordParams.lastPrice-orbOrders[ordParams.token].orderPrice;
                tradeStats.orbOrder.lossTrades+=1;
            }
            }
            else
            {
                orbOrders[ordParams.token].previousCandle=ordParams.candle;
            }
        }
        else
        if(orbOrders[ordParams.token].orderType=='Buy'){
            if(ordParams.lastPrice-orbOrders[ordParams.token].orderPrice>=orbOrders[ordParams.token].target||orbOrders[ordParams.token].stopLoss>=ordParams.lastPrice){
            //executeSell();
            orbOrders[ordParams.token].squaredPrice=ordParams.lastPrice;
            orbOrders[ordParams.token].squaredOffTime=ordParams.timestamp;
            orbOrders[ordParams.token].squaredOff=1;
            
            if(ordParams.lastPrice-orbOrders[ordParams.token].orderPrice>0){
                tradeStats.orbOrder.profit+=ordParams.lastPrice-orbOrders[ordParams.token].orderPrice;
                tradeStats.orbOrder.profitTrades+=1;
            }
            else{
                tradeStats.orbOrder.loss+=orbOrders[ordParams.token].orderPrice-ordParams.lastPrice;
                tradeStats.orbOrder.lossTrades+=1;
            }
            }
            else
            {
                orbOrders[ordParams.token].previousCandle=ordParams.candle;
            }
        }
    }
}


function sellOrbOrder(pdbParams){
    if(orbOrders[pdbParams.token].orderExecuted==0){
        //executeSell();
        orbOrders[pdbParams.token].orderExecuted=1;
        orbOrders[pdbParams.token].previousCandle=pdbParams.candel;
        orbOrders[pdbParams.token].timestamp=pdbParams.timestamp;
    }
}


function buyOrbOrder(pdbParams){
    if(orbOrders[pdbParams.token].orderExecuted==0){
        //executeBuy();
        orbOrders[pdbParams.token].orderExecuted=1;
        orbOrders[pdbParams.token].previousCandle=pdbParams.candel;
        orbOrders[pdbParams.token].timestamp=pdbParams.timestamp;
    }
}

function getCandleData(){
    return fiveMinData;
}

function getOrders(){
    var orders={
        pdbData:pdbOrders,
        orbData:orbOrders,
        openData:openOrders
    }
    return orders;
}

function subscribe() {
	var items = [738561];
	ticker.subscribe(items);
	ticker.setMode(ticker.quote, items);
}


function getReport(){
    return tradeStats;
}

function onDisconnect(error) {
	console.log("Closed connection on disconnect", error);
}

function onError(error) {
	console.log("Closed connection on error", error);
}

function onClose(reason) {
	console.log("Closed connection on close", reason);
}

function onTrade(order) {
    console.log("Order update", order);
}
async function getPrevOHLC(){
    return await helpers.getOHLCData();
}

function sendMail(symbol,analysis){
  var mailOptions = {
    from: 
    to: 
    subject: 'Trigger',
    text: symbol+" "+analysis
  };
  
  transporter.sendMail(mailOptions, function(error, info){
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  });
}
module.exports = {
    startTicker,
    getReport,
    getOrders,
    sendMail,
    getCandleData,
    getPrevOHLC
}

